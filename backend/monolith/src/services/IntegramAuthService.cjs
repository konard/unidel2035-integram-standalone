/**
 * Integram Authentication Service
 * Real Integram API authentication for API v2
 *
 * Uses the official Integram auth endpoint:
 * POST https://dronedoc.ru/{database}/auth?JSON_KV
 *   - Body: login=...&pwd=... (form-urlencoded)
 *   - Response: { token, _xsrf, id, msg }
 */

const axios = require('axios');
const https = require('https');

class IntegramAuthService {
  constructor(config = {}) {
    this.baseURL = config.baseURL || 'https://dronedoc.ru';
    this.sessions = new Map(); // In-memory session store (use Redis in production)

    // HTTPS agent для самоподписанных сертификатов
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
  }

  /**
   * Authenticate user against Integram API
   * @param {string} login - Username
   * @param {string} password - Password
   * @param {string} database - Integram database (my, a2025, etc.)
   * @returns {Promise<{success: boolean, session: string, userId: string, token: string, xsrf: string}>}
   */
  async authenticate(login, password, database = 'my') {
    try {
      // Build auth URL: https://dronedoc.ru/{database}/auth?JSON_KV
      const authURL = `${this.baseURL}/${database}/auth?JSON_KV`;

      // Prepare form data (CRITICAL: use 'pwd', not 'password'!)
      const formData = new URLSearchParams();
      formData.append('login', login);
      formData.append('pwd', password);

      console.log(`🔐 [Auth] Authenticating user ${login} at database ${database}...`);

      // Make POST request
      const response = await axios.post(authURL, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        httpsAgent: this.httpsAgent
      });

      // Check response format
      const data = response.data;

      // Check for error
      if (data.failed || data.error) {
        console.log(`❌ [Auth] Failed: ${data.error || data.failed}`);
        return {
          success: false,
          error: data.error || data.failed
        };
      }

      // Check for required fields
      if (!data.token || !data._xsrf) {
        console.log('❌ [Auth] Invalid response: missing token or _xsrf');
        return {
          success: false,
          error: 'Invalid response from Integram API'
        };
      }

      // Generate session ID
      const sessionId = this.generateSessionToken();

      // Store session data
      this.sessions.set(sessionId, {
        userId: data.id,
        login: login,
        database: database,
        token: data.token,
        xsrf: data._xsrf,
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      });

      console.log(`✅ [Auth] User ${login} (ID: ${data.id}) authenticated successfully`);

      return {
        success: true,
        session: sessionId,
        token: data.token,
        xsrf: data._xsrf,
        userId: data.id,
        database: database,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

    } catch (error) {
      console.error('❌ [Auth] Authentication error:', error.message);
      if (error.response) {
        console.error('  - Status:', error.response.status);
        console.error('  - Data:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Verify session token
   * @param {string} sessionId - Session token to verify
   * @returns {Promise<{valid: boolean, userId?: string, database?: string, token?: string, xsrf?: string}>}
   */
  async verifySession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { valid: false };
    }

    // Check if session expired
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return { valid: false, error: 'Session expired' };
    }

    return {
      valid: true,
      userId: session.userId,
      login: session.login,
      database: session.database,
      token: session.token,
      xsrf: session.xsrf
    };
  }

  /**
   * Get session data
   * @param {string} sessionId - Session ID
   * @returns {object|null}
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Generate session token
   * @returns {string}
   */
  generateSessionToken() {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Invalidate session (logout)
   * @param {string} sessionId
   * @returns {Promise<boolean>}
   */
  async invalidateSession(sessionId) {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      console.log(`🔓 [Auth] Session invalidated: ${sessionId}`);
      return true;
    }
    return false;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
        console.log(`🗑️  [Auth] Expired session removed: ${sessionId}`);
      }
    }
  }
}

module.exports = { IntegramAuthService };
