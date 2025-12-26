/**
 * Integram API Service - ПРАВИЛЬНАЯ реализация через Axios
 * Использует формат dronedoc.ru: https://dronedoc.ru/{db}/{endpoint}?JSON_KV
 */

const axios = require('axios');
const https = require('https');

class IntegramApiService {
  constructor(config = {}) {
    this.serverUrl = config.serverUrl || 'https://dronedoc.ru';
    this.database = config.database || 'my';
    this.token = config.token || null;
    this.xsrf = config.xsrf || null;

    // HTTPS agent для самоподписанных сертификатов
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
  }

  /**
   * Build URL для dronedoc.ru формата
   */
  buildURL(endpoint) {
    const cleanBaseURL = this.serverUrl.replace(/\/$/, '');
    const url = `${cleanBaseURL}/${this.database}/${endpoint}`;
    return endpoint.includes('?') ? url : `${url}?JSON_KV`;
  }

  /**
   * Authenticate with Integram - ПРАВИЛЬНЫЙ метод
   */
  async authenticate(login, password) {
    try {
      const url = this.buildURL('auth');

      const params = new URLSearchParams({
        login: login,
        pwd: password
      });

      console.log(`🔐 Authenticating with Integram as ${login} to database ${this.database}...`);

      const response = await axios.post(url, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        httpsAgent: this.httpsAgent
      });

      if (response.data.token && response.data._xsrf) {
        this.token = response.data.token;
        this.xsrf = response.data._xsrf;
        console.log(`✅ Integram authenticated for database ${this.database}`);
        return {
          success: true,
          token: this.token,
          xsrf: this.xsrf
        };
      }

      throw new Error('Authentication failed - no token in response');
    } catch (error) {
      console.error('❌ Integram authentication failed:', error.message);
      throw error;
    }
  }

  /**
   * Get dictionary (list of types/tables)
   */
  async getDictionary() {
    if (!this.token) {
      throw new Error('Not authenticated - call authenticate() first');
    }

    const url = this.buildURL('_api_json');

    const response = await axios.post(url, { _m: 'dictionary' }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Authorization': this.token
      },
      httpsAgent: this.httpsAgent
    });

    return response.data;
  }

  /**
   * Get type metadata
   */
  async getTypeMetadata(typeId) {
    if (!this.token) {
      throw new Error('Not authenticated - call authenticate() first');
    }

    const url = this.buildURL('_api_json');

    const response = await axios.post(url, {
      _d: parseInt(typeId),
      _m: 'type_editor'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Authorization': this.token
      },
      httpsAgent: this.httpsAgent
    });

    return response.data;
  }

  /**
   * Get objects list for type
   */
  async getObjects(typeId, params = {}) {
    if (!this.token) {
      throw new Error('Not authenticated - call authenticate() first');
    }

    const url = this.buildURL('_api_json');

    const response = await axios.post(url, {
      _d: parseInt(typeId),
      _m: 'list',
      pg: params.page || 1,
      LIMIT: params.limit || 100,
      F_U: params.uniqueOnly !== false ? 1 : 0,
      ...params
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Authorization': this.token
      },
      httpsAgent: this.httpsAgent
    });

    return response.data;
  }

  /**
   * Get all objects with pagination
   */
  async getAllObjects(typeId, maxPages = 10, pageSize = 100) {
    const allObjects = [];

    for (let page = 1; page <= maxPages; page++) {
      const response = await this.getObjects(typeId, {
        page: page,
        limit: pageSize
      });

      if (!response || !response.length) {
        break;
      }

      allObjects.push(...response);

      if (response.length < pageSize) {
        break; // Last page
      }
    }

    return allObjects;
  }
}

module.exports = { IntegramApiService };
