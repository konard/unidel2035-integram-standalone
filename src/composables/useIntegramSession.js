/**
 * useIntegramSession Composable
 * Provides reactive access to Integram session state
 */

import { ref, computed } from 'vue'
import integramApiClient from '@/services/integramApiClient'

// Shared reactive state
const sessionId = ref(null)

/**
 * Composable for Integram session management
 */
export function useIntegramSession() {
  /**
   * Check if user is authenticated
   */
  const isAuthenticated = computed(() => {
    return integramApiClient.isAuthenticated()
  })

  /**
   * Get current database
   */
  const database = computed(() => {
    return integramApiClient.getDatabase()
  })

  /**
   * Get user info
   */
  const userName = computed(() => {
    return integramApiClient.userName
  })

  const userId = computed(() => {
    return integramApiClient.userId
  })

  const userRole = computed(() => {
    return integramApiClient.userRole
  })

  /**
   * Authenticate with Integram
   */
  async function authenticate(database, login, password) {
    const result = await integramApiClient.authenticate(database, login, password)
    if (result.success) {
      sessionId.value = `${database}-${result.userId}`
    }
    return result
  }

  /**
   * Logout
   */
  function logout() {
    integramApiClient.logout()
    sessionId.value = null
  }

  /**
   * Switch database
   */
  async function switchDatabase(dbName) {
    await integramApiClient.switchDatabase(dbName)
  }

  return {
    isAuthenticated,
    database,
    userName,
    userId,
    userRole,
    sessionId,
    authenticate,
    logout,
    switchDatabase
  }
}
