/**
 * Integram Service
 * Handles Integram API authentication, session management, and data operations
 */

import axios from 'axios'

class IntegramService {
  constructor() {
    this.serverURL = ''
    this.database = ''
    this.authToken = ''
    this.xsrfToken = ''
    this.userId = null
    this.userName = ''
    this.userRole = ''
    this.authDatabase = '' // Database used for authentication
    this.apiClient = null
  }

  /**
   * Set server URL
   */
  setServer(url) {
    this.serverURL = url.replace(/\/$/, '') // Remove trailing slash
  }

  /**
   * Set active database
   */
  setDatabase(db) {
    this.database = db
  }

  /**
   * Set session data
   */
  setSession(session) {
    this.authToken = session.token || ''
    this.xsrfToken = session.xsrf || ''
    this.database = session.database || ''
    this.userId = session.userId || null
    this.userName = session.userName || ''
    this.userRole = session.userRole || ''
    this.authDatabase = session.authDatabase || session.database || ''
    if (session.serverURL) {
      this.setServer(session.serverURL)
    }
  }

  /**
   * Save session to localStorage
   */
  saveSession() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('integram_token', this.authToken)
      localStorage.setItem('integram_xsrf', this.xsrfToken)
      localStorage.setItem('integram_database', this.database)
      localStorage.setItem('integram_server', this.serverURL)
      localStorage.setItem('integram_userId', this.userId?.toString() || '')
      localStorage.setItem('integram_userName', this.userName)
      localStorage.setItem('integram_userRole', this.userRole)
      localStorage.setItem('integram_authDatabase', this.authDatabase)
    }
  }

  /**
   * Load session from localStorage
   */
  loadSession() {
    if (typeof localStorage !== 'undefined') {
      this.authToken = localStorage.getItem('integram_token') || ''
      this.xsrfToken = localStorage.getItem('integram_xsrf') || ''
      this.database = localStorage.getItem('integram_database') || ''
      this.serverURL = localStorage.getItem('integram_server') || ''
      this.userId = parseInt(localStorage.getItem('integram_userId') || '0') || null
      this.userName = localStorage.getItem('integram_userName') || ''
      this.userRole = localStorage.getItem('integram_userRole') || ''
      this.authDatabase = localStorage.getItem('integram_authDatabase') || this.database
    }
  }

  /**
   * Clear session
   */
  clearSession() {
    this.authToken = ''
    this.xsrfToken = ''
    this.database = ''
    this.userId = null
    this.userName = ''
    this.userRole = ''
    this.authDatabase = ''
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('integram_token')
      localStorage.removeItem('integram_xsrf')
      localStorage.removeItem('integram_database')
      localStorage.removeItem('integram_userId')
      localStorage.removeItem('integram_userName')
      localStorage.removeItem('integram_userRole')
      localStorage.removeItem('integram_authDatabase')
    }
  }

  /**
   * Check if authenticated
   */
  isAuthenticated() {
    return !!(this.authToken && this.xsrfToken && this.database)
  }

  /**
   * Get API headers
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authToken}`,
      'X-XSRF-TOKEN': this.xsrfToken,
      'X-Database': this.database
    }
  }

  /**
   * Make API request
   */
  async request(method, endpoint, data = null, params = null) {
    const url = `${this.serverURL}/api/${endpoint}`
    const config = {
      method,
      url,
      headers: this.getHeaders(),
      params
    }
    if (data) {
      config.data = data
    }
    try {
      const response = await axios(config)
      return response.data
    } catch (error) {
      console.error(`Integram API error (${method} ${endpoint}):`, error)
      throw error
    }
  }

  /**
   * POST request
   */
  async post(endpoint, data = null, params = null) {
    return this.request('POST', endpoint, data, params)
  }

  /**
   * GET request
   */
  async get(endpoint, params = null) {
    return this.request('GET', endpoint, null, params)
  }

  /**
   * Get dictionary (list of types/tables)
   */
  async getDictionary() {
    return this.get('dictionary')
  }

  /**
   * Get type metadata
   */
  async getMetadata(typeId) {
    return this.get(`metadata/${typeId}`)
  }

  /**
   * Get objects list
   */
  async getObjects(typeId, params = {}) {
    return this.get(`objects/${typeId}`, params)
  }

  /**
   * Get single object
   */
  async getObject(objectId) {
    return this.get(`object/${objectId}`)
  }

  /**
   * Get object edit data
   */
  async getEditObject(objectId, tab = null) {
    const params = tab ? { tab } : {}
    return this.get(`object/${objectId}/edit`, params)
  }

  /**
   * Create object
   */
  async createObject(typeId, data) {
    return this.post('object/create', { typeId, ...data })
  }

  /**
   * Save/update object
   */
  async saveObject(objectId, data) {
    return this.post(`object/${objectId}/save`, data)
  }

  /**
   * Update object (alias for saveObject)
   */
  async updateObject(objectId, data) {
    return this.saveObject(objectId, data)
  }

  /**
   * Delete object
   */
  async deleteObject(objectId) {
    return this.post(`object/${objectId}/delete`)
  }

  /**
   * Set object requisites
   */
  async setRequisites(objectId, requisites) {
    return this.post(`object/${objectId}/requisites`, requisites)
  }

  /**
   * Get reference options for dropdown
   */
  async getReferenceOptions(requisiteId, objectId = 0, query = '', restrict = null) {
    return this.get('reference/options', {
      requisiteId,
      objectId,
      query,
      restrict
    })
  }

  /**
   * Execute report
   */
  async executeReport(reportId, params = {}) {
    return this.post(`report/${reportId}/execute`, params)
  }

  /**
   * Create report
   */
  async createReport(name, config = {}) {
    return this.post('report/create', { name, ...config })
  }

  /**
   * Add column to report
   */
  async addReportColumn(reportId, columnData) {
    return this.post(`report/${reportId}/column/add`, columnData)
  }

  /**
   * Add FROM table to report
   */
  async addReportFrom(reportId, tableId, alias = 't1', joinOn = null) {
    return this.post(`report/${reportId}/from/add`, {
      tableId,
      alias,
      joinOn
    })
  }
}

// Export singleton instance
export default new IntegramService()
