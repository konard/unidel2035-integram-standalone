/**
 * Integram Client - Full Featured
 *
 * Provides complete interface for Integram API operations:
 * - DDL: Types (tables), requisites (columns), aliases
 * - DML: Objects (records), requisites values
 * - References: Foreign keys, lookup tables
 * - Multiselect: Multi-value fields
 * - High-level: Table with columns, lookup with reference
 *
 * Uses correct endpoint format:
 * - DDL: _d_new, _d_save, _d_del, _d_req, _d_alias, _d_null, _d_multi, _d_ref
 * - DML: _m_new, _m_save, _m_set, _m_del, _m_up, _m_move
 *
 * Fixed for Issue #4594: CORS and auth issues with torgi-parser
 * Enhanced for Issue #XXXX: Full DDL/multiselect/reference support
 */

import axios from 'axios'

/**
 * Requisite type IDs for reference
 */
export const REQUISITE_TYPES = {
  SHORT: 3,      // Short text (< 255 chars)
  LONG: 2,       // Long text
  NUMBER: 13,    // Numeric value
  DATETIME: 4,   // Date and time
  DATE: 5,       // Date only
  TIME: 6,       // Time only
  BOOL: 7,       // Boolean
  REFERENCE: 8,  // Reference to another type
  CHARS: 8       // Alias for REFERENCE
}

export class IntegramClient {
  /**
   * Create new Integram client
   * @param {string} serverURL - Integram server URL (e.g., https://example.integram.io)
   * @param {string} database - Database name (e.g., torgi, my, a2025)
   */
  constructor(serverURL, database) {
    this.baseURL = serverURL.replace(/\/$/, '')
    this.database = database
    this.token = null
    this.xsrfToken = null
  }

  /**
   * Build API URL
   * @param {string} endpoint - API endpoint
   * @returns {string} Full URL
   */
  buildURL(endpoint) {
    const url = `${this.baseURL}/${this.database}/${endpoint}`
    return endpoint.includes('?') ? url : `${url}?JSON_KV`
  }

  /**
   * Set authentication tokens directly
   * @param {string} token - Authentication token
   * @param {string} xsrf - XSRF token
   * @param {string} userId - Optional user ID
   */
  setAuth(token, xsrf, userId = null) {
    this.token = token
    this.xsrfToken = xsrf
    if (userId) {
      this.userId = userId
    }
  }

  /**
   * Get current user ID
   * @returns {string|null} Current user ID or null if not authenticated
   */
  getUserId() {
    return this.userId || null
  }

  /**
   * Get current auth info
   * @returns {Object} Auth info with token and xsrf
   */
  getAuth() {
    return {
      token: this.token,
      xsrfToken: this.xsrfToken,
      serverURL: this.baseURL,
      database: this.database
    }
  }

  /**
   * Execute GET request
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Response data
   */
  async get(endpoint, params = {}) {
    if (!this.token && endpoint !== 'xsrf') {
      throw new Error('Not authenticated. Call authenticate or setAuth first.')
    }

    const url = this.buildURL(endpoint)
    const headers = {}

    if (this.token) {
      headers['X-Authorization'] = this.token
    }

    const response = await axios.get(url, { params, headers })
    return response.data
  }

  /**
   * Execute POST request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @returns {Promise<Object>} Response data
   */
  async post(endpoint, data = {}) {
    if (!this.token) {
      throw new Error('Not authenticated. Call authenticate or setAuth first.')
    }

    const url = this.buildURL(endpoint)
    const postData = new URLSearchParams()

    // Add XSRF token to form data
    if (this.xsrfToken) {
      postData.append('_xsrf', this.xsrfToken)
    }

    // Add all data fields
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        postData.append(key, value)
      }
    }

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Authorization': this.token
    }

    const response = await axios.post(url, postData, { headers })
    return response.data
  }

  /**
   * Authenticate with username and password
   * @param {string} login - Username
   * @param {string} password - Password
   * @returns {Promise<boolean>} True if authenticated
   */
  async authenticate(login, password) {
    const url = this.buildURL('auth')
    const formData = new URLSearchParams()
    formData.append('login', login)
    formData.append('pwd', password)

    const response = await axios.post(url, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })

    if (response.data.failed) {
      throw new Error('Authentication failed')
    }

    this.token = response.data.token
    this.xsrfToken = response.data._xsrf
    this.userId = response.data.id // Store user ID from auth response

    // Get additional session info
    try {
      const sessionUrl = this.buildURL('xsrf')
      const sessionResponse = await axios.get(sessionUrl, {
        headers: { 'X-Authorization': this.token }
      })
      this.xsrfToken = sessionResponse.data._xsrf || this.xsrfToken
      this.token = sessionResponse.data.token || this.token
    } catch (error) {
      // Session info fetch failed, use defaults
    }

    return true
  }

  // ============================================================
  // DDL Operations - Types (Tables)
  // ============================================================

  /**
   * Create new type (table)
   * @param {string} name - Type name
   * @param {Object} options - Options: baseTypeId, unique
   * @returns {Promise<Object>} Created type with id
   */
  async createType(name, options = {}) {
    const { baseTypeId = 3, unique = false } = options

    try {
      const data = {
        [`t${baseTypeId}`]: name
      }

      if (unique) {
        data.unique = 1
      }

      const result = await this.post(`_d_new/${baseTypeId}`, data)
      return result
    } catch (error) {
      throw new Error(`Create type failed: ${error.message}`)
    }
  }

  /**
   * Save/update type properties
   * @param {number} typeId - Type ID
   * @param {string} name - New type name
   * @param {Object} options - Options: baseTypeId, unique
   * @returns {Promise<Object>} Updated type
   */
  async saveType(typeId, name, options = {}) {
    const { baseTypeId = 3, unique = false } = options

    try {
      const data = {
        [`t${baseTypeId}`]: name
      }

      if (unique) {
        data.unique = 1
      }

      return await this.post(`_d_save/${typeId}`, data)
    } catch (error) {
      throw new Error(`Save type failed: ${error.message}`)
    }
  }

  /**
   * Delete type (table)
   * @param {number} typeId - Type ID to delete
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteType(typeId) {
    try {
      await this.post(`_d_del/${typeId}`)
      return true
    } catch (error) {
      throw new Error(`Delete type failed: ${error.message}`)
    }
  }

  /**
   * Get dictionary (list of all types)
   * @returns {Promise<Object>} Dictionary with types array
   */
  async getDictionary() {
    try {
      return await this.get('dict')
    } catch (error) {
      throw new Error(`Get dictionary failed: ${error.message}`)
    }
  }

  /**
   * Get type metadata
   * @param {number} typeId - Type ID
   * @returns {Promise<Object>} Type metadata with requisites
   */
  async getTypeMetadata(typeId) {
    try {
      return await this.get(`edit_type/${typeId}`)
    } catch (error) {
      throw new Error(`Get type metadata failed: ${error.message}`)
    }
  }

  /**
   * Get type editor data (available requisite types)
   * @returns {Promise<Object>} Editor data with requisiteTypes
   */
  async getTypeEditorData() {
    try {
      return await this.get('edit_type')
    } catch (error) {
      throw new Error(`Get type editor data failed: ${error.message}`)
    }
  }

  // ============================================================
  // DDL Operations - Requisites (Columns)
  // ============================================================

  /**
   * Add requisite (column) to type
   * @param {number} typeId - Type ID
   * @param {number} requisiteTypeId - Requisite type ID (3=SHORT, 13=NUMBER, etc.)
   * @returns {Promise<Object>} Created requisite with id
   */
  async addRequisite(typeId, requisiteTypeId) {
    try {
      const result = await this.post(`_d_req/${typeId}`, {
        req: requisiteTypeId
      })
      return result
    } catch (error) {
      throw new Error(`Add requisite failed: ${error.message}`)
    }
  }

  /**
   * Delete requisite (column)
   * @param {number} requisiteId - Requisite ID to delete
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteRequisite(requisiteId) {
    try {
      await this.post(`_d_req_del/${requisiteId}`)
      return true
    } catch (error) {
      throw new Error(`Delete requisite failed: ${error.message}`)
    }
  }

  /**
   * Save requisite alias (column name)
   * @param {number} requisiteId - Requisite ID
   * @param {string} alias - Alias/name for the column
   * @returns {Promise<Object>} Result
   */
  async saveRequisiteAlias(requisiteId, alias) {
    try {
      return await this.post(`_d_alias/${requisiteId}`, {
        alias: alias
      })
    } catch (error) {
      throw new Error(`Save requisite alias failed: ${error.message}`)
    }
  }

  /**
   * Rename requisite (change column name)
   * @param {number} requisiteId - Requisite ID
   * @param {string} name - New name
   * @param {number} requisiteTypeId - Requisite type ID
   * @returns {Promise<Object>} Result
   */
  async renameRequisite(requisiteId, name, requisiteTypeId) {
    try {
      return await this.post(`_d_save/${requisiteId}`, {
        [`t${requisiteTypeId}`]: name
      })
    } catch (error) {
      throw new Error(`Rename requisite failed: ${error.message}`)
    }
  }

  /**
   * Toggle requisite NULL flag (required/optional)
   * @param {number} requisiteId - Requisite ID
   * @returns {Promise<Object>} Result
   */
  async toggleRequisiteNull(requisiteId) {
    try {
      return await this.post(`_d_null/${requisiteId}`)
    } catch (error) {
      throw new Error(`Toggle requisite null failed: ${error.message}`)
    }
  }

  /**
   * Toggle requisite multiselect flag
   * @param {number} requisiteId - Requisite ID
   * @returns {Promise<Object>} Result
   */
  async toggleRequisiteMulti(requisiteId) {
    try {
      return await this.post(`_d_multi/${requisiteId}`)
    } catch (error) {
      throw new Error(`Toggle requisite multi failed: ${error.message}`)
    }
  }

  /**
   * Set requisite order
   * @param {number} requisiteId - Requisite ID
   * @param {number} order - New order value
   * @returns {Promise<Object>} Result
   */
  async setRequisiteOrder(requisiteId, order) {
    try {
      return await this.post(`_d_req_ord/${requisiteId}`, {
        ord: order
      })
    } catch (error) {
      throw new Error(`Set requisite order failed: ${error.message}`)
    }
  }

  // ============================================================
  // Reference Operations (Foreign Keys / Lookups)
  // ============================================================

  /**
   * Add reference column to type (creates foreign key to another table)
   * @param {number} typeId - Type ID to add column to
   * @param {number} referenceTableId - Target table ID to reference
   * @param {string} alias - Column alias/name
   * @param {Object} options - Options: allowNull, multiSelect
   * @returns {Promise<Object>} Created reference column
   */
  async addReferenceColumn(typeId, referenceTableId, alias, options = {}) {
    const { allowNull = true, multiSelect = false } = options

    try {
      // Step 1: Add requisite with reference type (8)
      const requisite = await this.addRequisite(typeId, REQUISITE_TYPES.REFERENCE)
      const requisiteId = requisite.id

      // Step 2: Set the reference target table
      await this.post(`_d_ref/${requisiteId}`, {
        ref: referenceTableId
      })

      // Step 3: Set alias
      if (alias) {
        await this.saveRequisiteAlias(requisiteId, alias)
      }

      // Step 4: Toggle null if not allowed
      if (!allowNull) {
        await this.toggleRequisiteNull(requisiteId)
      }

      // Step 5: Toggle multiselect if needed
      if (multiSelect) {
        await this.toggleRequisiteMulti(requisiteId)
      }

      return {
        id: requisiteId,
        alias,
        referenceTableId,
        multiSelect
      }
    } catch (error) {
      throw new Error(`Add reference column failed: ${error.message}`)
    }
  }

  /**
   * Set reference target for existing requisite
   * @param {number} requisiteId - Requisite ID
   * @param {number} referenceTableId - Target table ID
   * @returns {Promise<Object>} Result
   */
  async setRequisiteReference(requisiteId, referenceTableId) {
    try {
      return await this.post(`_d_ref/${requisiteId}`, {
        ref: referenceTableId
      })
    } catch (error) {
      throw new Error(`Set requisite reference failed: ${error.message}`)
    }
  }

  /**
   * Get reference options for a select dropdown
   * @param {number} requisiteId - Requisite ID
   * @param {number} objectId - Object ID being edited
   * @param {Object} options - Options: query, restrict
   * @returns {Promise<Object>} Reference options
   */
  async getReferenceOptions(requisiteId, objectId, options = {}) {
    const { query = '', restrict = null } = options

    try {
      const params = { q: query }
      if (restrict !== null) {
        params.restrict = restrict
      }

      return await this.get(`ref_opt/${requisiteId}/${objectId}`, params)
    } catch (error) {
      throw new Error(`Get reference options failed: ${error.message}`)
    }
  }

  // ============================================================
  // Multiselect Operations
  // ============================================================

  /**
   * Add item to multiselect field
   * @param {number} objectId - Object ID being edited
   * @param {number} requisiteId - Multiselect requisite ID
   * @param {number|string} value - ID of item to add
   * @returns {Promise<Object>} Result with added item ID
   */
  async addMultiselectItem(objectId, requisiteId, value) {
    try {
      // Use _m_set to add multiselect items (not _m_multi_add)
      // Format: t{requisiteId}: value
      return await this.post(`_m_set/${objectId}`, {
        [`t${requisiteId}`]: value
      })
    } catch (error) {
      throw new Error(`Add multiselect item failed: ${error.message}`)
    }
  }

  /**
   * Remove item from multiselect field
   * @param {number} itemId - Multiselect item ID (NOT the referenced object ID)
   * @returns {Promise<boolean>} True if removed
   */
  async removeMultiselectItem(itemId) {
    try {
      await this.post(`_m_multi_del/${itemId}`)
      return true
    } catch (error) {
      throw new Error(`Remove multiselect item failed: ${error.message}`)
    }
  }

  /**
   * Get multiselect items for an object's field
   * @param {number} objectId - Object ID
   * @param {number} requisiteId - Requisite ID
   * @returns {Promise<Array>} Array of multiselect items
   */
  async getMultiselectItems(objectId, requisiteId) {
    try {
      const editData = await this.getObjectEditData(objectId)
      const reqData = editData.reqs?.[requisiteId]

      if (!reqData || !reqData.multiselect) {
        return []
      }

      // multiselect structure: { id: [...], val: [...], ord: [...], ref_val: [...] }
      const multiData = reqData.multiselect
      const items = []

      for (let i = 0; i < (multiData.val || []).length; i++) {
        items.push({
          id: multiData.id?.[i],
          object_id: multiData.val?.[i],
          val: multiData.val?.[i],
          ref_val: multiData.ref_val?.[i],
          ord: multiData.ord?.[i]
        })
      }

      return items
    } catch (error) {
      throw new Error(`Get multiselect items failed: ${error.message}`)
    }
  }

  // ============================================================
  // DML Operations - Objects (Records)
  // ============================================================

  /**
   * Get list of objects for a type
   * @param {number} typeId - Type ID
   * @param {Object} params - Query parameters (offset, limit, search etc.)
   * @returns {Promise<Object>} Object list result
   */
  async getObjectList(typeId, params = {}) {
    try {
      const queryParams = {
        F_U: 1,
        f_show_all: 1,
        ...params
      }
      return await this.get(`object/${typeId}`, queryParams)
    } catch (error) {
      throw new Error(`Get object list failed: ${error.message}`)
    }
  }

  /**
   * Get all objects for a type with pagination
   * @param {number} typeId - Type ID
   * @param {Object} options - Options: pageSize, maxPages
   * @returns {Promise<Array>} All objects
   */
  async getAllObjects(typeId, options = {}) {
    const { pageSize = 100, maxPages = 50 } = options
    const allObjects = []
    let offset = 0
    let page = 0

    try {
      while (page < maxPages) {
        const result = await this.getObjectList(typeId, {
          offset,
          limit: pageSize
        })

        const objects = result.object || []
        if (objects.length === 0) break

        allObjects.push(...objects)
        offset += pageSize
        page++

        if (objects.length < pageSize) break
      }

      return allObjects
    } catch (error) {
      throw new Error(`Get all objects failed: ${error.message}`)
    }
  }

  /**
   * Get object count for a type
   * @param {number} typeId - Type ID
   * @returns {Promise<number>} Object count
   */
  async getObjectCount(typeId) {
    try {
      const result = await this.getObjectList(typeId, { limit: 1 })
      return result.total || result.object?.length || 0
    } catch (error) {
      throw new Error(`Get object count failed: ${error.message}`)
    }
  }

  /**
   * Get object edit data
   * @param {number} objectId - Object ID
   * @returns {Promise<Object>} Object edit data
   */
  async getObjectEditData(objectId) {
    try {
      return await this.get(`edit_obj/${objectId}`)
    } catch (error) {
      throw new Error(`Get object edit data failed: ${error.message}`)
    }
  }

  /**
   * Get object metadata (type, parent, etc.)
   * @param {number} objectId - Object ID
   * @returns {Promise<Object>} Object metadata
   */
  async getObjectMeta(objectId) {
    try {
      const editData = await this.getObjectEditData(objectId)
      return editData.obj || {}
    } catch (error) {
      throw new Error(`Get object meta failed: ${error.message}`)
    }
  }

  /**
   * Create new object
   * @param {number} typeId - Type ID
   * @param {string} value - Object value/name
   * @param {Object} options - Options: requisites, parentId
   * @returns {Promise<Object>} Created object with id
   */
  async createObject(typeId, value, options = {}) {
    const { requisites = {}, parentId = null } = options

    try {
      const data = {
        [`t${typeId}`]: value
      }

      // Set parent or independent
      if (parentId) {
        data.parent = parentId
      } else {
        data.up = 1
      }

      // Add requisites with t prefix
      for (const [reqId, reqValue] of Object.entries(requisites)) {
        if (reqValue !== null && reqValue !== undefined) {
          data[`t${reqId}`] = reqValue
        }
      }

      const result = await this.post(`_m_new/${typeId}`, data)

      // Apply requisites via _m_set for reliability (reference fields)
      if (result && result.id && Object.keys(requisites).length > 0) {
        const refData = {}
        for (const [reqId, reqValue] of Object.entries(requisites)) {
          if (reqValue !== null && reqValue !== undefined) {
            refData[`t${reqId}`] = reqValue
          }
        }
        await this.post(`_m_set/${result.id}`, refData)
      }

      return result
    } catch (error) {
      throw new Error(`Create object failed: ${error.message}`)
    }
  }

  /**
   * Save/update existing object
   * @param {number} objectId - Object ID
   * @param {number} typeId - Type ID
   * @param {string} value - New object value/name
   * @param {Object} requisites - Requisites to update
   * @returns {Promise<Object>} Updated object
   */
  async saveObject(objectId, typeId, value, requisites = {}) {
    try {
      const data = {
        [`t${typeId}`]: value
      }

      for (const [reqId, reqValue] of Object.entries(requisites)) {
        if (reqValue !== null && reqValue !== undefined) {
          data[`t${reqId}`] = reqValue
        }
      }

      return await this.post(`_m_save/${objectId}`, data)
    } catch (error) {
      throw new Error(`Save object failed: ${error.message}`)
    }
  }

  /**
   * Delete object
   * @param {number} objectId - Object ID to delete
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteObject(objectId) {
    try {
      await this.post(`_m_del/${objectId}`)
      return true
    } catch (error) {
      throw new Error(`Delete object failed: ${error.message}`)
    }
  }

  /**
   * Set object requisites (update fields)
   * @param {number} objectId - Object ID
   * @param {Object} requisites - Requisites to set (field ID -> value)
   * @returns {Promise<Object>} Result
   */
  async setObjectRequisites(objectId, requisites) {
    try {
      const data = {}
      for (const [reqId, reqValue] of Object.entries(requisites)) {
        if (reqValue !== null && reqValue !== undefined) {
          data[`t${reqId}`] = reqValue
        }
      }

      return await this.post(`_m_set/${objectId}`, data)
    } catch (error) {
      throw new Error(`Set object requisites failed: ${error.message}`)
    }
  }

  /**
   * Move object up in order
   * @param {number} objectId - Object ID
   * @returns {Promise<Object>} Result
   */
  async moveObjectUp(objectId) {
    try {
      return await this.post(`_m_up/${objectId}`)
    } catch (error) {
      throw new Error(`Move object up failed: ${error.message}`)
    }
  }

  /**
   * Move object to new parent
   * @param {number} objectId - Object ID
   * @param {number} newParentId - New parent ID
   * @returns {Promise<Object>} Result
   */
  async moveObjectToParent(objectId, newParentId) {
    try {
      return await this.post(`_m_move/${objectId}`, {
        parent: newParentId
      })
    } catch (error) {
      throw new Error(`Move object to parent failed: ${error.message}`)
    }
  }

  /**
   * Set object order
   * @param {number} objectId - Object ID
   * @param {number} order - New order value
   * @returns {Promise<Object>} Result
   */
  async setObjectOrder(objectId, order) {
    try {
      return await this.post(`_m_ord/${objectId}`, {
        ord: order
      })
    } catch (error) {
      throw new Error(`Set object order failed: ${error.message}`)
    }
  }

  /**
   * Set object ID (change ID)
   * @param {number} objectId - Current object ID
   * @param {number} newId - New ID
   * @returns {Promise<Object>} Result
   */
  async setObjectId(objectId, newId) {
    try {
      return await this.post(`_m_id/${objectId}`, {
        id: newId
      })
    } catch (error) {
      throw new Error(`Set object ID failed: ${error.message}`)
    }
  }

  // ============================================================
  // High-Level Operations
  // ============================================================

  /**
   * Create table with columns in one operation
   * @param {string} tableName - Table name
   * @param {Array} columns - Array of column definitions
   * @param {Object} options - Options: baseTypeId, unique, parentTableId, parentColumnAlias
   * @returns {Promise<Object>} Created table with columns
   */
  async createTableWithColumns(tableName, columns, options = {}) {
    const {
      baseTypeId = 3,
      unique = false,
      parentTableId = null,
      parentColumnAlias = 'Родительская запись'
    } = options

    try {
      // Step 1: Create the type
      const type = await this.createType(tableName, { baseTypeId, unique })
      const typeId = type.id
      const createdColumns = []

      // Step 2: If parent table specified, add parent reference column
      if (parentTableId) {
        const parentRef = await this.addReferenceColumn(
          typeId,
          parentTableId,
          parentColumnAlias,
          { allowNull: true }
        )
        createdColumns.push({
          id: parentRef.id,
          alias: parentColumnAlias,
          type: 'REFERENCE',
          referenceTableId: parentTableId
        })
      }

      // Step 3: Add each column
      for (const col of columns) {
        const {
          requisiteTypeId,
          alias,
          allowNull = true,
          multiSelect = false,
          referenceTableId = null
        } = col

        // Add requisite
        const requisite = await this.addRequisite(typeId, requisiteTypeId)
        const reqId = requisite.id

        // Set alias
        if (alias) {
          await this.saveRequisiteAlias(reqId, alias)
        }

        // Set reference if specified
        if (referenceTableId) {
          await this.setRequisiteReference(reqId, referenceTableId)
        }

        // Toggle null if not allowed
        if (!allowNull) {
          await this.toggleRequisiteNull(reqId)
        }

        // Toggle multiselect if needed
        if (multiSelect) {
          await this.toggleRequisiteMulti(reqId)
        }

        createdColumns.push({
          id: reqId,
          alias,
          requisiteTypeId,
          allowNull,
          multiSelect,
          referenceTableId
        })
      }

      return {
        id: typeId,
        name: tableName,
        columns: createdColumns
      }
    } catch (error) {
      throw new Error(`Create table with columns failed: ${error.message}`)
    }
  }

  /**
   * Create lookup table (dictionary) with optional values
   * @param {string} tableName - Table name
   * @param {Array} values - Optional initial values
   * @param {Object} options - Options: baseTypeId, unique
   * @returns {Promise<Object>} Created lookup table with values
   */
  async createLookupTable(tableName, values = [], options = {}) {
    const { baseTypeId = 3, unique = true } = options

    try {
      // Create the type
      const type = await this.createType(tableName, { baseTypeId, unique })
      const typeId = type.id
      const createdValues = []

      // Add values
      for (const value of values) {
        const obj = await this.createObject(typeId, value)
        createdValues.push({
          id: obj.id,
          value
        })
      }

      return {
        id: typeId,
        name: tableName,
        values: createdValues
      }
    } catch (error) {
      throw new Error(`Create lookup table failed: ${error.message}`)
    }
  }

  /**
   * Create lookup table AND add it as reference column to another table
   * @param {number} targetTableId - Table to add reference column to
   * @param {string} lookupTableName - Name for new lookup table
   * @param {Object} options - Options: values, columnAlias, multiSelect, baseTypeId
   * @returns {Promise<Object>} Created lookup table and reference column
   */
  async createLookupWithReference(targetTableId, lookupTableName, options = {}) {
    const {
      values = [],
      columnAlias = lookupTableName,
      multiSelect = false,
      baseTypeId = 3
    } = options

    try {
      // Step 1: Create lookup table
      const lookup = await this.createLookupTable(lookupTableName, values, { baseTypeId })

      // Step 2: Add reference column to target table
      const refColumn = await this.addReferenceColumn(
        targetTableId,
        lookup.id,
        columnAlias,
        { multiSelect }
      )

      return {
        lookupTable: lookup,
        referenceColumn: refColumn
      }
    } catch (error) {
      throw new Error(`Create lookup with reference failed: ${error.message}`)
    }
  }

  /**
   * Clone table structure (create new table with same columns)
   * @param {number} sourceTypeId - Source table ID
   * @param {string} newTableName - New table name
   * @param {Object} options - Options: baseTypeId
   * @returns {Promise<Object>} Cloned table
   */
  async cloneTableStructure(sourceTypeId, newTableName, options = {}) {
    const { baseTypeId = 3 } = options

    try {
      // Get source table structure
      const sourceMetadata = await this.getTypeMetadata(sourceTypeId)
      const sourceRequisites = sourceMetadata.reqs || []

      // Create new table
      const newType = await this.createType(newTableName, { baseTypeId })
      const newTypeId = newType.id
      const createdColumns = []

      // Clone each requisite
      for (const req of sourceRequisites) {
        const requisite = await this.addRequisite(newTypeId, req.requisite_type_id)

        if (req.alias) {
          await this.saveRequisiteAlias(requisite.id, req.alias)
        }

        if (req.ref_type) {
          await this.setRequisiteReference(requisite.id, req.ref_type)
        }

        if (req.multi) {
          await this.toggleRequisiteMulti(requisite.id)
        }

        if (!req.null) {
          await this.toggleRequisiteNull(requisite.id)
        }

        createdColumns.push({
          id: requisite.id,
          alias: req.alias,
          requisiteTypeId: req.requisite_type_id
        })
      }

      return {
        id: newTypeId,
        name: newTableName,
        columns: createdColumns,
        sourceTypeId
      }
    } catch (error) {
      throw new Error(`Clone table structure failed: ${error.message}`)
    }
  }

  /**
   * Rename table
   * @param {number} typeId - Type ID
   * @param {string} newName - New table name
   * @returns {Promise<Object>} Result
   */
  async renameTable(typeId, newName) {
    try {
      return await this.saveType(typeId, newName)
    } catch (error) {
      throw new Error(`Rename table failed: ${error.message}`)
    }
  }

  /**
   * Get table structure (metadata + columns)
   * @param {number} typeId - Type ID
   * @returns {Promise<Object>} Table structure
   */
  async getTableStructure(typeId) {
    try {
      const metadata = await this.getTypeMetadata(typeId)
      const requisites = metadata.reqs || []

      return {
        id: typeId,
        name: metadata.type?.val || metadata.type?.name,
        baseTypeId: metadata.type?.typ,
        unique: metadata.type?.unique || false,
        columns: requisites.map(req => ({
          id: req.id,
          alias: req.alias,
          requisiteTypeId: req.requisite_type_id,
          referenceTableId: req.ref_type || null,
          multiSelect: req.multi || false,
          allowNull: req.null !== false,
          order: req.ord
        }))
      }
    } catch (error) {
      throw new Error(`Get table structure failed: ${error.message}`)
    }
  }

  /**
   * Add multiple columns to existing table
   * @param {number} typeId - Type ID
   * @param {Array} columns - Array of column definitions
   * @returns {Promise<Array>} Created columns
   */
  async addColumnsToTable(typeId, columns) {
    const createdColumns = []

    try {
      for (const col of columns) {
        const {
          requisiteTypeId,
          alias,
          allowNull = true,
          multiSelect = false,
          referenceTableId = null
        } = col

        const requisite = await this.addRequisite(typeId, requisiteTypeId)
        const reqId = requisite.id

        if (alias) {
          await this.saveRequisiteAlias(reqId, alias)
        }

        if (referenceTableId) {
          await this.setRequisiteReference(reqId, referenceTableId)
        }

        if (!allowNull) {
          await this.toggleRequisiteNull(reqId)
        }

        if (multiSelect) {
          await this.toggleRequisiteMulti(reqId)
        }

        createdColumns.push({
          id: reqId,
          alias,
          requisiteTypeId,
          allowNull,
          multiSelect,
          referenceTableId
        })
      }

      return createdColumns
    } catch (error) {
      throw new Error(`Add columns to table failed: ${error.message}`)
    }
  }

  /**
   * Create multiple objects in batch
   * @param {number} typeId - Type ID
   * @param {Array} objects - Array of { value, requisites }
   * @param {Object} options - Options: parentId
   * @returns {Promise<Array>} Created objects
   */
  async createObjectsBatch(typeId, objects, options = {}) {
    const { parentId = null } = options
    const createdObjects = []

    try {
      for (const obj of objects) {
        const created = await this.createObject(typeId, obj.value, {
          requisites: obj.requisites || {},
          parentId
        })
        createdObjects.push(created)
      }

      return createdObjects
    } catch (error) {
      throw new Error(`Create objects batch failed: ${error.message}`)
    }
  }

  /**
   * Create parent with children objects
   * @param {number} parentTypeId - Parent table ID
   * @param {string} parentValue - Parent object value
   * @param {number} childTypeId - Child table ID
   * @param {Array} children - Array of child { value, requisites }
   * @param {Object} options - Options: parentRequisites
   * @returns {Promise<Object>} Created parent with children
   */
  async createParentWithChildren(parentTypeId, parentValue, childTypeId, children, options = {}) {
    const { parentRequisites = {} } = options

    try {
      // Create parent
      const parent = await this.createObject(parentTypeId, parentValue, {
        requisites: parentRequisites
      })

      // Create children
      const createdChildren = await this.createObjectsBatch(childTypeId, children, {
        parentId: parent.id
      })

      return {
        parent,
        children: createdChildren
      }
    } catch (error) {
      throw new Error(`Create parent with children failed: ${error.message}`)
    }
  }

  /**
   * Delete table with all data (cascade)
   * @param {number} typeId - Type ID
   * @param {boolean} confirm - Must be true to proceed
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteTableCascade(typeId, confirm = false) {
    if (!confirm) {
      throw new Error('Cascade delete requires confirm=true')
    }

    try {
      // Delete all objects first
      const objects = await this.getAllObjects(typeId)
      for (const obj of objects) {
        await this.deleteObject(obj.id)
      }

      // Delete the type
      await this.deleteType(typeId)
      return true
    } catch (error) {
      throw new Error(`Delete table cascade failed: ${error.message}`)
    }
  }

  // ============================================================
  // Legacy API Methods (Issue #XXXX: Full legacy API parity)
  // ============================================================

  /**
   * Modify requisite attributes in one operation (_d_attrs / _modifiers)
   * Sets alias, null flag, and multi flag for a requisite
   * @param {number} requisiteId - Requisite ID to modify
   * @param {Object} options - Options: alias, setNull, multi
   * @returns {Promise<Object>} Result
   */
  async modifyRequisiteAttributes(requisiteId, options = {}) {
    const { alias = null, setNull = false, multi = false } = options

    try {
      const data = {}

      if (alias !== null) {
        data.alias = alias
      }

      if (setNull) {
        data.set_null = 1
      }

      if (multi) {
        data.multi = 1
      }

      return await this.post(`_d_attrs/${requisiteId}`, data)
    } catch (error) {
      throw new Error(`Modify requisite attributes failed: ${error.message}`)
    }
  }

  /**
   * Create new database (_new_db)
   *
   * ⚠️ IMPORTANT: This method can ONLY be called when connected to the 'my' database!
   * Example: new IntegramClient("https://example.integram.io", "my")
   *
   * Calling from any other database will return: "Создайте базу в Личном кабинете!"
   *
   * @param {string} dbName - New database name. Requirements:
   *   - Length: 3-15 characters
   *   - Characters: latin letters (a-z) and digits (0-9) only
   *   - Must start with a letter
   *   - Examples: "mydb", "project123", "testdb1"
   * @param {string} template - Template to use: 'ru', 'en', or existing db name to clone
   * @param {string} description - Optional database description
   * @returns {Promise<Object>} Result: { success: boolean, id: number, database: string }
   * @throws {Error} Possible errors:
   *   - "Создайте базу в Личном кабинете!" - called from wrong database (not 'my')
   *   - "Недопустимое имя базы" - invalid name format
   *   - "Имя базы занято" - name already taken
   *   - "В бесплатном тарифе доступно не более 3 баз" - free plan limit (3 DBs)
   */
  async createDatabase(dbName, template = 'ru', description = '') {
    try {
      const endpoint = `_new_db?JSON&db=${encodeURIComponent(dbName)}&template=${encodeURIComponent(template)}`
      const data = {}

      if (description) {
        data.descr = description
      }

      const result = await this.post(endpoint, data)

      return {
        success: result.status === 'Ok',
        id: result.id,
        database: dbName
      }
    } catch (error) {
      throw new Error(`Create database failed: ${error.message}`)
    }
  }

  /**
   * Get reference requisites/options for dropdown lists (_ref_reqs)
   * Returns options for reference (lookup) fields including related requisite values
   * @param {number} requisiteId - Requisite ID of the reference field
   * @param {Object} options - Options: objectId, query, restrict, limit
   * @returns {Promise<Object>} Object with id:displayValue pairs
   */
  async getRefReqs(requisiteId, options = {}) {
    const { objectId = 0, query = '', restrict = null, limit = 100 } = options

    try {
      const params = {
        id: objectId,
        LIMIT: limit
      }

      if (query) {
        params.q = query
      }

      if (restrict !== null) {
        params.r = restrict
      }

      return await this.get(`_ref_reqs/${requisiteId}`, params)
    } catch (error) {
      throw new Error(`Get ref reqs failed: ${error.message}`)
    }
  }

  /**
   * Execute external connector (_connect)
   * Fetches data from an external URL defined in the object's CONNECT requisite
   * @param {number} objectId - Object ID that has a CONNECT requisite
   * @param {Object} params - Query parameters to pass to the external URL
   * @returns {Promise<string>} Response from the external connector
   */
  async executeConnector(objectId, params = {}) {
    try {
      return await this.get(`_connect/${objectId}`, params)
    } catch (error) {
      throw new Error(`Execute connector failed: ${error.message}`)
    }
  }

  // ============================================================
  // Backup Operations
  // ============================================================

  /**
   * Create database backup
   * @returns {Promise<Object>} Backup result
   */
  async createBackup() {
    try {
      return await this.post('_backup')
    } catch (error) {
      throw new Error(`Create backup failed: ${error.message}`)
    }
  }

  /**
   * Get directory admin data
   * @param {string} path - Directory path
   * @returns {Promise<Object>} Directory data
   */
  async getDirAdmin(path = '') {
    try {
      return await this.get(`dir_admin/${path}`)
    } catch (error) {
      throw new Error(`Get dir admin failed: ${error.message}`)
    }
  }
}

export default IntegramClient
