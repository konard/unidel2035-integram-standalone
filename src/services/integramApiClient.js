/**
 * Integram API Client
 *
 * Comprehensive API client for Integram platform
 * Handles authentication, database operations, type/table management, and object CRUD
 */

import axios from 'axios';

class IntegramApiClient {
  constructor() {
    this.serverURL = null;
    this.currentDatabase = null;
    this.databases = {}; // Sessions for all authenticated databases
    this.token = null;
    this.xsrfToken = null;
  }

  // ============================================
  // Server & Database Configuration
  // ============================================

  setServer(serverURL) {
    this.serverURL = serverURL;
  }

  getServer() {
    return this.serverURL;
  }

  setDatabase(databaseName) {
    this.currentDatabase = databaseName;
  }

  getDatabase() {
    return this.currentDatabase;
  }

  switchDatabase(databaseName) {
    this.currentDatabase = databaseName;
    const session = this.databases[databaseName];
    if (session) {
      this.token = session.token;
      this.xsrfToken = session.xsrfToken;
    }
  }

  setCredentials(database, token, xsrf, authDatabase) {
    this.databases[database] = { token, xsrfToken: xsrf, authDatabase };
    this.token = token;
    this.xsrfToken = xsrf;
  }

  // ============================================
  // Authentication & Session Management
  // ============================================

  async authenticate(serverURL, database, login, password) {
    this.setServer(serverURL);
    this.setDatabase(database);

    const response = await axios.post(`${serverURL}/api/auth`, {
      database,
      login,
      password
    });

    const { token, xsrfToken } = response.data;
    this.setCredentials(database, token, xsrfToken, database);

    return response.data;
  }

  async register(data) {
    const response = await this.post('/api/register', data);
    return response.data;
  }

  async resetPassword(data) {
    const response = await this.post('/api/reset-password', data);
    return response.data;
  }

  async logout() {
    this.token = null;
    this.xsrfToken = null;
    this.currentDatabase = null;
  }

  async validateSession() {
    try {
      await this.get('/api/validate');
      return true;
    } catch {
      return false;
    }
  }

  tryRestoreSession() {
    const saved = localStorage.getItem('integram_session');
    if (saved) {
      const session = JSON.parse(saved);
      this.databases = session.databases || {};
      this.currentDatabase = session.currentDatabase;
      this.serverURL = session.serverURL;
      const current = this.databases[this.currentDatabase];
      if (current) {
        this.token = current.token;
        this.xsrfToken = current.xsrfToken;
      }
      return true;
    }
    return false;
  }

  saveSession() {
    localStorage.setItem('integram_session', JSON.stringify({
      databases: this.databases,
      currentDatabase: this.currentDatabase,
      serverURL: this.serverURL
    }));
  }

  async handleGoogleOAuthCallback(code, database) {
    const response = await this.post('/api/oauth/google/callback', { code, database });
    return response.data;
  }

  getAuthInfo() {
    const session = this.databases[this.currentDatabase];
    return session?.authInfo || { userName: 'User', userRole: 'user' };
  }

  isAuthenticated() {
    return !!this.token && !!this.currentDatabase;
  }

  // ============================================
  // HTTP Methods
  // ============================================

  async get(endpoint, params = {}) {
    // Ensure proper URL formatting with slash between serverURL and endpoint
    const baseURL = this.serverURL?.endsWith('/') ? this.serverURL.slice(0, -1) : this.serverURL;
    const path = endpoint?.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseURL}${path}`;
    const response = await axios.get(url, {
      params,
      headers: this._getHeaders()
    });
    return response.data;
  }

  async post(endpoint, data) {
    // Ensure proper URL formatting with slash between serverURL and endpoint
    const baseURL = this.serverURL?.endsWith('/') ? this.serverURL.slice(0, -1) : this.serverURL;
    const path = endpoint?.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseURL}${path}`;

    // Build form data with _xsrf token (matching MCP server implementation)
    const parts = [`_xsrf=${encodeURIComponent(this.xsrfToken || '')}`];
    for (const [key, value] of Object.entries(data || {})) {
      if (value !== null && value !== undefined) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    }
    const postData = parts.join('&');

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...this._getHeaders()
    };

    const response = await axios.post(url, postData, { headers });
    return response.data;
  }

  _getHeaders() {
    const headers = {};
    if (this.token) headers['X-Authorization'] = this.token;
    return headers;
  }

  // ============================================
  // Dictionary & Metadata
  // ============================================

  async getDictionary() {
    const response = await this.get(`/api/${this.currentDatabase}/dictionary`);
    return response.data;
  }

  async getTypeMetadata(typeId) {
    const response = await this.get(`/api/${this.currentDatabase}/type/${typeId}/metadata`);
    return response.data;
  }

  async getTypeEditorData() {
    const response = await this.get(`/api/${this.currentDatabase}/type-editor`);
    return response.data;
  }

  // ============================================
  // Type (Table) Operations
  // ============================================

  async createType({ name, baseTypeId = 3, unique = false }) {
    const response = await this.post(`/api/${this.currentDatabase}/type/create`, {
      name,
      baseTypeId,
      unique
    });
    return response.data;
  }

  async saveType(typeId, name, baseTypeId, unique) {
    const response = await this.post(`/api/${this.currentDatabase}/type/${typeId}/save`, {
      name,
      baseTypeId,
      unique
    });
    return response.data;
  }

  async deleteType(typeId) {
    const response = await this.post(`/api/${this.currentDatabase}/type/${typeId}/delete`, {});
    return response.data;
  }

  async createTypeReference(typeId) {
    const response = await this.post(`/api/${this.currentDatabase}/type/${typeId}/reference`, {});
    return response.data;
  }

  async cloneTableStructure(sourceTypeId, newTableName) {
    const response = await this.post(`/api/${this.currentDatabase}/type/clone`, {
      sourceTypeId,
      newTableName
    });
    return response.data;
  }

  async deleteTableCascade(typeId) {
    const response = await this.post(`/api/${this.currentDatabase}/type/${typeId}/delete-cascade`, {});
    return response.data;
  }

  async renameTable(typeId, newName) {
    const response = await this.post(`/api/${this.currentDatabase}/type/${typeId}/rename`, {
      newName
    });
    return response.data;
  }

  // ============================================
  // Requisite (Column) Operations
  // ============================================

  async addRequisite(typeId, requisiteTypeId) {
    const response = await this.post(`/api/${this.currentDatabase}/type/${typeId}/requisite/add`, {
      requisiteTypeId
    });
    return response.data;
  }

  async deleteRequisite(requisiteId, forced = false) {
    const response = await this.post(`/api/${this.currentDatabase}/requisite/${requisiteId}/delete`, {
      forced
    });
    return response.data;
  }

  async saveRequisiteAlias(requisiteId, alias) {
    const response = await this.post(`/api/${this.currentDatabase}/requisite/${requisiteId}/alias`, {
      alias
    });
    return response.data;
  }

  async toggleRequisiteNull(requisiteId) {
    const response = await this.post(`/api/${this.currentDatabase}/requisite/${requisiteId}/toggle-null`, {});
    return response.data;
  }

  async toggleRequisiteMulti(requisiteId) {
    const response = await this.post(`/api/${this.currentDatabase}/requisite/${requisiteId}/toggle-multi`, {});
    return response.data;
  }

  async saveRequisiteDefaultValue(requisiteId, value) {
    const response = await this.post(`/api/${this.currentDatabase}/requisite/${requisiteId}/default-value`, {
      value
    });
    return response.data;
  }

  async saveRequisiteAttributes(requisiteId, attributes) {
    const response = await this.post(`/api/${this.currentDatabase}/requisite/${requisiteId}/attributes`, attributes);
    return response.data;
  }

  async moveRequisiteUp(requisiteId) {
    const response = await this.post(`/api/${this.currentDatabase}/requisite/${requisiteId}/move-up`, {});
    return response.data;
  }

  async setRequisiteOrder(requisiteId, order) {
    const response = await this.post(`/api/${this.currentDatabase}/requisite/${requisiteId}/order`, {
      order
    });
    return response.data;
  }

  // ============================================
  // Object Operations (CRUD)
  // ============================================

  async getObjectList(typeId, queryFilters = {}) {
    const response = await this.get(`/api/${this.currentDatabase}/object/list/${typeId}`, queryFilters);
    return response.data;
  }

  async getAllObjects(typeId, pageSize = 100, maxPages = 50) {
    const allObjects = [];
    let page = 1;

    while (page <= maxPages) {
      const response = await this.getObjectList(typeId, {
        pg: page,
        LIMIT: pageSize
      });

      if (!response || !response.length) break;
      allObjects.push(...response);

      if (response.length < pageSize) break;
      page++;
    }

    return allObjects;
  }

  async getObjectEditData(objectId) {
    const response = await this.get(`/api/${this.currentDatabase}/object/${objectId}/edit`);
    return response.data;
  }

  async createObject(typeId, value, requisites = {}, parentId = null) {
    const response = await this.post(`/api/${this.currentDatabase}/object/create`, {
      typeId,
      value,
      requisites,
      parentId
    });
    return response.data;
  }

  async saveObject(objectId, typeId, value, requisites = {}) {
    const response = await this.post(`/api/${this.currentDatabase}/object/${objectId}/save`, {
      typeId,
      value,
      requisites
    });
    return response.data;
  }

  async setObjectRequisites(objectId, requisites) {
    const response = await this.post(`/api/${this.currentDatabase}/object/${objectId}/requisites`, {
      requisites
    });
    return response.data;
  }

  async deleteObject(objectId) {
    const response = await this.post(`/api/${this.currentDatabase}/object/${objectId}/delete`, {});
    return response.data;
  }

  async getObjectCount(typeId) {
    const response = await this.get(`/api/${this.currentDatabase}/object/count/${typeId}`);
    return response.data;
  }

  // ============================================
  // Object Navigation & Hierarchy
  // ============================================

  async moveObjectUp(objectId) {
    const response = await this.post(`/api/${this.currentDatabase}/object/${objectId}/move-up`, {});
    return response.data;
  }

  async moveObjectToParent(objectId, newParentId) {
    const response = await this.post(`/api/${this.currentDatabase}/object/${objectId}/move-to-parent`, {
      newParentId
    });
    return response.data;
  }

  async getReferences(objectId) {
    const response = await this.get(`/api/${this.currentDatabase}/object/${objectId}/references`);
    return response.data;
  }

  // ============================================
  // Reference & Lookup Operations
  // ============================================

  async getReferenceOptions(requisiteId, objectId, query = '', restrict = null) {
    const response = await this.get(`/api/${this.currentDatabase}/reference/options`, {
      requisiteId,
      objectId,
      query,
      restrict
    });
    return response.data;
  }

  async addMultiselectItem(objectId, requisiteId, value) {
    const response = await this.post(`/api/${this.currentDatabase}/multiselect/add`, {
      objectId,
      requisiteId,
      value
    });
    return response.data;
  }

  async removeMultiselectItem(multiselectItemId) {
    const response = await this.post(`/api/${this.currentDatabase}/multiselect/${multiselectItemId}/remove`, {});
    return response.data;
  }

  // ============================================
  // File Operations
  // ============================================

  async uploadRequisiteFile(rowId, termId, file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('rowId', rowId);
    formData.append('termId', termId);

    const response = await axios.post(
      `${this.serverURL}/api/${this.currentDatabase}/file/upload`,
      formData,
      {
        headers: {
          ...this._getHeaders(),
          'Content-Type': 'multipart/form-data'
        }
      }
    );

    return response.data;
  }
}

// Export singleton instance
const integramApiClient = new IntegramApiClient();
export default integramApiClient;
