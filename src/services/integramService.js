/**
 * Integram Service
 * Client-side service for legacy Integram operations
 *
 * This service provides a wrapper around integramApiClient
 * for components that use the old integramService API
 */

import integramApiClient from './integramApiClient'

class IntegramService {
  constructor() {
    this.authToken = null
    this.xsrfToken = null
    this.database = null
    this.serverUrl = 'https://dronedoc.ru'
    this.userId = null
    this.userName = null
    this.userRole = null
    this.authDatabase = null
  }

  // ========== Session Methods ==========

  /**
   * Set session from auth info
   */
  setSession({ token, xsrf, database, userId, userName, userRole }) {
    this.authToken = token
    this.xsrfToken = xsrf
    this.database = database
    this.userId = userId
    this.userName = userName
    this.userRole = userRole

    // Sync with integramApiClient
    integramApiClient.token = token
    integramApiClient.xsrfToken = xsrf
    integramApiClient.database = database
    integramApiClient.currentDatabase = database
    integramApiClient.userId = userId
    integramApiClient.userName = userName
    integramApiClient.userRole = userRole
  }

  /**
   * Load session from localStorage
   */
  loadSession() {
    integramApiClient.tryRestoreSession()

    // Sync from integramApiClient
    this.authToken = integramApiClient.token
    this.xsrfToken = integramApiClient.xsrfToken
    this.database = integramApiClient.database
    this.userId = integramApiClient.userId
    this.userName = integramApiClient.userName
    this.userRole = integramApiClient.userRole
  }

  /**
   * Save session to localStorage
   */
  saveSession() {
    integramApiClient.saveSession()
  }

  /**
   * Check if authenticated
   */
  isAuthenticated() {
    return !!(this.authToken && this.xsrfToken)
  }

  /**
   * Set server URL
   */
  setServer(url) {
    this.serverUrl = url
    integramApiClient.setServer(url)
  }

  /**
   * Set database
   */
  setDatabase(database) {
    this.database = database
    integramApiClient.setDatabase(database)
  }

  // ========== Dictionary & Type Methods ==========

  /**
   * Get dictionary
   */
  async getDictionary() {
    return await integramApiClient.getDictionary()
  }

  /**
   * Get metadata for a type
   */
  async getMetadata(typeId) {
    return await integramApiClient.getTypeMetadata(typeId)
  }

  // ========== Object Methods ==========

  /**
   * Get objects for a type
   */
  async getObjects(typeId, params = {}) {
    const response = await integramApiClient.getObjectList(typeId, params)

    // Transform to legacy format
    return {
      list: response.object || [],
      type: response.type,
      reqs: response.reqs,
      totalCount: response.totalCount
    }
  }

  /**
   * Get single object
   */
  async getObject(objectId) {
    const data = await integramApiClient.getObjectEditData(objectId)
    return data.obj || data
  }

  /**
   * Get edit object data
   */
  async getEditObject(objectId, tab = null) {
    return await integramApiClient.getObjectEditData(objectId)
  }

  /**
   * Create object
   */
  async createObject(typeId, value, requisites = {}, parentId = null) {
    return await integramApiClient.createObject(typeId, value, requisites, parentId)
  }

  /**
   * Save object
   */
  async saveObject(objectId, data) {
    // Extract value and requisites from data
    const value = data.value || data.val || ''
    const requisites = {}

    // Extract requisite fields (keys starting with 't')
    for (const [key, val] of Object.entries(data)) {
      if (key.startsWith('t')) {
        requisites[key] = val
      }
    }

    return await integramApiClient.saveObject(objectId, data.typeId || data.typ, value, requisites)
  }

  /**
   * Update object requisites
   */
  async updateObject(objectId, requisites) {
    return await integramApiClient.setObjectRequisites(objectId, requisites)
  }

  /**
   * Set requisites
   */
  async setRequisites(objectId, requisites) {
    return await integramApiClient.setObjectRequisites(objectId, requisites)
  }

  /**
   * Delete object
   */
  async deleteObject(objectId) {
    return await integramApiClient.deleteObject(objectId)
  }

  // ========== Reference Methods ==========

  /**
   * Get reference options
   */
  async getReferenceOptions(requisiteId, objectId, restrict = null, query = '') {
    return await integramApiClient.getReferenceOptions(requisiteId, objectId, restrict, query)
  }

  // ========== Report Methods ==========

  /**
   * Execute report
   */
  async executeReport(reportId, params = {}) {
    return await integramApiClient.post(`/execute-report/${reportId}`, params)
  }

  /**
   * Create report
   */
  async createReport(name, options = {}) {
    return await integramApiClient.post('/create-report', {
      name,
      ...options
    })
  }

  /**
   * Add report FROM table
   */
  async addReportFrom(reportId, tableId, alias = null, joinOn = null) {
    return await integramApiClient.post(`/add-report-from/${reportId}`, {
      tableId,
      alias,
      joinOn
    })
  }

  /**
   * Add report column
   */
  async addReportColumn(reportId, columnData) {
    return await integramApiClient.post(`/add-report-column/${reportId}`, columnData)
  }

  // ========== Generic HTTP Methods ==========

  /**
   * Generic POST request
   */
  async post(endpoint, data = {}) {
    return await integramApiClient.post(endpoint, data)
  }

  /**
   * Generic GET request
   */
  async get(endpoint, params = {}) {
    return await integramApiClient.get(endpoint, params)
  }
}

// Create singleton instance
const integramService = new IntegramService()

export default integramService
