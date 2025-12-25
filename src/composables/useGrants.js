/**
 * useGrants Composable
 * Provides access control and permission checking for Integram objects
 */

import { computed } from 'vue'
import { useIntegramSession } from './useIntegramSession'

export function useGrants() {
  const { userRole, userId } = useIntegramSession()

  /**
   * Check if user can edit an object
   */
  const canEdit = computed(() => (objectData) => {
    // Admin can edit everything
    if (userRole.value === 'admin') {
      return true
    }

    // Object owner can edit
    if (objectData && objectData.ownerId === userId.value) {
      return true
    }

    // Check grants property
    if (objectData && objectData.grants) {
      return objectData.grants.edit === true
    }

    // Default: allow editing (can be made more restrictive)
    return true
  })

  /**
   * Check if user can delete an object
   */
  const canDelete = computed(() => (objectData) => {
    // Admin can delete everything
    if (userRole.value === 'admin') {
      return true
    }

    // Object owner can delete
    if (objectData && objectData.ownerId === userId.value) {
      return true
    }

    // Check grants property
    if (objectData && objectData.grants) {
      return objectData.grants.delete === true
    }

    // Default: allow deleting (can be made more restrictive)
    return true
  })

  /**
   * Check if user can view an object
   */
  const canView = computed(() => (objectData) => {
    // Admin can view everything
    if (userRole.value === 'admin') {
      return true
    }

    // Object owner can view
    if (objectData && objectData.ownerId === userId.value) {
      return true
    }

    // Check grants property
    if (objectData && objectData.grants) {
      return objectData.grants.view === true
    }

    // Default: allow viewing
    return true
  })

  /**
   * Check if user is admin
   */
  const isAdmin = computed(() => {
    return userRole.value === 'admin'
  })

  return {
    canEdit,
    canDelete,
    canView,
    isAdmin,
    userRole,
    userId
  }
}
