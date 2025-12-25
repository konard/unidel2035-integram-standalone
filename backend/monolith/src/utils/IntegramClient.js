/**
 * Integram API Client
 *
 * Provides a unified interface for interacting with Integram API.
 * Based on the Integram API structure: /{database}/[{cmd}/{id}]?JSON_KV[&{params}]
 *
 * Supports:
 * - User authentication (auth command)
 * - User registration in ddadmin (table 18)
 * - CRUD operations on user records
 * - Session management
 */

import axios from 'axios';
import logger from './logger.js';

const INTEGRAM_BASE_URL = process.env.INTEGRAM_API_URL || 'https://dronedoc.ru';
const DDADMIN_DATABASE = 'ddadmin';
const USERS_TABLE = '18'; // Table 18 in ddadmin for users

export class IntegramClient {
  constructor(database = DDADMIN_DATABASE) {
    this.database = database;
    this.baseUrl = INTEGRAM_BASE_URL;
    this.session = null;
  }

  /**
   * Build API URL with parameters
   * @param {string} cmd - Command (auth, object, _m_*, etc.)
   * @param {string|null} id - Record ID (optional)
   * @param {Object} params - Additional query parameters
   * @returns {string} Complete API URL
   */
  buildUrl(cmd, id = null, params = {}) {
    let url = `${this.baseUrl}/${this.database}`;

    if (cmd) {
      url += `/${cmd}`;
    }

    if (id) {
      url += `/${id}`;
    }

    // Add JSON_KV parameter to enable JSON API mode
    const queryParams = new URLSearchParams({ JSON_KV: '', ...params });
    const queryString = queryParams.toString();
    url += `?${queryString}`;

    return url;
  }

  /**
   * Authenticate with Integram API
   * @param {string} username - Username or email
   * @param {string} password - Password
   * @returns {Promise<Object>} Authentication result with tokens
   */
  async authenticate(username, password) {
    try {
      const url = this.buildUrl('auth');

      logger.info({ url, username }, 'Authenticating with Integram');

      // Use form data with correct field names (login, pwd) as required by Integram API
      const formData = new URLSearchParams();
      formData.append('login', username);
      formData.append('pwd', password);

      const response = await axios.post(url, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (response.data && response.data.failed) {
        throw new Error('Invalid login or password');
      }

      // Use response data directly instead of making a second request
      // The auth response already contains token, _xsrf, id, etc.
      this.session = {
        token: response.data.token,
        xsrf: response.data._xsrf,
        userId: response.data.id,
        user: response.data.user || username,
        role: response.data.role,
        cookies: response.headers['set-cookie']
      };

      logger.info({ username, userId: this.session.userId }, 'Successfully authenticated with Integram');
      return this.session;
    } catch (error) {
      logger.error({ error: error.message, username }, 'Integram authentication failed');
      throw new Error(`Integram authentication failed: ${error.message}`);
    }
  }

  /**
   * Create a new user record in Integram database
   * @param {Object} userData - User data to create
   * @returns {Promise<Object>} Created user record with ID
   */
  async createUser(userData) {
    try {
      if (!this.session) {
        throw new Error('Not authenticated. Call authenticate() first.');
      }

      // Step 1: Create user object with _m_new
      const createUrl = this.buildUrl('_m_new', USERS_TABLE);
      logger.info({ url: createUrl, email: userData.email }, 'Creating user in Integram');

      const createData = new URLSearchParams();
      createData.append('_xsrf', this.session.xsrf);
      createData.append(`t${USERS_TABLE}`, userData.username || userData.email.split('@')[0]);
      createData.append('up', '1'); // Independent object

      const createResponse = await axios.post(createUrl, createData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Authorization': this.session.token
        }
      });

      if (!createResponse.data || !createResponse.data.id) {
        throw new Error('Failed to create user record');
      }

      const userId = createResponse.data.id;
      logger.info({ userId, email: userData.email }, 'User object created, setting requisites');

      // Step 2: Set user requisites with _m_save (NOT _m_set!)
      // _m_save correctly saves password, _m_set does not
      // Requisite IDs for 'my' database table 18:
      // - 18: Main value (username)
      // - 41: Email (SHORT)
      // - 20: Password (PWD) - Send plain text, Integram handles hashing
      // - 33: Name (SHORT)
      // - 209326: Referral Code (код пригласившего) - Issue #5112
      const saveUrl = this.buildUrl('_m_save', userId);
      const saveData = new URLSearchParams();
      saveData.append('_xsrf', this.session.xsrf);
      saveData.append(`t${USERS_TABLE}`, userData.username || userData.email.split('@')[0]); // t18 = username

      if (userData.email) {
        saveData.append('t41', userData.email);
      }
      // Password - plain text only, Integram hashes it internally
      if (userData.password) {
        saveData.append('t20', userData.password);
      }
      if (userData.display_name || userData.username) {
        saveData.append('t33', userData.display_name || userData.username);
      }
      // Referral code from inviter (column 209326) - Issue #5112
      if (userData.referral_code) {
        saveData.append('t209326', userData.referral_code);
        logger.info({ userId, referralCode: userData.referral_code }, 'Saving referral code to user');
      }

      // DEBUG: Log exact request being sent
      logger.info({
        url: saveUrl,
        data: {
          t18: userData.username || userData.email.split('@')[0],
          t41: userData.email,
          t20: userData.password ? '[PLAIN_PASSWORD]' : (userData.password_hash ? '[HASH]' : '[NONE]'),
          t33: userData.display_name || userData.username,
          hasPassword: !!userData.password,
          hasPasswordHash: !!userData.password_hash
        }
      }, 'DEBUG: Sending user data to Integram _m_save');

      await axios.post(saveUrl, saveData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Authorization': this.session.token
        }
      });

      logger.info({ userId, email: userData.email }, 'User created successfully with requisites');
      return { id: userId };
    } catch (error) {
      logger.error({ error: error.message, email: userData.email }, 'Failed to create user in Integram');
      throw new Error(`Failed to create user in Integram: ${error.message}`);
    }
  }

  /**
   * Update user record in Integram database
   * @param {string} recordId - Integram record ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated user record
   */
  async updateUser(recordId, updates) {
    try {
      const url = this.buildUrl('_m_update', recordId);

      logger.info({ url, recordId }, 'Updating user in Integram');

      const response = await axios.put(url, updates, {
        headers: this.getAuthHeaders()
      });

      logger.info({ recordId }, 'User updated in Integram');
      return response.data;
    } catch (error) {
      logger.error({ error: error.message, recordId }, 'Failed to update user in Integram');
      throw new Error(`Failed to update user in Integram: ${error.message}`);
    }
  }

  /**
   * Get user record by ID from Integram database
   * @param {string} recordId - Integram record ID
   * @returns {Promise<Object>} User record
   */
  async getUser(recordId) {
    try {
      const url = this.buildUrl('object', recordId);

      const response = await axios.get(url, {
        headers: this.getAuthHeaders()
      });

      return response.data;
    } catch (error) {
      logger.error({ error: error.message, recordId }, 'Failed to get user from Integram');
      throw new Error(`Failed to get user from Integram: ${error.message}`);
    }
  }

  /**
   * Delete user record from Integram database
   * @param {string} recordId - Integram record ID
   * @returns {Promise<void>}
   */
  async deleteUser(recordId) {
    try {
      const url = this.buildUrl('_m_delete', recordId);

      logger.info({ url, recordId }, 'Deleting user from Integram');

      await axios.delete(url, {
        headers: this.getAuthHeaders()
      });

      logger.info({ recordId }, 'User deleted from Integram');
    } catch (error) {
      logger.error({ error: error.message, recordId }, 'Failed to delete user from Integram');
      throw new Error(`Failed to delete user from Integram: ${error.message}`);
    }
  }

  /**
   * Search for users by criteria
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Array>} Array of matching user records
   */
  async searchUsers(criteria) {
    try {
      const url = this.buildUrl('object', USERS_TABLE, criteria);

      const response = await axios.get(url, {
        headers: this.getAuthHeaders()
      });

      return response.data.items || [];
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to search users in Integram');
      throw new Error(`Failed to search users in Integram: ${error.message}`);
    }
  }

  /**
   * Check if a user exists by username or email
   * Uses Integram's _c_list endpoint to get all users from table 18
   * @param {string} username - Username to check
   * @param {string} email - Email to check (optional)
   * @returns {Promise<Object>} { exists: boolean, matchedField: 'username'|'email'|null, userId: string|null }
   */
  async checkUserExists(username, email = null) {
    try {
      if (!this.session) {
        throw new Error('Not authenticated. Call authenticate() first.');
      }

      // Use _c_list endpoint to get all users from table 18
      const listUrl = this.buildUrl('_c_list', USERS_TABLE, { offset: 0, limit: 10000 });

      logger.info({ username, email, url: listUrl }, 'Checking if user exists in Integram');

      const response = await axios.get(listUrl, {
        headers: {
          'X-Authorization': this.session.token
        }
      });

      // Response structure: { object: [{ id, val }], reqs: { id: { reqId: value } } }
      const users = response.data.object || [];
      const requisites = response.data.reqs || {};

      // Check for username match (main value)
      for (const user of users) {
        const userId = user.id;
        const userMainValue = user.val; // This is the username (t18 field)

        // Check if username matches
        if (username && userMainValue && userMainValue.toLowerCase() === username.toLowerCase()) {
          logger.info({ username, userId }, 'Username already exists in Integram');
          return {
            exists: true,
            matchedField: 'username',
            userId: userId
          };
        }

        // Check if email matches (requisite 41)
        if (email && requisites[userId] && requisites[userId]['41']) {
          const userEmail = requisites[userId]['41'];
          if (userEmail && userEmail.toLowerCase() === email.toLowerCase()) {
            logger.info({ email, userId }, 'Email already exists in Integram');
            return {
              exists: true,
              matchedField: 'email',
              userId: userId
            };
          }
        }
      }

      logger.info({ username, email }, 'User does not exist in Integram');
      return {
        exists: false,
        matchedField: null,
        userId: null
      };
    } catch (error) {
      logger.error({ error: error.message, username, email }, 'Failed to check if user exists in Integram');
      // Don't throw error - return false to allow registration to continue
      // This prevents blocking registration if Integram is temporarily unavailable
      return {
        exists: false,
        matchedField: null,
        userId: null
      };
    }
  }

  /**
   * Get authorization headers for authenticated requests
   * @returns {Object} Headers object with authorization
   */
  getAuthHeaders() {
    if (!this.session) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const headers = {
      'Content-Type': 'application/json'
    };

    // Integram uses cookie-based authentication
    if (this.session.cookies) {
      headers['Cookie'] = this.session.cookies.join('; ');
    }

    // Also include xsrf token if available
    if (this.session.xsrf) {
      headers['X-XSRF-TOKEN'] = this.session.xsrf;
    }

    return headers;
  }

  /**
   * Check if session is valid
   * @returns {boolean} True if session is valid
   */
  isAuthenticated() {
    if (!this.session) return false;

    if (this.session.expiresAt && new Date(this.session.expiresAt) < new Date()) {
      this.session = null;
      return false;
    }

    return true;
  }

  /**
   * Clear session
   */
  clearSession() {
    this.session = null;
  }
}

/**
 * Create IntegramClient for specific database
 * @param {string} database - Database name
 * @returns {IntegramClient} New client instance
 */
export function createIntegramClient(database = DDADMIN_DATABASE) {
  return new IntegramClient(database);
}

export default IntegramClient;
