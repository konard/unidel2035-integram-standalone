/**
 * Unified Auth Service
 *
 * Provides unified authentication across different auth methods
 * This service acts as a bridge between the legacy localStorage-based auth
 * and modern session-based authentication systems.
 */

import axios from 'axios'

/**
 * Check if user is authenticated in unified session
 * @returns {boolean}
 */
function isAuthenticated() {
  // Check if unified session exists in localStorage
  const sessionId = localStorage.getItem('unified_auth_session_id')
  const sessionData = localStorage.getItem('integram_session')

  return !!(sessionId || sessionData)
}

/**
 * Get current session data
 * @returns {Promise<Object|null>}
 */
async function getSession() {
  const sessionData = localStorage.getItem('integram_session')

  if (!sessionData) {
    return null
  }

  try {
    return JSON.parse(sessionData)
  } catch (err) {
    console.warn('[unifiedAuthService] Failed to parse session data:', err)
    return null
  }
}

/**
 * Get token for a specific database
 * @param {string} database - Database name
 * @returns {Promise<Object|null>}
 */
async function getTokenForDatabase(database) {
  const session = await getSession()

  if (!session) {
    return null
  }

  // If current session is for the requested database
  if (session.database === database || session.authDatabase === database) {
    return {
      token: session.token,
      xsrf: session.xsrfToken,
      userId: session.userId,
      userName: session.userName,
      database: session.database
    }
  }

  // Check if we have a stored token for this specific database
  const dbToken = localStorage.getItem(`${database}_token`)
  const dbXsrf = localStorage.getItem(`${database}_xsrf`)
  const dbUserId = localStorage.getItem(`${database}_id`)
  const dbUserName = localStorage.getItem(`${database}_user`)

  if (dbToken) {
    return {
      token: dbToken,
      xsrf: dbXsrf,
      userId: dbUserId,
      userName: dbUserName,
      database
    }
  }

  return null
}

/**
 * Get all available tokens for all databases
 * @returns {Promise<Object>}
 */
async function getAllTokens() {
  const tokens = {}
  const session = await getSession()

  if (session) {
    const db = session.database || session.authDatabase
    tokens[db] = {
      token: session.token,
      xsrf: session.xsrfToken,
      userId: session.userId,
      userName: session.userName,
      database: db
    }
  }

  // Also check for other database tokens in localStorage
  const databases = ['ddadmin', 'my', 'a2025']

  for (const db of databases) {
    const token = localStorage.getItem(`${db}_token`)
    if (token && !tokens[db]) {
      tokens[db] = {
        token,
        xsrf: localStorage.getItem(`${db}_xsrf`),
        userId: localStorage.getItem(`${db}_id`),
        userName: localStorage.getItem(`${db}_user`),
        database: db
      }
    }
  }

  return tokens
}

/**
 * Get list of available databases
 * @returns {Promise<Array<string>>}
 */
async function getAvailableDatabases() {
  const tokens = await getAllTokens()
  return Object.keys(tokens)
}

/**
 * Logout from unified session
 * @returns {Promise<void>}
 */
async function logout() {
  // Clear unified session data
  localStorage.removeItem('unified_auth_session_id')
  localStorage.removeItem('integram_session')

  // Optionally call logout API endpoint
  try {
    await axios.post('/api/auth/logout')
  } catch (err) {
    // Ignore errors - session is cleared locally anyway
    console.warn('[unifiedAuthService] Logout API call failed:', err.message)
  }
}

/**
 * Login with credentials
 * @param {Object} credentials
 * @returns {Promise<Object>}
 */
async function login(credentials) {
  const response = await axios.post('/api/auth/login', credentials)
  return response.data
}

/**
 * Verify token validity
 * @param {string} token
 * @returns {Promise<Object>}
 */
async function verifyToken(token) {
  const response = await axios.post('/api/auth/verify', { token })
  return response.data
}

export const unifiedAuthService = {
  isAuthenticated,
  getSession,
  getTokenForDatabase,
  getAllTokens,
  getAvailableDatabases,
  logout,
  login,
  verifyToken
}

export default unifiedAuthService
