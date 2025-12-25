/**
 * Authentication Store
 *
 * Issue #3848: Simplified authorization token storage system
 *
 * Simplified single token system:
 * 1. Single 'token' in localStorage for all databases
 * 2. When logged into 'my':
 *    - Requests to /my/ use X-Authorization header
 *    - Requests to other databases use 'my' header (kernel routing)
 * 3. When logged into other database (e.g., a2025):
 *    - All requests use X-Authorization header
 * 4. integram_session is ONLY for /integram routes (isolated)
 * 5. User can have different ID and username per database
 * 6. User info fetched from /{db}/xsrf?JSON_KV endpoint
 *
 * Backward compatibility maintained for legacy components
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import { unifiedAuthService } from '@/services/unifiedAuthService'

export const useAuthStore = defineStore('auth', () => {
  // Unified session data
  const unifiedSession = ref(null)

  // Primary database authentication (for backward compatibility)
  const primaryToken = ref(null)
  const primaryUser = ref(null)
  const primaryUserId = ref(null)
  const primaryXsrf = ref(null)
  const primaryDatabase = ref('my') // Default database - unified auth entry point (issue #3691)
  // Issue #3924: Changed default from sim.sakhwings.ru to dronedoc.ru to avoid CORS errors
  const primaryApiBase = ref('dronedoc.ru') // Default API base

  // ddadmin database authentication (for backward compatibility)
  const ddadminToken = ref(null)
  const ddadminUser = ref(null)
  const ddadminUserId = ref(null)
  const ddadminXsrf = ref(null)

  // my database authentication (Issue #3730)
  const myToken = ref(null)
  const myUser = ref(null)
  const myUserId = ref(null)
  const myXsrf = ref(null)

  // Loading states
  const isLoading = ref(false)
  const error = ref(null)

  // Computed properties
  const isAuthenticated = computed(() => !!primaryToken.value || unifiedAuthService.isAuthenticated())
  const isDdadminAuthenticated = computed(() => !!ddadminToken.value)
  const isMyAuthenticated = computed(() => !!myToken.value)

  /**
   * Initialize store from localStorage and unified auth session
   */
  async function initFromLocalStorage() {
    // Load primary auth data from legacy localStorage
    primaryToken.value = localStorage.getItem('token')
    primaryUser.value = localStorage.getItem('user')
    primaryUserId.value = localStorage.getItem('id')
    primaryXsrf.value = localStorage.getItem('_xsrf')
    primaryDatabase.value = localStorage.getItem('db') || 'a2025'
    // Issue #3924: Changed default from sim.sakhwings.ru to dronedoc.ru to avoid CORS errors
    primaryApiBase.value = localStorage.getItem('apiBase') || 'dronedoc.ru'

    // Load ddadmin auth data from legacy localStorage
    ddadminToken.value = localStorage.getItem('ddadmin_token')
    ddadminUser.value = localStorage.getItem('ddadmin_user')
    ddadminUserId.value = localStorage.getItem('ddadmin_id')
    ddadminXsrf.value = localStorage.getItem('ddadmin_xsrf')

    // Load my auth data (Issue #3730)
    myToken.value = localStorage.getItem('my_token')
    myUser.value = localStorage.getItem('my_user')
    myUserId.value = localStorage.getItem('my_id')
    myXsrf.value = localStorage.getItem('my_xsrf')

    // Try to load unified session if available
    if (unifiedAuthService.isAuthenticated()) {
      try {
        const session = await unifiedAuthService.getSession()
        if (session) {
          unifiedSession.value = session
          // Sync tokens to localStorage for backward compatibility
          await syncUnifiedTokensToLocalStorage()
        } else {
          // Session not found on server - just clear unified session, keep legacy tokens
          console.warn('[authStore] Unified session not found, clearing unified session only')
          unifiedSession.value = null
        }
      } catch (err) {
        console.warn('[authStore] Failed to load unified session:', err)
        // Just clear unified session, don't touch legacy tokens
        unifiedSession.value = null
      }
    }
  }

  /**
   * Sync unified session tokens to localStorage for backward compatibility
   */
  async function syncUnifiedTokensToLocalStorage() {
    if (!unifiedAuthService.isAuthenticated()) return

    try {
      const allTokens = await unifiedAuthService.getAllTokens()

      // Sync primary database token
      const currentDb = primaryDatabase.value || 'ddadmin'
      if (allTokens[currentDb]) {
        const dbToken = allTokens[currentDb]
        primaryToken.value = dbToken.token
        primaryXsrf.value = dbToken.xsrf
        primaryUserId.value = dbToken.userId
        primaryUser.value = dbToken.userName

        localStorage.setItem('token', dbToken.token)
        localStorage.setItem('_xsrf', dbToken.xsrf)
        localStorage.setItem('id', dbToken.userId)
        localStorage.setItem('user', dbToken.userName)
      }

      // Sync ddadmin token
      if (allTokens['ddadmin']) {
        const ddToken = allTokens['ddadmin']
        ddadminToken.value = ddToken.token
        ddadminXsrf.value = ddToken.xsrf
        ddadminUserId.value = ddToken.userId
        ddadminUser.value = ddToken.userName

        localStorage.setItem('ddadmin_token', ddToken.token)
        localStorage.setItem('ddadmin_xsrf', ddToken.xsrf)
        localStorage.setItem('ddadmin_id', ddToken.userId)
        localStorage.setItem('ddadmin_user', ddToken.userName)
      }

      // Tokens synced successfully
    } catch (err) {
      console.warn('[authStore] Failed to sync unified tokens:', err)
      // Don't clear legacy tokens - they may still be valid
    }
  }

  /**
   * Clear all authentication data (session expired or logout)
   */
  async function clearAllAuthData() {
    // Clear unified session
    unifiedSession.value = null

    // Clear primary auth
    primaryToken.value = null
    primaryUser.value = null
    primaryUserId.value = null
    primaryXsrf.value = null

    // Clear ddadmin auth
    ddadminToken.value = null
    ddadminUser.value = null
    ddadminUserId.value = null
    ddadminXsrf.value = null

    // Clear my auth (Issue #3730)
    myToken.value = null
    myUser.value = null
    myUserId.value = null
    myXsrf.value = null

    // Clear localStorage
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('id')
    localStorage.removeItem('_xsrf')
    localStorage.removeItem('ddadmin_token')
    localStorage.removeItem('ddadmin_user')
    localStorage.removeItem('ddadmin_id')
    localStorage.removeItem('ddadmin_xsrf')
    localStorage.removeItem('my_token')
    localStorage.removeItem('my_user')
    localStorage.removeItem('my_id')
    localStorage.removeItem('my_xsrf')
    // Issue #5112: Clear OAuth/JWT tokens and session data
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('session_timestamp')
    localStorage.removeItem('integram_session')
    localStorage.removeItem('unified_auth_session_id')
  }

  /**
   * Perform authentication to a specific database
   */
  async function authenticateToDatabase(login, password, apiBase, database) {
    const formData = new URLSearchParams()
    formData.append('login', login)
    formData.append('pwd', password)

    // Determine the base URL
    let baseURL
    if (apiBase === 'localhost') {
      baseURL = `http://localhost/${database}/`
    } else {
      baseURL = `https://${apiBase}/${database}`
    }

    // Create axios instance for this specific database
    const client = axios.create({
      baseURL,
      timeout: 30000, // 30 seconds (was 5000 seconds - fixed security issue)
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    // Make authentication request
    const response = await client.post('/auth', formData, {
      params: { JSON_KV: true },
    })

    let data = response.data

    // Handle case where API returns array instead of object
    if (Array.isArray(data) && data.length > 0) {
      data = data[0]
    }

    // Check if authentication was successful
    // API returns: { token, _xsrf, id, msg } on success
    // or { error, warning } on failure
    if (!data.token) {
      throw new Error(data.error || data.warning || 'Authentication failed')
    }

    return {
      token: data.token,
      _xsrf: data._xsrf,
      id: data.id,
      user: login,
    }
  }

  /**
   * Login to a database
   * Issue #3848: Simplified single token system
   *
   * Simplified authorization logic:
   * 1. Single 'token' in localStorage for all databases
   * 2. If logged into 'my': can access all user's databases via kernel routing
   * 3. If logged into other DB: direct access to that DB only
   */
  // Issue #3924: Changed default from sim.sakhwings.ru to dronedoc.ru to avoid CORS errors
  async function login(
    loginName,
    password,
    apiBase = 'dronedoc.ru',
    database = 'my',
  ) {
    isLoading.value = true
    error.value = null

    try {
      // Store API base and database preference
      primaryDatabase.value = database
      primaryApiBase.value = apiBase
      localStorage.setItem('db', database)
      localStorage.setItem('apiBase', apiBase)

      // Authenticate to the specified database
      const primaryAuth = await authenticateToDatabase(
        loginName,
        password,
        apiBase,
        database,
      )

      // Issue #3848: Store SINGLE token for all databases
      // This token works for:
      // - Direct access to the authenticated database (X-Authorization header)
      // - If database='my': access to all user's databases via kernel routing ('my' header)
      primaryToken.value = primaryAuth.token
      primaryUser.value = primaryAuth.user
      primaryUserId.value = primaryAuth.id
      primaryXsrf.value = primaryAuth._xsrf

      // Issue #3848: Defensive token storage with verification
      // Save token to localStorage with retry and verification
      const tokenData = {
        token: primaryAuth.token,
        user: primaryAuth.user,
        id: primaryAuth.id,
        _xsrf: primaryAuth._xsrf
      }

      // Log before saving (for production debugging)
      console.log('[authStore] Saving authentication tokens to localStorage', {
        database: database,
        hasToken: !!primaryAuth.token,
        tokenLength: primaryAuth.token?.length,
        userId: primaryAuth.id
      })

      // Save each item and verify it was saved
      for (const [key, value] of Object.entries(tokenData)) {
        try {
          localStorage.setItem(key, value)

          // Verify the value was saved correctly
          const savedValue = localStorage.getItem(key)
          if (savedValue !== value) {
            console.error(`[authStore] Failed to save ${key} to localStorage. Expected: ${value}, Got: ${savedValue}`)
            throw new Error(`Failed to save ${key} to localStorage`)
          }
        } catch (error) {
          console.error(`[authStore] Error saving ${key} to localStorage:`, error)
          throw new Error(`Failed to save authentication data to localStorage: ${error.message}`)
        }
      }

      // Final verification that token exists in localStorage
      const verifiedToken = localStorage.getItem('token')
      if (!verifiedToken || verifiedToken !== primaryAuth.token) {
        console.error('[authStore] Token verification failed after save!', {
          expected: primaryAuth.token,
          actual: verifiedToken
        })
        throw new Error('Token verification failed - localStorage may be disabled or full')
      }

      console.log('[authStore] Authentication tokens saved successfully', {
        token: verifiedToken.substring(0, 10) + '...',
        user: localStorage.getItem('user'),
        id: localStorage.getItem('id')
      })

      // Issue #5005: Save session timestamp for expiration validation
      // This allows the router to check if session is still valid
      const sessionTimestamp = Date.now()
      localStorage.setItem('session_timestamp', sessionTimestamp.toString())
      console.log('[authStore] Session timestamp saved:', sessionTimestamp)

      // Issue #3848: integram_session is ONLY for /integram routes
      // It does NOT interact with the rest of the site
      // We still save it for backward compatibility with /integram routes
      const sessionData = {
        database: database,
        token: primaryAuth.token,
        xsrfToken: primaryAuth._xsrf,
        userId: primaryAuth.id,
        userName: primaryAuth.user,
        authDatabase: database,
        timestamp: sessionTimestamp, // Issue #5005: Add timestamp for session expiration
      }
      localStorage.setItem('integram_session', JSON.stringify(sessionData))

      // Issue #3875: Add delay to ensure localStorage writes are committed in production builds
      // In production, minified code runs faster and localStorage writes may not complete
      // before navigation happens. Increased to 100ms to ensure writes are committed to disk
      // across all browsers and devices (especially mobile).
      await new Promise(resolve => setTimeout(resolve, 100))

      // Final verification after delay
      const finalVerification = localStorage.getItem('token')
      if (!finalVerification) {
        console.error('[authStore] CRITICAL: Token disappeared after delay!', {
          expected: primaryAuth.token,
          actual: finalVerification
        })
        throw new Error('Token verification failed after commit delay - localStorage may be disabled')
      }

      console.log('[authStore] Final verification passed, token persisted successfully')

      return { success: true, user: primaryAuth.user }
    } catch (err) {
      error.value = err.message || 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Logout from all databases
   * Issue #3848: Simplified logout - clear single token
   */
  async function logout() {
    // Clear unified session first (if exists)
    if (unifiedAuthService.isAuthenticated()) {
      try {
        await unifiedAuthService.logout()
      } catch (err) {
        console.warn('[authStore] Failed to logout from unified session:', err)
      }
    }

    // Clear unified session state
    unifiedSession.value = null

    // Issue #3848: Clear the single token system
    primaryToken.value = null
    primaryUser.value = null
    primaryUserId.value = null
    primaryXsrf.value = null

    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('id')
    localStorage.removeItem('_xsrf')

    // Clear legacy tokens (backward compatibility)
    ddadminToken.value = null
    ddadminUser.value = null
    ddadminUserId.value = null
    ddadminXsrf.value = null

    localStorage.removeItem('ddadmin_token')
    localStorage.removeItem('ddadmin_user')
    localStorage.removeItem('ddadmin_id')
    localStorage.removeItem('ddadmin_xsrf')

    myToken.value = null
    myUser.value = null
    myUserId.value = null
    myXsrf.value = null

    localStorage.removeItem('my_token')
    localStorage.removeItem('my_user')
    localStorage.removeItem('my_id')
    localStorage.removeItem('my_xsrf')

    // Issue #5112: Clear OAuth/JWT tokens
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')

    // Issue #3848: integram_session is ONLY for /integram routes
    // Clear it separately to not interfere with the rest of the site
    localStorage.removeItem('integram_session')
    localStorage.removeItem('unified_auth_session_id')

    // Issue #5005: Clear session timestamp on logout
    localStorage.removeItem('session_timestamp')

    // Keep apiBase and db in localStorage for next login
  }

  /**
   * Get token for any database from unified session
   * @param {string} database - Database name
   * @returns {Promise<Object|null>} Token data or null
   */
  async function getTokenForDatabase(database) {
    // First try unified auth
    if (unifiedAuthService.isAuthenticated()) {
      try {
        const tokenData = await unifiedAuthService.getTokenForDatabase(database)
        if (tokenData) {
          return tokenData
        }
      } catch (err) {
        console.warn(`[authStore] Failed to get token for ${database} from unified auth:`, err)
      }
    }

    // Fallback to localStorage
    if (database === 'ddadmin') {
      const token = ddadminToken.value || localStorage.getItem('ddadmin_token')
      if (token) {
        return {
          token,
          xsrf: ddadminXsrf.value || localStorage.getItem('ddadmin_xsrf'),
          userId: ddadminUserId.value || localStorage.getItem('ddadmin_id'),
          userName: ddadminUser.value || localStorage.getItem('ddadmin_user'),
          database: 'ddadmin'
        }
      }
    } else {
      const currentDb = primaryDatabase.value || localStorage.getItem('db')
      if (database === currentDb) {
        const token = primaryToken.value || localStorage.getItem('token')
        if (token) {
          return {
            token,
            xsrf: primaryXsrf.value || localStorage.getItem('_xsrf'),
            userId: primaryUserId.value || localStorage.getItem('id'),
            userName: primaryUser.value || localStorage.getItem('user'),
            database: currentDb
          }
        }
      }
    }

    return null
  }

  /**
   * Get all available tokens
   * @returns {Promise<Object>} Map of database → token data
   */
  async function getAllTokens() {
    // First try unified auth
    if (unifiedAuthService.isAuthenticated()) {
      try {
        return await unifiedAuthService.getAllTokens()
      } catch (err) {
        console.warn('[authStore] Failed to get all tokens from unified auth:', err)
      }
    }

    // Fallback to localStorage
    const tokens = {}

    const currentDb = primaryDatabase.value || localStorage.getItem('db')
    const primaryTokenVal = primaryToken.value || localStorage.getItem('token')
    if (primaryTokenVal) {
      tokens[currentDb] = {
        token: primaryTokenVal,
        xsrf: primaryXsrf.value || localStorage.getItem('_xsrf'),
        userId: primaryUserId.value || localStorage.getItem('id'),
        userName: primaryUser.value || localStorage.getItem('user'),
        database: currentDb
      }
    }

    const ddadminTokenVal = ddadminToken.value || localStorage.getItem('ddadmin_token')
    if (ddadminTokenVal) {
      tokens['ddadmin'] = {
        token: ddadminTokenVal,
        xsrf: ddadminXsrf.value || localStorage.getItem('ddadmin_xsrf'),
        userId: ddadminUserId.value || localStorage.getItem('ddadmin_id'),
        userName: ddadminUser.value || localStorage.getItem('ddadmin_user'),
        database: 'ddadmin'
      }
    }

    return tokens
  }

  /**
   * Get list of available databases
   * @returns {Promise<Array<string>>} List of database names
   */
  async function getAvailableDatabases() {
    if (unifiedAuthService.isAuthenticated()) {
      try {
        return await unifiedAuthService.getAvailableDatabases()
      } catch (err) {
        console.warn('[authStore] Failed to get available databases:', err)
      }
    }

    // Fallback to known databases
    const databases = []
    if (primaryToken.value || localStorage.getItem('token')) {
      databases.push(primaryDatabase.value || localStorage.getItem('db'))
    }
    if (ddadminToken.value || localStorage.getItem('ddadmin_token')) {
      databases.push('ddadmin')
    }
    return databases
  }

  /**
   * Get authentication data for ddadmin database
   */
  function getDdadminAuth() {
    return {
      token: ddadminToken.value,
      user: ddadminUser.value,
      id: ddadminUserId.value,
      xsrf: ddadminXsrf.value,
      isAuthenticated: isDdadminAuthenticated.value,
    }
  }

  /**
   * Get authentication data for my database (Issue #3730)
   */
  function getMyAuth() {
    return {
      token: myToken.value,
      user: myUser.value,
      id: myUserId.value,
      xsrf: myXsrf.value,
      isAuthenticated: isMyAuthenticated.value,
    }
  }

  /**
   * Get authentication data for primary database
   */
  function getPrimaryAuth() {
    return {
      token: primaryToken.value,
      user: primaryUser.value,
      id: primaryUserId.value,
      xsrf: primaryXsrf.value,
      database: primaryDatabase.value,
      apiBase: primaryApiBase.value,
      isAuthenticated: isAuthenticated.value,
    }
  }

  return {
    // State
    primaryToken,
    primaryUser,
    primaryUserId,
    primaryXsrf,
    primaryDatabase,
    primaryApiBase,
    ddadminToken,
    ddadminUser,
    ddadminUserId,
    ddadminXsrf,
    myToken,
    myUser,
    myUserId,
    myXsrf,
    isLoading,
    error,
    unifiedSession,

    // Computed
    isAuthenticated,
    isDdadminAuthenticated,
    isMyAuthenticated,

    // Actions
    initFromLocalStorage,
    login,
    logout,
    clearAllAuthData,
    getDdadminAuth,
    getMyAuth,
    getPrimaryAuth,
    getTokenForDatabase,
    getAllTokens,
    getAvailableDatabases,
    syncUnifiedTokensToLocalStorage,
  }
})
