/**
 * useIntegramSession Composable
 * Provides reactive access to Integram session state and authentication
 */

import { ref, computed } from 'vue'
import integramService from '@/services/integramService'

// Reactive session state
const sessionId = ref(null)
const database = ref('')
const serverURL = ref('')
const userName = ref('')
const userRole = ref('')
const userId = ref(null)

// Initialize from service
function initSession() {
  integramService.loadSession()
  database.value = integramService.database
  serverURL.value = integramService.serverURL
  userName.value = integramService.userName
  userRole.value = integramService.userRole
  userId.value = integramService.userId
  sessionId.value = integramService.authToken ? Date.now() : null
}

// Call init on module load
initSession()

export function useIntegramSession() {
  const isAuthenticated = computed(() => {
    return integramService.isAuthenticated()
  })

  const authenticate = (credentials) => {
    // Set session data
    if (credentials.token) {
      integramService.authToken = credentials.token
    }
    if (credentials.xsrf) {
      integramService.xsrfToken = credentials.xsrf
    }
    if (credentials.database) {
      integramService.database = credentials.database
      database.value = credentials.database
    }
    if (credentials.serverURL) {
      integramService.setServer(credentials.serverURL)
      serverURL.value = credentials.serverURL
    }
    if (credentials.userName) {
      integramService.userName = credentials.userName
      userName.value = credentials.userName
    }
    if (credentials.userRole) {
      integramService.userRole = credentials.userRole
      userRole.value = credentials.userRole
    }
    if (credentials.userId) {
      integramService.userId = credentials.userId
      userId.value = credentials.userId
    }

    integramService.saveSession()
    sessionId.value = Date.now()
  }

  const logout = () => {
    integramService.clearSession()
    database.value = ''
    serverURL.value = ''
    userName.value = ''
    userRole.value = ''
    userId.value = null
    sessionId.value = null
  }

  const refreshSession = () => {
    initSession()
  }

  return {
    // State
    isAuthenticated,
    database: computed(() => database.value),
    serverURL: computed(() => serverURL.value),
    userName: computed(() => userName.value),
    userRole: computed(() => userRole.value),
    userId: computed(() => userId.value),
    sessionId: computed(() => sessionId.value),

    // Methods
    authenticate,
    logout,
    refreshSession
  }
}
