/**
 * useGrants Composable
 * Handles GRANT type (type 5) functionality in Integram
 *
 * Grants are special reference types in Integram that represent permissions
 * This composable provides utilities for working with grants
 */

import { ref, computed } from 'vue'

// Shared state for grant options
const grantOptions = ref([])
const loading = ref(false)

/**
 * System grants (predefined grant types)
 */
const SYSTEM_GRANTS = {
  READ: { id: 1, name: 'Read', severity: 'info', icon: 'pi-eye' },
  WRITE: { id: 2, name: 'Write', severity: 'warning', icon: 'pi-pencil' },
  DELETE: { id: 3, name: 'Delete', severity: 'danger', icon: 'pi-trash' },
  ADMIN: { id: 4, name: 'Admin', severity: 'danger', icon: 'pi-shield' }
}

/**
 * Composable for working with grants
 */
export function useGrants() {
  /**
   * Load grant options from API
   */
  async function loadGrantOptions() {
    loading.value = true
    try {
      // In a real implementation, this would fetch from API
      // For now, use system grants as default
      grantOptions.value = Object.values(SYSTEM_GRANTS).map(grant => ({
        id: grant.id,
        value: grant.name,
        severity: grant.severity,
        icon: grant.icon
      }))
    } catch (error) {
      console.error('Failed to load grant options:', error)
      grantOptions.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Format grant value for display
   */
  function formatGrantValue(grantId) {
    if (!grantId) return ''

    const grant = grantOptions.value.find(g => g.id === grantId)
    return grant ? grant.value : `Grant #${grantId}`
  }

  /**
   * Get severity level for grant (for badge/tag coloring)
   */
  function getGrantSeverity(grantId) {
    if (!grantId) return 'info'

    const grant = grantOptions.value.find(g => g.id === grantId)
    return grant ? grant.severity : 'info'
  }

  /**
   * Get icon for grant
   */
  function getGrantIcon(grantId) {
    if (!grantId) return 'pi-lock'

    const grant = grantOptions.value.find(g => g.id === grantId)
    return grant ? grant.icon : 'pi-lock'
  }

  /**
   * Check if a grant is a system grant
   */
  function isSystemGrant(grantId) {
    return Object.values(SYSTEM_GRANTS).some(g => g.id === grantId)
  }

  /**
   * Check if a requisite is a grant type
   */
  function isRequisiteGrant(requisite) {
    // Grant requisites have type ID 5
    return requisite && (requisite.type === 5 || requisite.typeId === 5)
  }

  /**
   * Get warning message for grant operations
   */
  function getGrantWarning(grantId) {
    const grant = grantOptions.value.find(g => g.id === grantId)

    if (!grant) return null

    // Return warnings for dangerous grants
    if (grant.id === SYSTEM_GRANTS.DELETE.id) {
      return 'This grant allows users to delete data. Use with caution.'
    }

    if (grant.id === SYSTEM_GRANTS.ADMIN.id) {
      return 'This grant provides full administrative access. Only assign to trusted users.'
    }

    return null
  }

  return {
    grantOptions: computed(() => grantOptions.value),
    loading: computed(() => loading.value),
    loadGrantOptions,
    formatGrantValue,
    getGrantSeverity,
    getGrantIcon,
    isSystemGrant,
    isRequisiteGrant,
    getGrantWarning
  }
}
