/**
 * Integram MCP Client (CommonJS)
 *
 * Simple HTTP client for Integram API operations.
 * Used by DatabaseTokenStorage and other services.
 * Part of Issue #3631: Database Token Storage System
 *
 * @module IntegramMCPClient
 */

import axios from 'axios';

/**
 * Client for interacting with Integram API
 */
class IntegramMCPClient {
  /**
   * Create a new Integram MCP Client
   * @param {Object} options - Configuration options
   * @param {string} options.serverURL - Integram server URL (e.g., https://dronedoc.ru)
   * @param {string} options.database - Database name (e.g., ddadmin)
   * @param {string} options.myToken - Optional 'my' database token for cross-database access (Issue #3811)
   */
  constructor(options = {}) {
    const { serverURL, database, myToken } = options;

    if (!serverURL || !database) {
      throw new Error('serverURL and database are required');
    }

    this.baseURL = serverURL.replace(/\/$/, ''); // Remove trailing slash
    this.database = database;
    this.token = null;
    this.xsrfToken = null;
    this.userId = null;
    this.userRole = null;
    this.userName = null;
    // Issue #3811: Support for 'my' database token
    this.myToken = myToken || null;
  }

  /**
   * Build API URL
   * @param {string} endpoint - API endpoint
   * @returns {string} Full URL
   */
  buildURL(endpoint) {
    // DronDoc format: https://dronedoc.ru/{database}/{endpoint}?JSON_KV
    if (this.baseURL.includes('dronedoc.ru')) {
      const url = `${this.baseURL}/${this.database}/${endpoint}`;
      return endpoint.includes('?') ? url : `${url}?JSON_KV`;
    }

    // Integram format: https://integram.io/api/{database}/{endpoint}
    if (this.baseURL.includes('integram.io')) {
      return `${this.baseURL}/api/${this.database}/${endpoint}`;
    }

    // Default format
    return `${this.baseURL}/api/${this.database}/${endpoint}`;
  }

  /**
   * Build request headers with authentication (Issue #3811)
   * Supports both regular tokens and 'my' database token for cross-database access
   * @param {Object} additionalHeaders - Additional headers to include
   * @returns {Object} Headers object
   */
  buildHeaders(additionalHeaders = {}) {
    const headers = { ...additionalHeaders };

    // If 'my' token is set and we're accessing a different database,
    // use 'my:' header for cross-database access
    if (this.myToken && this.database !== 'my') {
      headers['my'] = this.myToken;
    }

    // Always include regular token if available
    // Note: Integram uses 'X-Authorization' header (not 'Authorization: Bearer')
    if (this.token) {
      headers['X-Authorization'] = this.token;
    }

    // Include XSRF token if available
    if (this.xsrfToken) {
      headers['X-XSRF-Token'] = this.xsrfToken;
    }

    return headers;
  }

  /**
   * Set 'my' database token for cross-database access (Issue #3811)
   * @param {string} token - My database token
   */
  setMyToken(token) {
    this.myToken = token;
  }

  /**
   * Authenticate with Integram
   * Issue #4503: Handle different response formats gracefully
   * Issue #4521: Use correct endpoint (auth) and field names (pwd) for DronDoc
   * @param {string} login - Username
   * @param {string} password - Password
   * @returns {Promise<boolean>} True if authentication successful
   */
  async authenticate(login, password) {
    try {
      // DronDoc/Integram uses 'auth' endpoint with form-urlencoded data
      const url = this.buildURL('auth');
      const formData = new URLSearchParams();
      formData.append('login', login);
      formData.append('pwd', password);

      const response = await axios.post(url, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      // Handle successful authentication response
      const data = response.data;

      // Check if we got a valid response
      if (!data) {
        throw new Error('Authentication response is empty');
      }

      // Check for authentication failure
      if (data.failed) {
        throw new Error(`Wrong credentials for user ${login} in ${this.database}. Please send login and password as POST-parameters.`);
      }

      // Get token from auth response
      const token = data.token || data.accessToken || data.access_token;
      if (token) {
        this.token = token;
        this.xsrfToken = data._xsrf || data.xsrf || data.xsrfToken || data.csrf || null;

        // Fetch additional session info from xsrf endpoint
        try {
          const sessionUrl = this.buildURL('xsrf');
          const sessionResponse = await axios.get(sessionUrl, {
            headers: {
              'X-Authorization': this.token,
              ...(this.xsrfToken && { 'X-XSRF-Token': this.xsrfToken })
            }
          });
          const sessionInfo = sessionResponse.data;
          this.userId = sessionInfo.id || null;
          this.userName = sessionInfo.user || login;
          this.userRole = sessionInfo.role || null;
          this.xsrfToken = sessionInfo._xsrf || this.xsrfToken;
          this.token = sessionInfo.token || this.token;
        } catch (sessionError) {
          // Session info fetch failed, use defaults
          this.userId = data.userId || data.user_id || data.id || null;
          this.userRole = data.role || data.userRole || null;
          this.userName = data.userName || data.username || data.name || login;
        }

        return true;
      }

      // If no token found, provide helpful error message
      throw new Error(
        `Authentication response missing token. Response keys: ${Object.keys(data).join(', ')}`
      );
    } catch (error) {
      // Re-throw with more context if it's an axios error
      if (error.response) {
        throw new Error(
          `Authentication failed: HTTP ${error.response.status} - ${
            error.response.data?.error || error.response.data?.message || error.message
          }`
        );
      }
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Create a new object
   * @param {Object} params - Creation parameters
   * @param {number} params.typeId - Type ID
   * @param {string} params.value - Object value/name
   * @param {Object} [params.requisites={}] - Requisite values (field ID → value)
   * @param {number} [params.parentId=null] - Parent object ID for subordinate objects
   * @returns {Promise<Object>} Created object
   */
  async createObject(params) {
    this._ensureAuthenticated();

    const { typeId, value, requisites = {}, parentId = null } = params;

    try {
      // Use correct Integram API endpoint: _m_new/{typeId}
      const url = this.buildURL(`_m_new/${typeId}`);

      // Build form data in Integram format
      const formData = new URLSearchParams();

      // Add XSRF token (required for Integram API)
      if (this.xsrfToken) {
        formData.append('_xsrf', this.xsrfToken);
      } else {
        console.warn('[IntegramMCPClient] No XSRF token available for createObject');
      }

      // Add main value field
      formData.append(`t${typeId}`, value);

      // Add up parameter: parentId for subordinate objects, or 1 for independent objects
      formData.append('up', parentId || 1);

      // Add requisites
      for (const [reqId, reqValue] of Object.entries(requisites)) {
        if (reqValue !== null && reqValue !== undefined) {
          formData.append(`t${reqId}`, reqValue);
        }
      }

      const headers = {
        ...this.buildHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded'
      };

      console.log('[IntegramMCPClient] Creating object:');
      console.log('  URL:', url);
      console.log('  Headers:', JSON.stringify(headers, null, 2));
      console.log('  FormData:', formData.toString());

      const response = await axios.post(url, formData, { headers });

      // Debug logging to file
      const fs = await import('fs');
      fs.appendFileSync('/tmp/integram-create-debug.log', `\n=== CREATE OBJECT ${new Date().toISOString()} ===\n`);
      fs.appendFileSync('/tmp/integram-create-debug.log', `URL: ${url}\n`);
      fs.appendFileSync('/tmp/integram-create-debug.log', `Status: ${response.status}\n`);
      fs.appendFileSync('/tmp/integram-create-debug.log', `Data: ${JSON.stringify(response.data, null, 2)}\n`);
      fs.appendFileSync('/tmp/integram-create-debug.log', `Keys: ${Object.keys(response.data || {}).join(', ')}\n`);

      return response.data;
    } catch (error) {
      throw new Error(`Create object failed: ${error.message}`);
    }
  }

  /**
   * Get list of objects for a type
   * @param {Object} params - Query parameters
   * @param {number} params.typeId - Type ID
   * @param {Object} [params.params={}] - Additional parameters (offset, limit, filter)
   * @returns {Promise<Array>} Array of objects
   */
  async getObjectList(params) {
    this._ensureAuthenticated();

    const { typeId, params: queryParams = {} } = params;

    try {
      const url = this.buildURL('get_object_list');
      const response = await axios.post(
        url,
        {
          typeId,
          ...queryParams
        },
        {
          headers: this.buildHeaders()
        }
      );

      return response.data.objects || [];
    } catch (error) {
      throw new Error(`Get object list failed: ${error.message}`);
    }
  }

  /**
   * Get object edit data (full object with requisites)
   * @param {number} objectId - Object ID
   * @returns {Promise<Object>} Object data
   */
  async getObjectEditData(objectId) {
    this._ensureAuthenticated();

    try {
      const url = this.buildURL('get_object_edit_data');
      const response = await axios.post(
        url,
        { objectId },
        {
          headers: this.buildHeaders()
        }
      );

      return response.data;
    } catch (error) {
      throw new Error(`Get object edit data failed: ${error.message}`);
    }
  }

  /**
   * Set object requisites (update fields)
   * @param {Object} params - Update parameters
   * @param {number} params.objectId - Object ID
   * @param {Object} params.requisites - Requisite values (field ID → value)
   * @returns {Promise<Object>} Updated object
   */
  async setObjectRequisites(params) {
    this._ensureAuthenticated();

    const { objectId, requisites } = params;

    try {
      const url = this.buildURL('set_object_requisites');
      const response = await axios.post(
        url,
        {
          objectId,
          requisites
        },
        {
          headers: this.buildHeaders()
        }
      );

      return response.data;
    } catch (error) {
      throw new Error(`Set object requisites failed: ${error.message}`);
    }
  }

  /**
   * Delete an object
   * @param {number} objectId - Object ID to delete
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteObject(objectId) {
    this._ensureAuthenticated();

    try {
      const url = this.buildURL('delete_object');
      const response = await axios.post(
        url,
        { objectId },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            ...(this.xsrfToken && { 'X-XSRF-Token': this.xsrfToken })
          }
        }
      );

      return response.data.success || true;
    } catch (error) {
      throw new Error(`Delete object failed: ${error.message}`);
    }
  }

  /**
   * Ensure client is authenticated
   * @private
   */
  _ensureAuthenticated() {
    if (!this.token) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }
  }
}

export default IntegramMCPClient;
