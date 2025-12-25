/**
 * Unified Token Management Service
 *
 * Provides token management services using the unified token API
 * from Phase 2 (backend/monolith/src/api/routes/ai-tokens.js)
 *
 * Features:
 * - Get user's AI tokens
 * - Create new AI tokens
 * - Get token usage statistics
 * - Track token operations
 * - Manage token balance and limits
 *
 * Issue #2786 - Phase 4: Frontend Integration
 */

import axios from 'axios'
import { logger } from '@/utils/logger'

const API_BASE = import.meta.env.VITE_ORCHESTRATOR_URL || 'http://localhost:8081/api'

/**
 * Get all tokens for current user
 *
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Array>} List of user's AI tokens
 */
export async function getMyTokens(accessToken) {
  try {
    logger.info('Fetching user tokens')

    const response = await axios.get(`${API_BASE}/ai-tokens/my-tokens`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch tokens')
    }

    const tokens = response.data.data

    logger.info('User tokens fetched', { count: tokens.length })

    return tokens
  } catch (error) {
    logger.error('Failed to fetch user tokens', {
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch tokens')
  }
}

/**
 * Get default token for current user
 * Each user automatically gets a default token on registration
 *
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Default token with model info
 */
export async function getDefaultToken(accessToken) {
  try {
    logger.info('Fetching default token')

    const response = await axios.get(`${API_BASE}/ai-tokens/default-token`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch default token')
    }

    const data = response.data.data

    logger.info('Default token fetched', {
      tokenId: data.token.id,
      model: data.defaultModel.model_name
    })

    return {
      token: data.token,
      defaultModel: data.defaultModel
    }
  } catch (error) {
    logger.error('Failed to fetch default token', {
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch default token')
  }
}

/**
 * Create new AI token
 *
 * @param {Object} tokenData - Token configuration
 * @param {string} tokenData.provider - Provider name (deepseek, openai, etc.)
 * @param {string} tokenData.model - Model name
 * @param {number} [tokenData.balance] - Initial balance (default: 1000000)
 * @param {number} [tokenData.dailyLimit] - Daily limit (default: 100000)
 * @param {number} [tokenData.monthlyLimit] - Monthly limit (default: 1000000)
 * @param {string} [tokenData.name] - Token name (optional)
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Created token data
 */
export async function createToken(tokenData, accessToken) {
  try {
    logger.info('Creating new token', {
      provider: tokenData.provider,
      model: tokenData.model
    })

    const response = await axios.post(
      `${API_BASE}/ai-tokens/create`,
      {
        provider: tokenData.provider,
        model: tokenData.model,
        balance: tokenData.balance || 1000000,
        dailyLimit: tokenData.dailyLimit || 100000,
        monthlyLimit: tokenData.monthlyLimit || 1000000,
        name: tokenData.name
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to create token')
    }

    const token = response.data.data

    logger.info('Token created successfully', {
      tokenId: token.id,
      tokenPrefix: token.token_prefix
    })

    return token
  } catch (error) {
    logger.error('Failed to create token', {
      error: error.message,
      provider: tokenData.provider
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to create token')
  }
}

/**
 * Get usage statistics for a token
 *
 * @param {string} tokenId - Token ID (dd_tok_xxx)
 * @param {string} period - Time period (day, week, month, year, all)
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Usage statistics
 */
export async function getUsageStats(tokenId, period = 'month', accessToken) {
  try {
    logger.info('Fetching usage statistics', { tokenId, period })

    const response = await axios.get(`${API_BASE}/ai-tokens/usage/${tokenId}`, {
      params: { period },
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch usage stats')
    }

    const stats = response.data.data

    logger.info('Usage statistics fetched', {
      tokenId,
      totalOperations: stats.totalOperations,
      totalCost: stats.totalCost
    })

    return stats
  } catch (error) {
    logger.error('Failed to fetch usage statistics', {
      tokenId,
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch usage stats')
  }
}

/**
 * Get detailed usage logs for a token
 *
 * @param {string} tokenId - Token ID (dd_tok_xxx)
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Number of logs to fetch (default: 50)
 * @param {number} [options.offset] - Offset for pagination
 * @param {string} [options.startDate] - Start date filter (ISO string)
 * @param {string} [options.endDate] - End date filter (ISO string)
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Array>} Usage logs
 */
export async function getUsageLogs(tokenId, options = {}, accessToken) {
  try {
    logger.info('Fetching usage logs', { tokenId, options })

    const response = await axios.get(`${API_BASE}/ai-tokens/usage-logs/${tokenId}`, {
      params: {
        limit: options.limit || 50,
        offset: options.offset || 0,
        startDate: options.startDate,
        endDate: options.endDate
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch usage logs')
    }

    const logs = response.data.data

    logger.info('Usage logs fetched', {
      tokenId,
      count: logs.length
    })

    return logs
  } catch (error) {
    logger.error('Failed to fetch usage logs', {
      tokenId,
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch usage logs')
  }
}

/**
 * Update token limits
 *
 * @param {string} tokenId - Token ID (dd_tok_xxx)
 * @param {Object} limits - New limits
 * @param {number} [limits.dailyLimit] - Daily limit
 * @param {number} [limits.monthlyLimit] - Monthly limit
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Updated token
 */
export async function updateTokenLimits(tokenId, limits, accessToken) {
  try {
    logger.info('Updating token limits', { tokenId, limits })

    const response = await axios.patch(
      `${API_BASE}/ai-tokens/${tokenId}/limits`,
      {
        dailyLimit: limits.dailyLimit,
        monthlyLimit: limits.monthlyLimit
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update token limits')
    }

    const token = response.data.data

    logger.info('Token limits updated successfully', { tokenId })

    return token
  } catch (error) {
    logger.error('Failed to update token limits', {
      tokenId,
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to update token limits')
  }
}

/**
 * Revoke (delete) a token
 *
 * @param {string} tokenId - Token ID (dd_tok_xxx)
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Success result
 */
export async function revokeToken(tokenId, accessToken) {
  try {
    logger.info('Revoking token', { tokenId })

    const response = await axios.delete(`${API_BASE}/ai-tokens/${tokenId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to revoke token')
    }

    logger.info('Token revoked successfully', { tokenId })

    return {
      success: true
    }
  } catch (error) {
    logger.error('Failed to revoke token', {
      tokenId,
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to revoke token')
  }
}

/**
 * Get available AI models
 *
 * @param {string} [accessToken] - User's access token (optional)
 * @returns {Promise<Array>} List of available models
 */
export async function getAvailableModels(accessToken = null) {
  try {
    logger.info('Fetching available AI models')

    const headers = {}
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const response = await axios.get(`${API_BASE}/ai-tokens/models`, {
      headers
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch models')
    }

    const models = response.data.data

    logger.info('Available models fetched', { count: models.length })

    return models
  } catch (error) {
    logger.error('Failed to fetch available models', {
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch models')
  }
}

/**
 * Get AI model providers
 *
 * @param {string} [accessToken] - User's access token (optional)
 * @returns {Promise<Array>} List of providers
 */
export async function getProviders(accessToken = null) {
  try {
    logger.info('Fetching AI providers')

    const headers = {}
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const response = await axios.get(`${API_BASE}/ai-tokens/providers`, {
      headers
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch providers')
    }

    const providers = response.data.data

    logger.info('AI providers fetched', { count: providers.length })

    return providers
  } catch (error) {
    logger.error('Failed to fetch AI providers', {
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch providers')
  }
}

/**
 * Perform AI operation with token
 * This is a convenience method that other services can use
 *
 * @param {string} tokenId - Token ID (dd_tok_xxx)
 * @param {Object} operation - Operation details
 * @param {string} operation.application - Application name
 * @param {string} operation.operation - Operation type
 * @param {string} operation.prompt - AI prompt
 * @param {Object} [operation.options] - Additional options
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} AI operation result
 */
export async function performAIOperation(tokenId, operation, accessToken) {
  try {
    logger.info('Performing AI operation', {
      tokenId,
      application: operation.application,
      operation: operation.operation
    })

    const response = await axios.post(
      `${API_BASE}/ai-tokens/chat`,
      {
        tokenId,
        application: operation.application,
        operation: operation.operation,
        prompt: operation.prompt,
        ...operation.options
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'AI operation failed')
    }

    const result = response.data.data

    logger.info('AI operation completed', {
      tokenId,
      tokensUsed: result.usage?.totalTokens
    })

    return result
  } catch (error) {
    logger.error('AI operation failed', {
      tokenId,
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'AI operation failed')
  }
}

/**
 * Get user's balance (total token balance across all tokens)
 *
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<number>} Total balance in tokens
 */
export async function getUserBalance(accessToken) {
  try {
    logger.info('Fetching user balance')

    const response = await axios.get(`${API_BASE}/ai-tokens/balance`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch balance')
    }

    const balance = response.data.data.balance || 0

    logger.info('User balance fetched', { balance })

    return balance
  } catch (error) {
    logger.error('Failed to fetch user balance', {
      error: error.message
    })
    // If endpoint doesn't exist yet, try to get from default token
    try {
      const { token } = await getDefaultToken(accessToken)
      return token.token_balance || 0
    } catch (fallbackError) {
      logger.warn('Fallback to default token failed, returning 0', { error: fallbackError.message })
      return 0
    }
  }
}

/**
 * Get token usage aggregate for a user/period (compat function for Tokens.vue)
 *
 * @param {string} period - daily | monthly | all
 * @param {string|null} userId - optional user ID
 * @param {string|null} application - optional application filter
 * @returns {Promise<Object>} { daily_usage, monthly_usage, ... } (shape depends on backend)
 */
export async function getTokenUsage(period = 'monthly', userId = null, application = null) {
  try {
    const params = { period }
    if (userId) params.userId = userId
    if (application) params.application = application

    const headers = {}
    const token = getAuthToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    const { data } = await axios.get(`${API_BASE}/ai-tokens/usage`, { params, headers })
    if (data?.success === false) {
      throw new Error(data?.error || 'Failed to fetch token usage')
    }
    return data?.data ?? data
  } catch (error) {
    logger.warn('getTokenUsage failed, returning empty usage object', { error: error.message })
    return { daily_usage: 0, monthly_usage: 0 }
  }
}

/**
 * Get token usage history (compat function for Tokens.vue)
 *
 * @param {number} limit - number of records
 * @param {number} offset - offset
 * @param {string|null} userId - optional user ID
 * @returns {Promise<Object|Array>} history data depending on backend
 */
export async function getTokenUsageHistory(limit = 100, offset = 0, userId = null) {
  try {
    const params = { limit, offset, groupBy: 'none' }
    if (userId) params.userId = userId

    const headers = {}
    const token = getAuthToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    const { data } = await axios.get(`${API_BASE}/ai-tokens/usage`, { params, headers })
    if (data?.success === false) {
      throw new Error(data?.error || 'Failed to fetch usage history')
    }
    return data?.data ?? data
  } catch (error) {
    logger.warn('getTokenUsageHistory failed, returning empty history', { error: error.message })
    return []
  }
}

// Internal: fetch bearer token from storage if present
function getAuthToken() {
  return (
    localStorage.getItem('auth_token') ||
    sessionStorage.getItem('auth_token') ||
    localStorage.getItem('access_token') ||
    ''
  )
}

export default {
  getMyTokens,
  getDefaultToken,
  createToken,
  getUsageStats,
  getUsageLogs,
  updateTokenLimits,
  revokeToken,
  getAvailableModels,
  getProviders,
  performAIOperation,
  getUserBalance
}
