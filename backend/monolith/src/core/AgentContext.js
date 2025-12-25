// AgentContext.js - Shared context for agent execution
import EventEmitter from 'events'

export class AgentContext extends EventEmitter {
  constructor(config = {}) {
    super()
    this.config = config
    this.logger = config.logger || this._createDefaultLogger()
    this.llmCoordinator = config.llmCoordinator || null
    this.mcpTools = config.mcpTools || null
    this.sharedState = new Map()
    this.activeAgents = new Map()
  }

  /**
   * Set LLM coordinator
   */
  setLLMCoordinator(coordinator) {
    this.llmCoordinator = coordinator
  }

  /**
   * Set MCP tools interface
   */
  setMCPTools(tools) {
    this.mcpTools = tools
  }

  /**
   * Get table data through MCP tools
   */
  async getTableData(tableIdentifier, options = {}) {
    if (!this.mcpTools) {
      throw new Error('MCP tools not configured')
    }
    return await this.mcpTools.getTable(tableIdentifier, options)
  }

  /**
   * Get complete table data with all pages
   */
  async getCompleteTableData(tableIdentifier, maxPages = 1000) {
    if (!this.mcpTools) {
      throw new Error('MCP tools not configured')
    }
    return await this.mcpTools.getCompleteTable(tableIdentifier, maxPages)
  }

  /**
   * Get list of tables
   */
  async getTables(dbName = 'A2025') {
    if (!this.mcpTools) {
      throw new Error('MCP tools not configured')
    }
    return await this.mcpTools.getTables(dbName)
  }

  /**
   * Update table row
   */
  async updateTableRow(tableIdentifier, rowId, data) {
    if (!this.mcpTools) {
      throw new Error('MCP tools not configured')
    }
    return await this.mcpTools.updateTableRow(tableIdentifier, rowId, data)
  }

  /**
   * Create table row
   */
  async createTableRow(tableIdentifier, data) {
    if (!this.mcpTools) {
      throw new Error('MCP tools not configured')
    }
    return await this.mcpTools.createTableRow(tableIdentifier, data)
  }

  /**
   * Delete table row
   */
  async deleteTableRow(tableIdentifier, rowId) {
    if (!this.mcpTools) {
      throw new Error('MCP tools not configured')
    }
    return await this.mcpTools.deleteTableRow(tableIdentifier, rowId)
  }

  /**
   * Call LLM through coordinator
   */
  async callLLM(prompt, options = {}) {
    if (!this.llmCoordinator) {
      throw new Error('LLM coordinator not configured')
    }
    return await this.llmCoordinator.chat(prompt, options)
  }

  /**
   * Set shared state value
   */
  setState(key, value) {
    this.sharedState.set(key, value)
    this.emit('state:changed', { key, value })
  }

  /**
   * Get shared state value
   */
  getState(key) {
    return this.sharedState.get(key)
  }

  /**
   * Check if shared state has key
   */
  hasState(key) {
    return this.sharedState.has(key)
  }

  /**
   * Delete shared state value
   */
  deleteState(key) {
    this.sharedState.delete(key)
    this.emit('state:deleted', { key })
  }

  /**
   * Clear all shared state
   */
  clearState() {
    this.sharedState.clear()
    this.emit('state:cleared')
  }

  /**
   * Register an active agent
   */
  registerAgent(agentId, agent) {
    this.activeAgents.set(agentId, agent)
    this.emit('agent:registered', { agentId, agent })
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId) {
    const agent = this.activeAgents.get(agentId)
    this.activeAgents.delete(agentId)
    this.emit('agent:unregistered', { agentId, agent })
  }

  /**
   * Get active agent by ID
   */
  getAgent(agentId) {
    return this.activeAgents.get(agentId)
  }

  /**
   * Get all active agents
   */
  getAllAgents() {
    return Array.from(this.activeAgents.values())
  }

  /**
   * Broadcast message to all agents
   */
  broadcast(event, data) {
    this.emit(`broadcast:${event}`, data)
  }

  /**
   * Create default logger if none provided
   * @private
   */
  _createDefaultLogger() {
    const log = (level, message, data = null) => {
      const timestamp = new Date().toISOString()
      const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}`
      // console.log(logEntry, data || '')
    }

    return {
      info: (msg, data) => log('info', msg, data),
      error: (msg, data) => log('error', msg, data),
      warn: (msg, data) => log('warn', msg, data),
      debug: (msg, data) => log('debug', msg, data)
    }
  }

  /**
   * Cleanup context resources
   */
  async cleanup() {
    this.logger.info('Cleaning up AgentContext')
    this.clearState()
    this.activeAgents.clear()
    this.removeAllListeners()
  }
}
