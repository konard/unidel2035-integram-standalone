/**
 * Integram API Client
 * Client-side service for interacting with Integram MCP backend API
 *
 * This service wraps the backend Integram MCP server API
 * All methods make API calls to /api/integram/mcp/* endpoints
 */

import axios from 'axios'

class IntegramApiClient {
  constructor() {
    this.serverUrl = 'https://dronedoc.ru'
    this.database = null
    this.currentDatabase = null
    this.token = null
    this.xsrfToken = null
    this.userId = null
    this.userName = null
    this.userRole = null
    this.authDatabase = null

    // Multi-database session storage (for v2 format)
    this.databases = {}

    // Create axios instance for MCP API calls
    this.api = axios.create({
      baseURL: '/api/integram/mcp',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    // Add request interceptor to inject auth headers
    this.api.interceptors.request.use(config => {
      if (this.token) {
        config.headers['X-Integram-Token'] = this.token
      }
      if (this.xsrfToken) {
        config.headers['X-Integram-XSRF'] = this.xsrfToken
      }
      if (this.database) {
        config.headers['X-Integram-Database'] = this.database
      }
      return config
    })
  }

  // ========== Authentication Methods ==========

  /**
   * Set server URL
   */
  setServer(url) {
    this.serverUrl = url
  }

  /**
   * Get server URL
   */
  getServer() {
    return this.serverUrl
  }

  /**
   * Authenticate with Integram
   */
  async authenticate(database, login, password) {
    const response = await this.api.post('/authenticate', {
      serverURL: this.serverUrl,
      database,
      login,
      password
    })

    const data = response.data

    if (data.token && data.xsrf) {
      this.token = data.token
      this.xsrfToken = data.xsrf
      this.database = database
      this.currentDatabase = database
      this.userId = data.userId
      this.userName = data.userName || login
      this.userRole = data.userRole
      this.authDatabase = database

      // Store in databases object (v2 format)
      this.databases[database] = {
        token: data.token,
        xsrf: data.xsrf,
        userId: data.userId,
        userName: data.userName || login,
        userRole: data.userRole,
        ownedDatabases: data.ownedDatabases || []
      }

      this.saveSession()

      return {
        success: true,
        token: data.token,
        xsrf: data.xsrf,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        ownedDatabases: data.ownedDatabases
      }
    }

    throw new Error('Authentication failed')
  }

  /**
   * Register new user
   */
  async register(data) {
    const response = await this.api.post('/register', {
      serverURL: this.serverUrl,
      ...data
    })
    return response.data
  }

  /**
   * Reset password
   */
  async resetPassword(data) {
    const response = await this.api.post('/reset-password', {
      serverURL: this.serverUrl,
      ...data
    })
    return response.data
  }

  /**
   * Handle Google OAuth callback
   */
  async handleGoogleOAuthCallback(code, database) {
    const response = await this.api.post('/oauth/google/callback', {
      code,
      database,
      serverURL: this.serverUrl
    })

    const data = response.data

    if (data.token && data.xsrf) {
      this.token = data.token
      this.xsrfToken = data.xsrf
      this.database = database
      this.currentDatabase = database

      this.databases[database] = {
        token: data.token,
        xsrf: data.xsrf,
        userName: data.userName,
        userRole: data.userRole
      }

      this.saveSession()

      return {
        success: true,
        token: data.token,
        xsrf: data.xsrf
      }
    }

    return { success: false }
  }

  /**
   * Set credentials directly
   */
  setCredentials(database, token, xsrf, authDatabase = null) {
    this.database = database
    this.currentDatabase = database
    this.token = token
    this.xsrfToken = xsrf
    if (authDatabase) {
      this.authDatabase = authDatabase
    }
  }

  /**
   * Switch to a different database
   */
  async switchDatabase(dbName) {
    if (this.databases[dbName]) {
      const dbSession = this.databases[dbName]
      this.database = dbName
      this.currentDatabase = dbName
      this.token = dbSession.token
      this.xsrfToken = dbSession.xsrf
      this.userId = dbSession.userId
      this.userName = dbSession.userName
      this.userRole = dbSession.userRole
      this.saveSession()
    } else {
      throw new Error(`Database ${dbName} not authenticated`)
    }
  }

  /**
   * Logout
   */
  logout() {
    this.token = null
    this.xsrfToken = null
    this.database = null
    this.currentDatabase = null
    this.userId = null
    this.userName = null
    this.userRole = null
    this.databases = {}
    this.clearSession()
  }

  /**
   * Check if authenticated
   */
  isAuthenticated() {
    return !!(this.token && this.xsrfToken)
  }

  /**
   * Get authentication info
   */
  getAuthInfo() {
    return {
      token: this.token,
      xsrf: this.xsrfToken,
      database: this.database,
      userId: this.userId,
      userName: this.userName,
      userRole: this.userRole
    }
  }

  /**
   * Get current database
   */
  getDatabase() {
    return this.currentDatabase || this.database
  }

  /**
   * Set current database
   */
  setDatabase(database) {
    this.database = database
    this.currentDatabase = database
  }

  /**
   * Validate session
   */
  async validateSession() {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated')
    }
    // Session is valid if we have token and xsrf
    return true
  }

  /**
   * Save session to localStorage
   */
  saveSession() {
    if (this.token && this.xsrfToken && this.database) {
      const session = {
        version: 2,
        databases: this.databases,
        currentDatabase: this.currentDatabase
      }
      localStorage.setItem('integram_session', JSON.stringify(session))
    }
  }

  /**
   * Try to restore session from localStorage
   */
  tryRestoreSession() {
    const sessionStr = localStorage.getItem('integram_session')
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr)

        if (session.version === 2 && session.databases) {
          // v2 format
          this.databases = session.databases
          this.currentDatabase = session.currentDatabase

          // Set current database session
          if (this.currentDatabase && this.databases[this.currentDatabase]) {
            const dbSession = this.databases[this.currentDatabase]
            this.database = this.currentDatabase
            this.token = dbSession.token
            this.xsrfToken = dbSession.xsrf
            this.userId = dbSession.userId
            this.userName = dbSession.userName
            this.userRole = dbSession.userRole
          }
        }
      } catch (e) {
        console.warn('Failed to restore Integram session:', e)
      }
    }
  }

  /**
   * Clear session from localStorage
   */
  clearSession() {
    localStorage.removeItem('integram_session')
  }

  // ========== Dictionary & Type Methods ==========

  /**
   * Get dictionary (list of types)
   */
  async getDictionary() {
    const response = await this.api.get('/get-dictionary')
    return response.data
  }

  /**
   * Get type metadata
   */
  async getTypeMetadata(typeId) {
    const response = await this.api.get(`/get-type-metadata/${typeId}`)
    return response.data
  }

  /**
   * Get type editor data
   */
  async getTypeEditorData() {
    const response = await this.api.get('/get-type-editor-data')
    return response.data
  }

  /**
   * Create a new type
   */
  async createType(name, baseTypeId = 3, unique = false) {
    const response = await this.api.post('/create-type', {
      name,
      baseTypeId,
      unique
    })
    return response.data
  }

  /**
   * Save type properties
   */
  async saveType(typeId, name, baseTypeId, unique) {
    const response = await this.api.post(`/save-type/${typeId}`, {
      name,
      baseTypeId,
      unique
    })
    return response.data
  }

  /**
   * Delete a type
   */
  async deleteType(typeId) {
    const response = await this.api.delete(`/delete-type/${typeId}`)
    return response.data
  }

  /**
   * Clone table structure
   */
  async cloneTableStructure(sourceTypeId, newTableName) {
    const response = await this.api.post('/clone-table-structure', {
      sourceTypeId,
      newTableName
    })
    return response.data
  }

  /**
   * Delete table with cascade
   */
  async deleteTableCascade(typeId) {
    const response = await this.api.delete(`/delete-table-cascade/${typeId}`)
    return response.data
  }

  /**
   * Rename table
   */
  async renameTable(typeId, newName) {
    const response = await this.api.post(`/rename-table/${typeId}`, {
      newName
    })
    return response.data
  }

  /**
   * Create type reference
   */
  async createTypeReference(typeId) {
    const response = await this.api.post(`/create-type-reference/${typeId}`)
    return response.data
  }

  // ========== Requisite Methods ==========

  /**
   * Add requisite to type
   */
  async addRequisite(typeId, requisiteTypeId) {
    const response = await this.api.post(`/add-requisite/${typeId}`, {
      requisiteTypeId
    })
    return response.data
  }

  /**
   * Delete requisite
   */
  async deleteRequisite(requisiteId, forced = false) {
    const response = await this.api.delete(`/delete-requisite/${requisiteId}`, {
      data: { forced }
    })
    return response.data
  }

  /**
   * Save requisite alias
   */
  async saveRequisiteAlias(requisiteId, alias) {
    const response = await this.api.post(`/save-requisite-alias/${requisiteId}`, {
      alias
    })
    return response.data
  }

  /**
   * Save requisite default value
   */
  async saveRequisiteDefaultValue(requisiteId, defaultValue) {
    const response = await this.api.post(`/save-requisite-default-value/${requisiteId}`, {
      defaultValue
    })
    return response.data
  }

  /**
   * Toggle requisite null flag
   */
  async toggleRequisiteNull(requisiteId) {
    const response = await this.api.post(`/toggle-requisite-null/${requisiteId}`)
    return response.data
  }

  /**
   * Toggle requisite multi flag
   */
  async toggleRequisiteMulti(requisiteId) {
    const response = await this.api.post(`/toggle-requisite-multi/${requisiteId}`)
    return response.data
  }

  /**
   * Move requisite up in order
   */
  async moveRequisiteUp(requisiteId) {
    const response = await this.api.post(`/move-requisite-up/${requisiteId}`)
    return response.data
  }

  /**
   * Set requisite order
   */
  async setRequisiteOrder(requisiteId, order) {
    const response = await this.api.post(`/set-requisite-order/${requisiteId}`, {
      order
    })
    return response.data
  }

  /**
   * Save requisite attributes
   */
  async saveRequisiteAttributes(requisiteId, attrs) {
    const response = await this.api.post(`/save-requisite-attributes/${requisiteId}`, {
      attrs
    })
    return response.data
  }

  // ========== Object Methods ==========

  /**
   * Get object count for a type
   */
  async getObjectCount(typeId) {
    const response = await this.api.get(`/get-object-count/${typeId}`)
    return response.data
  }

  /**
   * Get object list
   */
  async getObjectList(typeId, params = {}) {
    const response = await this.api.post(`/get-object-list/${typeId}`, params)
    return response.data
  }

  /**
   * Get all objects (with pagination)
   */
  async getAllObjects(typeId, pageSize = 100, maxPages = 50) {
    const response = await this.api.post(`/get-all-objects/${typeId}`, {
      pageSize,
      maxPages
    })
    return response.data
  }

  /**
   * Get object edit data
   */
  async getObjectEditData(objectId) {
    const response = await this.api.get(`/get-object-edit-data/${objectId}`)
    return response.data
  }

  /**
   * Create object
   */
  async createObject(typeId, value, requisites = {}, parentId = null) {
    const response = await this.api.post('/create-object', {
      typeId,
      value,
      requisites,
      parentId
    })
    return response.data
  }

  /**
   * Save object
   */
  async saveObject(objectId, typeId, value, requisites = {}) {
    const response = await this.api.post(`/save-object/${objectId}`, {
      typeId,
      value,
      requisites
    })
    return response.data
  }

  /**
   * Set object requisites
   */
  async setObjectRequisites(objectId, requisites) {
    const response = await this.api.post(`/set-object-requisites/${objectId}`, {
      requisites
    })
    return response.data
  }

  /**
   * Delete object
   */
  async deleteObject(objectId) {
    const response = await this.api.delete(`/delete-object/${objectId}`)
    return response.data
  }

  /**
   * Move object up in order
   */
  async moveObjectUp(objectId) {
    const response = await this.api.post(`/move-object-up/${objectId}`)
    return response.data
  }

  /**
   * Move object to parent
   */
  async moveObjectToParent(objectId, newParentId) {
    const response = await this.api.post(`/move-object-to-parent/${objectId}`, {
      newParentId
    })
    return response.data
  }

  /**
   * Set object order
   */
  async setObjectOrder(objectId, order) {
    const response = await this.api.post(`/set-object-order/${objectId}`, {
      order
    })
    return response.data
  }

  // ========== Reference Methods ==========

  /**
   * Get reference options for dropdown
   */
  async getReferenceOptions(requisiteId, objectId, restrict = null, query = '') {
    const response = await this.api.post('/get-reference-options', {
      requisiteId,
      objectId,
      restrict,
      query
    })
    return response.data
  }

  /**
   * Get references for an object
   */
  async getReferences(objectId) {
    const response = await this.api.get(`/get-references/${objectId}`)
    return response.data
  }

  /**
   * Add multiselect item
   */
  async addMultiselectItem(objectId, requisiteId, value) {
    const response = await this.api.post('/add-multiselect-item', {
      objectId,
      requisiteId,
      value
    })
    return response.data
  }

  /**
   * Remove multiselect item
   */
  async removeMultiselectItem(itemId) {
    const response = await this.api.delete(`/remove-multiselect-item/${itemId}`)
    return response.data
  }

  /**
   * Get multiselect items
   */
  async getMultiselectItems(objectId, requisiteId) {
    const response = await this.api.get(`/get-multiselect-items/${objectId}/${requisiteId}`)
    return response.data
  }

  // ========== File Upload Methods ==========

  /**
   * Upload file for requisite
   */
  async uploadRequisiteFile(objectId, termId, file) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('objectId', objectId)
    formData.append('termId', termId)

    const response = await this.api.post('/upload-requisite-file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  }

  // ========== Generic HTTP Methods ==========

  /**
   * Generic GET request
   */
  async get(endpoint, params = {}) {
    const response = await this.api.get(endpoint, { params })
    return response.data
  }

  /**
   * Generic POST request
   */
  async post(endpoint, data = {}) {
    const response = await this.api.post(endpoint, data)
    return response.data
  }
}

// Create singleton instance
const integramApiClient = new IntegramApiClient()

export default integramApiClient
