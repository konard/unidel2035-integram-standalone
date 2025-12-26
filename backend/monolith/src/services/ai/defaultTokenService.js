/**
 * Default Token Service
 *
 * Service for creating and managing default AI tokens for new users
 * Issue #5025 - Automatic default token creation on registration
 */

import crypto from 'crypto'
import axios from 'axios'
import logger from '../../utils/logger.js'

// DronDoc API configuration
const DRONEDOC_API_BASE_URL = process.env.DRONEDOC_API_BASE_URL || 'https://dronedoc.ru'
const DRONEDOC_AUTH_TOKEN = process.env.DRONEDOC_AUTH_TOKEN || ''
const INTEGRAM_SYSTEM_USERNAME = process.env.INTEGRAM_REGISTRATION_USERNAME || process.env.INTEGRAM_SYSTEM_USERNAME
const INTEGRAM_SYSTEM_PASSWORD = process.env.INTEGRAM_REGISTRATION_PASSWORD || process.env.INTEGRAM_SYSTEM_PASSWORD

// Default token configuration
const DEFAULT_TOKEN_BALANCE = 1000000 // 1M tokens
const DEFAULT_DAILY_LIMIT = 100000   // 100K tokens/day
const DEFAULT_MONTHLY_LIMIT = 1000000 // 1M tokens/month
const DEFAULT_MODEL = 'deepseek-chat'

/**
 * Generate a secure token value
 * @returns {string} Token in format dd_tok_<random32chars>
 */
function generateTokenValue() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'dd_tok_'
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Get DronDoc auth token from environment or database
 * @returns {Promise<string|null>}
 */
async function getDronDocToken() {
  if (DRONEDOC_AUTH_TOKEN) {
    return DRONEDOC_AUTH_TOKEN
  }

  logger.warn('[DefaultTokenService] No DronDoc auth token configured')
  return null
}

/**
 * Create a default AI token for a new user via Integram API
 *
 * @param {string} userId - User ID from the authentication system
 * @param {string} [userToken] - Optional user authentication token (from localStorage.token)
 * @param {Object} [options] - Optional configuration
 * @param {number} [options.tokenBalance] - Initial token balance (default: 1M)
 * @param {number} [options.dailyLimit] - Daily usage limit (default: 100K)
 * @param {number} [options.monthlyLimit] - Monthly usage limit (default: 1M)
 * @param {string} [options.description] - Token description
 * @returns {Promise<Object>} Created token info
 */
async function createDefaultToken(userId, userToken = null, options = {}) {
  try {
    logger.info('[DefaultTokenService] Creating default token for user', { userId })

    // Validate required credentials
    if (!INTEGRAM_SYSTEM_USERNAME || !INTEGRAM_SYSTEM_PASSWORD) {
      throw new Error('INTEGRAM_REGISTRATION credentials not configured. Please set INTEGRAM_REGISTRATION_USERNAME and INTEGRAM_REGISTRATION_PASSWORD environment variables.')
    }

    // Generate unique token value
    const tokenValue = generateTokenValue()

    // Prepare configuration
    const tokenBalance = options.tokenBalance || DEFAULT_TOKEN_BALANCE
    const dailyLimit = options.dailyLimit || DEFAULT_DAILY_LIMIT
    const monthlyLimit = options.monthlyLimit || DEFAULT_MONTHLY_LIMIT
    const description = options.description || `Welcome Token - ${new Date().toLocaleDateString('ru-RU')}`

    // Authenticate with Integram to get both token and XSRF
    const baseUrl = DRONEDOC_API_BASE_URL
    const database = 'my'
    const authUrl = `${baseUrl}/${database}/auth?JSON_KV`

    const authFormData = new URLSearchParams()
    authFormData.append('login', INTEGRAM_SYSTEM_USERNAME)
    authFormData.append('pwd', INTEGRAM_SYSTEM_PASSWORD)

    logger.info('[DefaultTokenService] Authenticating with Integram', { username: INTEGRAM_SYSTEM_USERNAME })

    const authResponse = await axios.post(authUrl, authFormData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })

    if (authResponse.data.failed) {
      throw new Error('Integram authentication failed')
    }

    const authToken = authResponse.data.token
    const xsrfToken = authResponse.data._xsrf

    if (!authToken || !xsrfToken) {
      throw new Error('Missing authentication tokens from Integram')
    }

    logger.info('[DefaultTokenService] Authentication successful', { hasToken: !!authToken, hasXsrf: !!xsrfToken })

    // Prepare form data for Integram API
    // Table 198016 (my database) - AI tokens
    const formData = new URLSearchParams()
    formData.append('_xsrf', xsrfToken) // CSRF token - REQUIRED!
    formData.append('t198016', tokenValue) // Main value (token as table name)
    formData.append('up', userId) // Parent user ID - set immediately!

    // Date fields
    const today = new Date().toISOString().split('T')[0]

    // Requisite IDs for table 198016:
    // - 198018: Дата (creation date)
    // - 198020: Название (description)
    // - 198023: Срок (expiry - reference to 198021)
    // - 205985: access_token (the actual token string)
    // - 205987: model_id (default model)
    // - 205989: token_balance (initial balance)
    // - 205991: daily_limit
    // - 205993: monthly_limit

    formData.append('t198018', today) // Creation date
    formData.append('t198020', description) // Description
    formData.append('t198023', '198026') // Expiry: 1 year (reference to 198021 table)
    formData.append('t205985', tokenValue) // Actual token value
    formData.append('t205987', DEFAULT_MODEL) // Default model
    formData.append('t205989', tokenBalance.toString()) // Token balance
    formData.append('t205991', dailyLimit.toString()) // Daily limit
    formData.append('t205993', monthlyLimit.toString()) // Monthly limit

    // Make API request to create token object
    const createUrl = `${baseUrl}/${database}/_m_new/198016?JSON_KV`
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Authorization': authToken
    }

    logger.info('[DefaultTokenService] Creating token via Integram API', {
      url: createUrl,
      userId,
      tokenBalance,
      dailyLimit,
      monthlyLimit
    })

    const createResponse = await axios.post(createUrl, formData, { headers })

    if (!createResponse.data || !createResponse.data.id) {
      throw new Error('Failed to create token record')
    }

    const tokenId = createResponse.data.id

    logger.info('[DefaultTokenService] Default token created successfully', {
      userId,
      tokenId,
      tokenBalance
    })

    return {
      success: true,
      tokenId,
      tokenValue, // Return the actual token (should be shown to user ONCE)
      tokenBalance,
      dailyLimit,
      monthlyLimit,
      description
    }

  } catch (error) {
    logger.error('[DefaultTokenService] Failed to create default token', {
      userId,
      error: error.message,
      stack: error.stack
    })

    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Check if user already has a default token
 * Uses Integram authentication (same as createDefaultToken)
 *
 * @param {string} userId - User ID (Integram recordId)
 * @param {string} [userToken] - Optional user authentication token (ignored, uses Integram auth)
 * @returns {Promise<boolean>} True if user has at least one token
 */
async function hasDefaultToken(userId, userToken = null) {
  try {
    // Validate required credentials
    if (!INTEGRAM_SYSTEM_USERNAME || !INTEGRAM_SYSTEM_PASSWORD) {
      logger.warn('[DefaultTokenService] INTEGRAM_REGISTRATION credentials not configured')
      return false
    }

    // Authenticate with Integram to get auth token
    const baseUrl = DRONEDOC_API_BASE_URL
    const database = 'my'
    const authUrl = `${baseUrl}/${database}/auth?JSON_KV`

    const authFormData = new URLSearchParams()
    authFormData.append('login', INTEGRAM_SYSTEM_USERNAME)
    authFormData.append('pwd', INTEGRAM_SYSTEM_PASSWORD)

    logger.info('[DefaultTokenService] Authenticating to check tokens', { userId })

    const authResponse = await axios.post(authUrl, authFormData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })

    if (authResponse.data.failed) {
      logger.warn('[DefaultTokenService] Integram auth failed for token check')
      return false
    }

    const authToken = authResponse.data.token
    if (!authToken) {
      logger.warn('[DefaultTokenService] No auth token from Integram')
      return false
    }

    // Query tokens table filtered by user (F_U = parent user ID)
    const url = `${baseUrl}/${database}/object/198016?JSON_KV&F_U=${userId}&limit=1`
    const headers = {
      'X-Authorization': authToken
    }

    const response = await fetch(url, { headers })

    if (!response.ok) {
      logger.warn('[DefaultTokenService] Failed to check for existing tokens', {
        userId,
        status: response.status
      })
      return false
    }

    const data = await response.json()

    // Check if user has any tokens
    const hasTokens = data.object && data.object.length > 0

    logger.info('[DefaultTokenService] Token check result', {
      userId,
      hasTokens,
      tokenCount: data.object?.length || 0
    })

    return hasTokens

  } catch (error) {
    logger.error('[DefaultTokenService] Error checking for tokens', {
      userId,
      error: error.message
    })
    return false
  }
}

/**
 * Ensure user has a default token (create if doesn't exist)
 *
 * @param {string} userId - User ID
 * @param {string} [userToken] - Optional user authentication token
 * @param {Object} [options] - Optional configuration
 * @returns {Promise<Object>} Token info (existing or newly created)
 */
async function ensureDefaultToken(userId, userToken = null, options = {}) {
  try {
    // Check if user already has a token
    const alreadyHasToken = await hasDefaultToken(userId, userToken)

    if (alreadyHasToken) {
      logger.info('[DefaultTokenService] User already has a token', { userId })
      return {
        success: true,
        alreadyExisted: true,
        message: 'User already has a token'
      }
    }

    // Create new default token
    logger.info('[DefaultTokenService] Creating new default token for user', { userId })
    const result = await createDefaultToken(userId, userToken, options)

    return {
      ...result,
      alreadyExisted: false
    }

  } catch (error) {
    logger.error('[DefaultTokenService] Error ensuring default token', {
      userId,
      error: error.message
    })

    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Add tokens to user's default token balance (referral bonus)
 * Issue #5112 - Referral system
 *
 * @param {string} userId - User ID (Integram recordId)
 * @param {number} amount - Amount of tokens to add
 * @param {Object} [metadata] - Optional metadata (reason, note, etc.)
 * @returns {Promise<Object>} Update result
 */
async function addTokensToUser(userId, amount, metadata = {}) {
  try {
    logger.info('[DefaultTokenService] Adding tokens to user', { userId, amount, metadata })

    // Validate required credentials
    if (!INTEGRAM_SYSTEM_USERNAME || !INTEGRAM_SYSTEM_PASSWORD) {
      throw new Error('INTEGRAM_REGISTRATION credentials not configured. Please set INTEGRAM_REGISTRATION_USERNAME and INTEGRAM_REGISTRATION_PASSWORD environment variables.')
    }

    // Authenticate with Integram
    const baseUrl = DRONEDOC_API_BASE_URL
    const database = 'my'
    const authUrl = `${baseUrl}/${database}/auth?JSON_KV`

    const authFormData = new URLSearchParams()
    authFormData.append('login', INTEGRAM_SYSTEM_USERNAME)
    authFormData.append('pwd', INTEGRAM_SYSTEM_PASSWORD)

    const authResponse = await axios.post(authUrl, authFormData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })

    if (authResponse.data.failed) {
      throw new Error('Integram authentication failed')
    }

    const authToken = authResponse.data.token
    const xsrfToken = authResponse.data._xsrf

    if (!authToken || !xsrfToken) {
      throw new Error('Missing authentication tokens from Integram')
    }

    // Find user's tokens (table 198016, filtered by parent user)
    const tokensUrl = `${baseUrl}/${database}/object/198016?JSON_KV&F_U=${userId}&limit=100`
    const tokensResponse = await axios.get(tokensUrl, {
      headers: { 'X-Authorization': authToken }
    })

    const tokens = tokensResponse.data?.object || []
    if (tokens.length === 0) {
      logger.warn('[DefaultTokenService] User has no tokens, cannot add bonus', { userId })
      return {
        success: false,
        error: 'User has no tokens'
      }
    }

    // Update balance for all user's tokens (usually just one default token)
    const updateResults = []
    for (const token of tokens) {
      const tokenId = token.id

      // Get current token data including balance
      const tokenDataUrl = `${baseUrl}/${database}/object/${tokenId}?JSON_KV`
      const tokenDataResponse = await axios.get(tokenDataUrl, {
        headers: { 'X-Authorization': authToken }
      })

      const tokenReqs = tokenDataResponse.data?.reqs || {}
      const currentBalance = parseInt(tokenReqs['205989'] || 0, 10)
      const newBalance = currentBalance + amount

      logger.info('[DefaultTokenService] Updating token balance', {
        tokenId,
        currentBalance,
        bonusAmount: amount,
        newBalance
      })

      // Update token balance using _m_save endpoint
      const updateUrl = `${baseUrl}/${database}/_m_save/${tokenId}?JSON_KV`
      const updateFormData = new URLSearchParams()
      updateFormData.append('_xsrf', xsrfToken)
      updateFormData.append('t198016', token.val) // Main value (token name)
      updateFormData.append('t205989', newBalance.toString()) // New balance

      await axios.post(updateUrl, updateFormData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Authorization': authToken
        }
      })

      updateResults.push({
        tokenId,
        previousBalance: currentBalance,
        newBalance,
        bonusAmount: amount
      })

      logger.info('[DefaultTokenService] Token balance updated', {
        tokenId,
        newBalance,
        metadata
      })
    }

    return {
      success: true,
      userId,
      tokensUpdated: updateResults.length,
      totalBonusAdded: amount * updateResults.length,
      updates: updateResults,
      metadata
    }

  } catch (error) {
    logger.error('[DefaultTokenService] Failed to add tokens to user', {
      userId,
      amount,
      error: error.message,
      stack: error.stack
    })

    return {
      success: false,
      error: error.message
    }
  }
}

export default {
  createDefaultToken,
  hasDefaultToken,
  ensureDefaultToken,
  addTokensToUser
}
