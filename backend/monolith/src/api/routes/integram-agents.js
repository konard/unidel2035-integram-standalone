// integram-agents.js - Integram integration for Integram Agents
// Provides persistent storage for agent instances using Integram database

import express from 'express'
import logger from '../../utils/logger.js'

export function createIntegramAgentsIntegramRoutes() {
  const router = express.Router()

  // Import integraMCPClient dynamically to avoid circular dependencies
  let integraMCPClient = null

  async function getIntegram() {
    if (!integraMCPClient) {
      const module = await import('../../services/mcp/integraMCPClient.js')
      integraMCPClient = module.default
    }
    return integraMCPClient
  }

  /**
   * POST /api/drondoc-agents/integram/save
   * Save agent instance to Integram
   */
  router.post('/save', async (req, res) => {
    try {
      const { instance, serverUrl, database, userId } = req.body

      if (!instance) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: instance'
        })
      }

      logger.info('[Integram Agents Integram] Saving agent to Integram', {
        instanceName: instance.instanceName,
        agentId: instance.agentId,
        database
      })

      const integram = await getIntegram()

      // Authenticate with Integram
      const authResult = await integram.authenticate({
        serverUrl: serverUrl || 'https://example.integram.io',
        database: database || 'my',
        login: 'd',  // System user
        password: 'd'
      })

      if (!authResult.success) {
        throw new Error(`Integram authentication failed: ${authResult.error}`)
      }

      // Integram Agents table created via Integram MCP
      const TYPE_ID = 217788 // Integram Agents table

      // Requisite IDs for the table fields
      const REQUISITES = {
        INSTANCE_ID: '217790',
        AGENT_ID: '217792',
        ORGANIZATION_ID: '217794',
        STATUS: '217796',
        CONFIG_JSON: '217798',
        CUSTOM_CODE: '217800',
        AUTO_START: '217802',
        CREATED_BY: '217804',
        CREATED_AT: '217806',
        TABLES_DEPLOYED: '217808'
      }

      // Prepare agent data for Integram
      const agentData = {
        instanceId: instance.id,
        instanceName: instance.instanceName,
        agentId: instance.agentId,
        organizationId: instance.organizationId,
        status: instance.status || 'created',
        config: JSON.stringify(instance.config || {}),
        customCode: instance.customCode || '',
        autoStart: instance.autoStart ? 'true' : 'false',
        createdBy: instance.createdBy || userId || 'd',
        createdAt: new Date().toISOString(),
        tablesDeployed: String(instance.tablesDeployed || 0)
      }

      // Create object in Integram using requisite IDs
      const createResult = await integram.createObject({
        typeId: TYPE_ID,
        value: agentData.instanceName,
        requisites: {
          [REQUISITES.INSTANCE_ID]: agentData.instanceId,
          [REQUISITES.AGENT_ID]: agentData.agentId,
          [REQUISITES.ORGANIZATION_ID]: agentData.organizationId,
          [REQUISITES.STATUS]: agentData.status,
          [REQUISITES.CONFIG_JSON]: agentData.config,
          [REQUISITES.CUSTOM_CODE]: agentData.customCode,
          [REQUISITES.AUTO_START]: agentData.autoStart,
          [REQUISITES.CREATED_BY]: agentData.createdBy,
          [REQUISITES.CREATED_AT]: agentData.createdAt,
          [REQUISITES.TABLES_DEPLOYED]: agentData.tablesDeployed
        }
      })

      if (!createResult.success) {
        throw new Error(`Failed to create object in Integram: ${createResult.error}`)
      }

      logger.info('[Integram Agents Integram] Successfully saved agent', {
        integramId: createResult.id,
        instanceName: agentData.instanceName
      })

      res.json({
        success: true,
        data: {
          id: createResult.id,
          instanceId: agentData.instanceId,
          instanceName: agentData.instanceName,
          savedAt: agentData.createdAt
        }
      })
    } catch (error) {
      logger.error('[Integram Agents Integram] Save failed:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  /**
   * GET /api/drondoc-agents/integram/load
   * Load agent instances from Integram
   */
  router.get('/load', async (req, res) => {
    try {
      const { serverUrl, database, userId, organizationId, status } = req.query

      logger.info('[Integram Agents Integram] Loading agents from Integram', {
        database,
        userId,
        organizationId
      })

      const integram = await getIntegram()

      // Authenticate
      const authResult = await integram.authenticate({
        serverUrl: serverUrl || 'https://example.integram.io',
        database: database || 'my',
        login: 'd',
        password: 'd'
      })

      if (!authResult.success) {
        throw new Error(`Integram authentication failed: ${authResult.error}`)
      }

      const TYPE_ID = 217788 // Integram Agents table

      // Requisite IDs
      const REQUISITES = {
        INSTANCE_ID: '217790',
        AGENT_ID: '217792',
        ORGANIZATION_ID: '217794',
        STATUS: '217796',
        CONFIG_JSON: '217798',
        CUSTOM_CODE: '217800',
        AUTO_START: '217802',
        CREATED_BY: '217804',
        CREATED_AT: '217806',
        TABLES_DEPLOYED: '217808'
      }

      // Get all agent objects
      const listResult = await integram.getObjectList({
        typeId: TYPE_ID,
        params: {
          limit: 1000,  // Get all agents
          requisites: true
        }
      })

      if (!listResult.success) {
        throw new Error(`Failed to load objects from Integram: ${listResult.error}`)
      }

      // Parse and filter agents using requisite IDs
      const agents = listResult.list.map(obj => ({
        integramId: obj.id,
        instanceId: obj.requisites?.[REQUISITES.INSTANCE_ID] || obj.id,
        instanceName: obj.value,
        agentId: obj.requisites?.[REQUISITES.AGENT_ID],
        organizationId: obj.requisites?.[REQUISITES.ORGANIZATION_ID],
        status: obj.requisites?.[REQUISITES.STATUS] || 'created',
        config: obj.requisites?.[REQUISITES.CONFIG_JSON] ? JSON.parse(obj.requisites[REQUISITES.CONFIG_JSON]) : {},
        customCode: obj.requisites?.[REQUISITES.CUSTOM_CODE] || '',
        autoStart: obj.requisites?.[REQUISITES.AUTO_START] === 'true',
        createdBy: obj.requisites?.[REQUISITES.CREATED_BY],
        createdAt: obj.requisites?.[REQUISITES.CREATED_AT],
        tablesDeployed: parseInt(obj.requisites?.[REQUISITES.TABLES_DEPLOYED] || '0')
      }))

      // Apply filters
      let filteredAgents = agents

      if (userId) {
        filteredAgents = filteredAgents.filter(a => a.createdBy === userId)
      }

      if (organizationId) {
        filteredAgents = filteredAgents.filter(a => a.organizationId === organizationId)
      }

      if (status) {
        filteredAgents = filteredAgents.filter(a => a.status === status)
      }

      logger.info('[Integram Agents Integram] Loaded agents', {
        total: agents.length,
        filtered: filteredAgents.length
      })

      res.json({
        success: true,
        data: filteredAgents
      })
    } catch (error) {
      logger.error('[Integram Agents Integram] Load failed:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  /**
   * PUT /api/drondoc-agents/integram/:id
   * Update agent instance in Integram
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params
      const { updates, serverUrl, database } = req.body

      logger.info('[Integram Agents Integram] Updating agent', {
        integramId: id,
        updates: Object.keys(updates)
      })

      const integram = await getIntegram()

      // Authenticate
      const authResult = await integram.authenticate({
        serverUrl: serverUrl || 'https://example.integram.io',
        database: database || 'my',
        login: 'd',
        password: 'd'
      })

      if (!authResult.success) {
        throw new Error(`Integram authentication failed: ${authResult.error}`)
      }

      // Requisite IDs
      const REQUISITES = {
        STATUS: '217796',
        CONFIG_JSON: '217798',
        CUSTOM_CODE: '217800',
        AUTO_START: '217802',
        TABLES_DEPLOYED: '217808'
      }

      // Prepare requisites update using requisite IDs
      const requisites = {}

      if (updates.status) requisites[REQUISITES.STATUS] = updates.status
      if (updates.config) requisites[REQUISITES.CONFIG_JSON] = JSON.stringify(updates.config)
      if (updates.customCode !== undefined) requisites[REQUISITES.CUSTOM_CODE] = updates.customCode
      if (updates.autoStart !== undefined) requisites[REQUISITES.AUTO_START] = updates.autoStart ? 'true' : 'false'
      if (updates.tablesDeployed !== undefined) requisites[REQUISITES.TABLES_DEPLOYED] = String(updates.tablesDeployed)

      // Update object
      const updateResult = await integram.setObjectRequisites({
        objectId: id,
        requisites
      })

      if (!updateResult.success) {
        throw new Error(`Failed to update object in Integram: ${updateResult.error}`)
      }

      logger.info('[Integram Agents Integram] Successfully updated agent', {
        integramId: id
      })

      res.json({
        success: true,
        data: {
          id,
          updated: true
        }
      })
    } catch (error) {
      logger.error('[Integram Agents Integram] Update failed:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  /**
   * DELETE /api/drondoc-agents/integram/:id
   * Delete agent instance from Integram
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params
      const { serverUrl, database } = req.query

      logger.info('[Integram Agents Integram] Deleting agent', {
        integramId: id
      })

      const integram = await getIntegram()

      // Authenticate
      const authResult = await integram.authenticate({
        serverUrl: serverUrl || 'https://example.integram.io',
        database: database || 'my',
        login: 'd',
        password: 'd'
      })

      if (!authResult.success) {
        throw new Error(`Integram authentication failed: ${authResult.error}`)
      }

      // Delete object
      const deleteResult = await integram.deleteObject({
        objectId: id
      })

      if (!deleteResult.success) {
        throw new Error(`Failed to delete object from Integram: ${deleteResult.error}`)
      }

      logger.info('[Integram Agents Integram] Successfully deleted agent', {
        integramId: id
      })

      res.json({
        success: true,
        data: {
          id,
          deleted: true
        }
      })
    } catch (error) {
      logger.error('[Integram Agents Integram] Delete failed:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  return router
}

export default createIntegramAgentsIntegramRoutes
