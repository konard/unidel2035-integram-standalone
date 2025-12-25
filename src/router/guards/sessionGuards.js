// Session and Authentication Guards
// Extracted from router/index.js to eliminate duplication
// Issue #3790, #5005, #5112

import { logger } from '@/utils/logger'

// Session expiration time: 7 days in milliseconds
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Check if session timestamp is valid (not expired)
 * Issue #5005: Sessions older than 7 days are considered expired
 * Sessions without timestamp are also considered expired (legacy cleanup)
 */
export function isSessionTimestampValid() {
  const timestamp = localStorage.getItem('session_timestamp')
  if (!timestamp) {
    // No timestamp = old session format, consider expired
    // This forces re-authentication for stale sessions
    logger.debug('[Router] No session_timestamp found - session considered expired')
    return false
  }

  const sessionAge = Date.now() - parseInt(timestamp, 10)
  if (sessionAge > SESSION_MAX_AGE_MS) {
    logger.debug('[Router] Session expired', { ageMs: sessionAge, maxAgeMs: SESSION_MAX_AGE_MS })
    return false
  }

  return true
}

/**
 * Clear all auth-related localStorage keys
 * Issue #5005: Used when session is detected as expired
 */
export function clearExpiredSession() {
  const keysToRemove = [
    '_xsrf', 'token', 'user', 'id', 'session_timestamp',
    'accessToken', 'refreshToken', // Issue #5112: OAuth/JWT tokens
    'integram_session', 'unified_auth_session_id',
    'ddadmin_token', 'ddadmin_user', 'ddadmin_id', 'ddadmin_xsrf',
    'my_token', 'my_user', 'my_id', 'my_xsrf'
  ]
  keysToRemove.forEach(key => localStorage.removeItem(key))
  logger.debug('[Router] Cleared expired session data')
}

/**
 * Issue #3700: Check if user has ANY valid session (legacy or Integram)
 * Issue #3790: This is now the ONLY authentication check - no API calls
 * Issue #5005: Added session timestamp validation to prevent stale sessions
 *
 * This function checks multiple authentication sources:
 * 1. Legacy localStorage keys (_xsrf, user) - used by main Login.vue
 * 2. integram_session - used by IntegramLogin.vue
 * 3. unified_auth_session_id - used by unified auth service
 *
 * Returns an object with:
 * - hasSession: boolean indicating if any session exists
 * - sessionType: 'legacy' | 'integram' | 'unified' | 'oauth' | null
 * - userName: the user's name if available
 */
export function checkSessionExists() {
  // Check for legacy session (Login.vue stores these)
  const legacyXsrf = localStorage.getItem('_xsrf')
  const legacyUser = localStorage.getItem('user')
  if (legacyXsrf && legacyUser) {
    // Issue #5005: Validate session timestamp
    if (!isSessionTimestampValid()) {
      clearExpiredSession()
      return { hasSession: false, sessionType: null, userName: null }
    }
    return { hasSession: true, sessionType: 'legacy', userName: legacyUser }
  }

  // Issue #5112: Check for OAuth/JWT session (OAuthCallback.vue stores accessToken)
  // OAuth callback stores: token, accessToken, user, id, session_timestamp
  // But does NOT store _xsrf - so we need to check accessToken separately
  const accessToken = localStorage.getItem('accessToken')
  const oauthUser = localStorage.getItem('user')
  if (accessToken && oauthUser) {
    // Validate session timestamp for OAuth sessions
    if (!isSessionTimestampValid()) {
      clearExpiredSession()
      return { hasSession: false, sessionType: null, userName: null }
    }
    logger.debug('[Router] OAuth/JWT session detected', { user: oauthUser })
    return { hasSession: true, sessionType: 'oauth', userName: oauthUser }
  }

  // Check for Integram session (IntegramLogin.vue stores this)
  const integramSession = localStorage.getItem('integram_session')
  if (integramSession) {
    try {
      const sessionData = JSON.parse(integramSession)
      if (sessionData.token) {
        // Issue #5005: Check session timestamp for Integram sessions too
        // Integram sessions store their own timestamp in the JSON
        const integramTimestamp = sessionData.timestamp || sessionData.created_at
        if (integramTimestamp) {
          const sessionAge = Date.now() - integramTimestamp
          if (sessionAge > SESSION_MAX_AGE_MS) {
            logger.debug('[Router] Integram session expired')
            localStorage.removeItem('integram_session')
            return { hasSession: false, sessionType: null, userName: null }
          }
        }
        return {
          hasSession: true,
          sessionType: 'integram',
          userName: sessionData.userName || sessionData.login || 'user'
        }
      }
    } catch (e) {
      console.warn('[Router] Failed to parse integram_session:', e)
    }
  }

  // Check for unified auth session
  const unifiedSessionId = localStorage.getItem('unified_auth_session_id')
  if (unifiedSessionId) {
    // Issue #5005: Unified sessions also need timestamp validation
    if (!isSessionTimestampValid()) {
      clearExpiredSession()
      return { hasSession: false, sessionType: null, userName: null }
    }
    return { hasSession: true, sessionType: 'unified', userName: null }
  }

  return { hasSession: false, sessionType: null, userName: null }
}

/**
 * Issue #3790: Kept clearUserCache export for backward compatibility with Login.vue
 * This is a no-op function now that we removed API-based caching
 */
export function clearUserCache() {
  // No-op function kept for backward compatibility
  // Previously cleared userDataCache, but that's no longer used
}
