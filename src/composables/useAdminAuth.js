/**
 * useAdminAuth composable - Stub implementation
 * Provides admin authentication utilities
 */

import { ref } from 'vue'

export function useAdminAuth() {
  const adminRole = ref(null)
  const adminUser = ref(null)

  const logout = () => {
    adminRole.value = null
    adminUser.value = null
  }

  const hasPermission = (roles) => {
    return false
  }

  return {
    adminRole,
    adminUser,
    logout,
    hasPermission
  }
}
