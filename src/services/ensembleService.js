/**
 * Ensemble Service
 *
 * Frontend service for interacting with ensemble deployment API.
 * Handles fetching available ensembles and deploying them to organizations.
 *
 * Issue #3114 - Phase 2: Ensemble Deployment
 */

const API_BASE_URL = import.meta.env.VITE_ORCHESTRATOR_URL || '/api'

/**
 * Get all available ensembles
 * @returns {Promise<Array>} List of ensembles
 */
export async function getAllEnsembles() {
  try {
    const response = await fetch(`${API_BASE_URL}/ensembles`)

    if (!response.ok) {
      throw new Error(`Failed to fetch ensembles: ${response.statusText}`)
    }

    const result = await response.json()
    return result.data || []
  } catch (error) {
    console.error('[EnsembleService] Failed to get ensembles:', error)
    throw error
  }
}

/**
 * Get ensemble details by ID
 * @param {string} ensembleId - Ensemble identifier
 * @returns {Promise<Object>} Ensemble details
 */
export async function getEnsemble(ensembleId) {
  try {
    const response = await fetch(`${API_BASE_URL}/ensembles/${ensembleId}`)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Ensemble not found')
      }
      throw new Error(`Failed to fetch ensemble: ${response.statusText}`)
    }

    const result = await response.json()
    return result.data
  } catch (error) {
    console.error('[EnsembleService] Failed to get ensemble:', error)
    throw error
  }
}

/**
 * Deploy an ensemble to an organization
 * @param {string} organizationId - Organization UUID
 * @param {string} ensembleId - Ensemble identifier
 * @param {Object} options - Deployment options
 * @param {boolean} options.stopOnError - Stop deployment if any agent fails
 * @param {boolean} options.rollbackOnError - Rollback on failure
 * @returns {Promise<Object>} Deployment result
 */
export async function deployEnsemble(organizationId, ensembleId, options = {}) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/organizations/${organizationId}/deploy-ensemble`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ensembleId,
          options
        })
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || `Deployment failed: ${response.statusText}`)
    }

    const result = await response.json()
    return result.data
  } catch (error) {
    console.error('[EnsembleService] Deployment failed:', error)
    throw error
  }
}

/**
 * Check which ensembles are deployed in an organization
 * @param {string} organizationId - Organization UUID
 * @returns {Promise<Array>} Ensembles with deployment status
 */
export async function getOrganizationEnsembles(organizationId) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/organizations/${organizationId}/ensembles`
    )

    if (!response.ok) {
      throw new Error(`Failed to check ensembles: ${response.statusText}`)
    }

    const result = await response.json()
    return result.data || []
  } catch (error) {
    console.error('[EnsembleService] Failed to check organization ensembles:', error)
    throw error
  }
}

/**
 * Get ensembles by category
 * @param {string} category - Category name (it, ecommerce, telecom, hr)
 * @returns {Promise<Array>} Filtered ensembles
 */
export async function getEnsemblesByCategory(category) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/ensembles/category/${category}`
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch ensembles: ${response.statusText}`)
    }

    const result = await response.json()
    return result.data || []
  } catch (error) {
    console.error('[EnsembleService] Failed to get ensembles by category:', error)
    throw error
  }
}

/**
 * Helper: Check if ensemble is fully deployed
 * @param {Object} deploymentStatus - Deployment status from getOrganizationEnsembles
 * @returns {boolean} True if all agents deployed
 */
export function isEnsembleDeployed(deploymentStatus) {
  return deploymentStatus?.deployment?.isDeployed || false
}

/**
 * Helper: Get missing agents for an ensemble
 * @param {Object} deploymentStatus - Deployment status from getOrganizationEnsembles
 * @returns {Array<string>} Array of missing agent IDs
 */
export function getMissingAgents(deploymentStatus) {
  return deploymentStatus?.deployment?.missingAgents || []
}

/**
 * Helper: Format deployment result for UI display
 * @param {Object} result - Deployment result from deployEnsemble
 * @returns {Object} Formatted result
 */
export function formatDeploymentResult(result) {
  return {
    success: result.success,
    ensembleName: result.ensembleName,
    deployed: result.deployedAgents,
    total: result.totalAgents,
    failed: result.failedAgents,
    duration: `${result.durationSeconds}s`,
    instances: result.instances || [],
    errors: result.errors || [],
    onboardingSteps: result.onboardingSteps || []
  }
}
