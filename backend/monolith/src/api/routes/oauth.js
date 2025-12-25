import express from 'express'
import axios from 'axios'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import FormData from 'form-data'
import { createIntegramClient } from '../../utils/IntegramClient.js'
import logger from '../../utils/logger.js'
import { generateTokenPair } from '../../utils/auth/jwt.js'
import defaultTokenService from '../../services/ai/defaultTokenService.js'

const router = express.Router()

// OAuth field IDs in Integram table 18 (Users)
// IMPORTANT: Use requisite IDs, NOT orig/type IDs!
// From integram_get_table_structure(18): id is the actual requisite ID, orig is the base type
const OAUTH_FIELDS = {
  yandex_id: 207230,   // id=207230, orig=207229
  google_id: 207232,   // id=207232, orig=207231
  vk_id: 207234,       // id=207234, orig=207233
  telegram_id: 207236, // id=207236, orig=207235
  email: 41,           // id=41, orig=31
  password: 20,        // id=20, orig=19, type=6 (PASSWORD_FIELD)
  name: 33,            // id=33, orig=32
  photo: 38,           // id=38, type=FILE - for profile photo (Issue #5139)
  token: 125,          // id=125, orig=122, type=6 (PASSWORD_FIELD) - for legacy auth
  xsrf: 40             // id=40, orig=37, type=6 (PASSWORD_FIELD) - for legacy CSRF
}

// Salt for generating XSRF tokens (must match legacy PHP SALT constant)
const INTEGRAM_SALT = process.env.INTEGRAM_SALT || 'INTEGRAM_2018'

const USERS_TABLE = 18

// Store OAuth states temporarily (includes PKCE code_verifier for VK ID)
const oauthStates = new Map()

/**
 * Generate PKCE code_verifier and code_challenge for VK ID
 * https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-integration/api-description
 */
function generatePKCE() {
  // Generate random code_verifier (43-128 characters)
  const codeVerifier = crypto.randomBytes(32).toString('base64url')

  // Generate code_challenge = base64url(SHA256(code_verifier))
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  return { codeVerifier, codeChallenge }
}

/**
 * Generate XSRF token (matches legacy PHP xsrf() function)
 * PHP: function xsrf($a, $b){ return substr(sha1(Salt($a, $b)), 0, 22); }
 * PHP: function Salt($u, $val){ return SALT."$u$z$val"; }
 * @param {string} token - The access token
 * @param {string} database - The database name (e.g., 'my')
 * @returns {string} XSRF token (22 characters)
 */
function generateIntegramXsrf(token, database) {
  // Salt($token, $database) = SALT + uppercase(token) + database + database
  // Note: In PHP, first arg is $u (user), second is $val, but here we use token as identifier
  const salted = `${INTEGRAM_SALT}${token.toUpperCase()}${database}${database}`
  const hash = crypto.createHash('sha1').update(salted).digest('hex')
  return hash.substring(0, 22)
}

/**
 * Generate Integram TOKEN and XSRF directly (as done in PHP google.php)
 * TOKEN = md5(microtime) - random 32-char hex
 * XSRF = sha1(SALT + TOKEN.toUpperCase() + database + database).substring(0, 22)
 * @param {string} database - Database name (e.g., 'my')
 * @returns {object} { integramToken, integramXsrf }
 */
function generateIntegramCredentials(database = 'my') {
  // Generate TOKEN like PHP: md5(microtime(TRUE))
  // In JS we use crypto.randomBytes for similar randomness
  const integramToken = crypto.createHash('md5')
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex')

  // Generate XSRF like PHP: substr(sha1(Salt($token, $z)), 0, 22)
  // Salt($u, $val) = SALT + uppercase($u) + $z + $val
  // For xsrf($token, $z): Salt($token, $z) = SALT + uppercase($token) + $z + $z
  const integramXsrf = generateIntegramXsrf(integramToken, database)

  logger.info({
    tokenLength: integramToken.length,
    xsrfLength: integramXsrf.length,
    database
  }, 'Generated Integram TOKEN and XSRF directly')

  return { integramToken, integramXsrf }
}

// Blacklist for deleted users (prevent re-registration via OAuth)
// Structure: { "yandex_123456": true, "google_789012": true }
const BLACKLIST_FILE = path.join(process.cwd(), 'data', 'oauth-blacklist.json')
let oauthBlacklist = new Map()

/**
 * Load OAuth blacklist from file
 */
async function loadBlacklist() {
  try {
    const data = await fs.readFile(BLACKLIST_FILE, 'utf-8')
    const blacklistObj = JSON.parse(data)
    oauthBlacklist = new Map(Object.entries(blacklistObj))
    logger.info({ count: oauthBlacklist.size }, 'OAuth blacklist loaded')
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.info('OAuth blacklist file not found, starting fresh')
      oauthBlacklist = new Map()
    } else {
      logger.error({ error: error.message }, 'Failed to load OAuth blacklist')
      oauthBlacklist = new Map()
    }
  }
}

/**
 * Save OAuth blacklist to file
 */
async function saveBlacklist() {
  try {
    const dir = path.dirname(BLACKLIST_FILE)
    await fs.mkdir(dir, { recursive: true })
    const blacklistObj = Object.fromEntries(oauthBlacklist)
    await fs.writeFile(BLACKLIST_FILE, JSON.stringify(blacklistObj, null, 2))
    logger.info({ count: oauthBlacklist.size }, 'OAuth blacklist saved')
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to save OAuth blacklist')
  }
}

/**
 * Check if user is blacklisted
 */
function isBlacklisted(provider, providerUserId) {
  const key = `${provider}_${providerUserId}`
  return oauthBlacklist.has(key)
}

/**
 * Add user to blacklist
 */
async function addToBlacklist(provider, providerUserId, reason = 'User deleted') {
  const key = `${provider}_${providerUserId}`
  oauthBlacklist.set(key, { reason, timestamp: Date.now() })
  await saveBlacklist()
  logger.info({ provider, providerUserId, reason }, 'User added to OAuth blacklist')
}

// Load blacklist on startup
loadBlacklist().catch(err => {
  logger.error({ error: err.message }, 'Failed to load OAuth blacklist on startup')
})

/**
 * Generate OAuth state for CSRF protection
 */
function generateOAuthState() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Find user by OAuth provider ID in Integram
 */
async function findUserByOAuthId(client, provider, providerUserId) {
  try {
    const fieldId = OAUTH_FIELDS[`${provider}_id`]
    if (!fieldId) return null

    // Search users by OAuth ID field
    const searchData = new URLSearchParams()
    searchData.append('_xsrf', client.session.xsrf)

    const response = await axios.post(
      `https://example.integram.io/my/_m_lst/${USERS_TABLE}?JSON_KV&search=${providerUserId}`,
      searchData,
      {
        headers: {
          'X-Authorization': client.session.token,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    const users = response.data.object || []
    // Find user with matching OAuth ID
    for (const user of users) {
      const reqs = response.data.reqs?.[user.id] || {}
      if (reqs[fieldId] === providerUserId) {
        return { id: user.id, val: user.val, reqs }
      }
    }

    return null
  } catch (error) {
    logger.error({ error: error.message, provider }, 'Error finding user by OAuth ID')
    return null
  }
}

/**
 * Check if username exists in database (Issue #5084)
 * Returns the user object if found, null otherwise
 */
async function findUserByUsername(client, username) {
  try {
    // Search users by username (searches the main field/val)
    const searchData = new URLSearchParams()
    searchData.append('_xsrf', client.session.xsrf)

    const response = await axios.post(
      `https://example.integram.io/my/_m_lst/${USERS_TABLE}?JSON_KV&search=${encodeURIComponent(username)}`,
      searchData,
      {
        headers: {
          'X-Authorization': client.session.token,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    const users = response.data.object || []
    // Find user with exact username match (case-insensitive)
    for (const user of users) {
      if (user.val && user.val.toLowerCase() === username.toLowerCase()) {
        const reqs = response.data.reqs?.[user.id] || {}
        return { id: user.id, val: user.val, reqs }
      }
    }

    return null
  } catch (error) {
    logger.error({ error: error.message, username }, 'Error finding user by username (Issue #5084)')
    return null
  }
}

/**
 * Check if email exists in database (Issue #5084)
 * Returns the user object if found, null otherwise
 */
async function findUserByEmail(client, email) {
  try {
    // Search users by email requisite value (field ID 41)
    const searchData = new URLSearchParams()
    searchData.append('_xsrf', client.session.xsrf)

    const response = await axios.post(
      `https://example.integram.io/my/_m_lst/${USERS_TABLE}?JSON_KV&search=${encodeURIComponent(email)}`,
      searchData,
      {
        headers: {
          'X-Authorization': client.session.token,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    const users = response.data.object || []
    // Find user with matching email in the email field (req ID 41)
    for (const user of users) {
      const reqs = response.data.reqs?.[user.id] || {}
      if (reqs[OAUTH_FIELDS.email] && reqs[OAUTH_FIELDS.email].toLowerCase() === email.toLowerCase()) {
        return { id: user.id, val: user.val, reqs }
      }
    }

    return null
  } catch (error) {
    logger.error({ error: error.message, email }, 'Error finding user by email (Issue #5084)')
    return null
  }
}

/**
 * Create or update user with OAuth data in Integram
 */
async function createOrUpdateOAuthUser(client, provider, userData) {
  const fieldId = OAUTH_FIELDS[`${provider}_id`]

  // First check if user exists with this OAuth ID
  const existingUser = await findUserByOAuthId(client, provider, userData.providerUserId)

  if (existingUser) {
    // Return existing user's Integram credentials for legacy PHP access
    let integramToken = existingUser.reqs?.[OAUTH_FIELDS.token] || null
    let integramXsrf = existingUser.reqs?.[OAUTH_FIELDS.xsrf] || null

    // If existing user doesn't have Integram credentials, generate them directly
    if (!integramToken || !integramXsrf) {
      logger.info({ userId: existingUser.id, provider }, 'Existing OAuth user missing Integram credentials - generating directly')

      // Generate TOKEN and XSRF directly (like PHP google.php does)
      const credentials = generateIntegramCredentials('my')
      integramToken = credentials.integramToken
      integramXsrf = credentials.integramXsrf

      // Save TOKEN and XSRF as user requisites
      const setData = new URLSearchParams()
      setData.append('_xsrf', client.session.xsrf)
      setData.append(`t${OAUTH_FIELDS.token}`, integramToken)
      setData.append(`t${OAUTH_FIELDS.xsrf}`, integramXsrf)

      await axios.post(
        `https://example.integram.io/my/_m_set/${existingUser.id}?JSON_KV`,
        setData,
        {
          headers: {
            'X-Authorization': client.session.token,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      )

      logger.info({ userId: existingUser.id, provider }, 'Integram credentials generated and saved directly')
    }

    logger.info({ userId: existingUser.id, provider, hasToken: !!integramToken, hasXsrf: !!integramXsrf }, 'OAuth user found, logging in')
    return { id: existingUser.id, isNew: false, integramToken, integramXsrf }
  }

  // Check if user is blacklisted (was deleted by admin)
  if (isBlacklisted(provider, userData.providerUserId)) {
    const blacklistEntry = oauthBlacklist.get(`${provider}_${userData.providerUserId}`)
    logger.warn(
      {
        provider,
        providerUserId: userData.providerUserId,
        reason: blacklistEntry?.reason
      },
      'Blocked OAuth login attempt for blacklisted user'
    )
    throw new Error('Ваш аккаунт был удален администратором. Регистрация через OAuth запрещена.')
  }

  // Create new user
  const username = userData.username || userData.email?.split('@')[0] || `${provider}_${userData.providerUserId}`

  // Issue #5084: Check if username already exists before creating account
  const existingUsername = await findUserByUsername(client, username)
  if (existingUsername) {
    logger.warn(
      {
        provider,
        username,
        existingUserId: existingUsername.id
      },
      'Username already exists, attempting to use OAuth ID as unique username instead (Issue #5084)'
    )
    // Use provider_providerUserId as fallback username to ensure uniqueness
    const uniqueUsername = `${provider}${userData.providerUserId}`

    // Check if this unique username also exists (unlikely but possible)
    const existingUniqueUsername = await findUserByUsername(client, uniqueUsername)
    if (existingUniqueUsername) {
      throw new Error(`Имя пользователя \"${username}\" уже занято. Не удалось создать уникальное имя для регистрации через ${provider}.`)
    }
    username = uniqueUsername
  }

  // Create user object
  const createData = new URLSearchParams()
  createData.append('_xsrf', client.session.xsrf)
  createData.append(`t${USERS_TABLE}`, username)
  createData.append('up', '1')

  const createResponse = await axios.post(
    `https://example.integram.io/my/_m_new/${USERS_TABLE}?JSON_KV`,
    createData,
    {
      headers: {
        'X-Authorization': client.session.token,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  )

  if (!createResponse.data?.id) {
    throw new Error('Failed to create user')
  }

  const userId = createResponse.data.id

  // Save user requisites with _m_set (more reliable than _m_save for newly created objects)
  // Issue #5095: _m_save doesn't properly persist requisites, use _m_set instead
  const setData = new URLSearchParams()
  setData.append('_xsrf', client.session.xsrf)

  // Build requisites object
  const requisites = {}
  if (userData.email) {
    // Issue #5084: Check if email already exists
    // Note: Email is optional for OAuth users (may not be provided by some providers)
    const existingEmail = await findUserByEmail(client, userData.email)
    if (existingEmail) {
      logger.warn(
        {
          provider,
          email: userData.email,
          existingUserId: existingEmail.id,
          newUserId: userId
        },
        'Email already exists in database while creating OAuth user (Issue #5084). Skipping email assignment to avoid conflicts.'
      )
      // Don't add email to requisites if it already exists - this prevents ownership conflicts
    } else {
      requisites[OAUTH_FIELDS.email] = userData.email
    }
  }
  if (userData.displayName) {
    requisites[OAUTH_FIELDS.name] = userData.displayName
  }
  // Save OAuth provider ID - THIS IS THE CRITICAL FIELD
  requisites[fieldId] = userData.providerUserId

  // Issue #5112: Generate TOKEN and XSRF directly (like PHP google.php)
  // No password needed for OAuth users - they authenticate via provider
  const { integramToken, integramXsrf } = generateIntegramCredentials('my')
  requisites[OAUTH_FIELDS.token] = integramToken
  requisites[OAUTH_FIELDS.xsrf] = integramXsrf

  // Add requisites to form data with t{reqId} format
  for (const [reqId, reqValue] of Object.entries(requisites)) {
    setData.append(`t${reqId}`, reqValue)
  }

  logger.info(
    {
      userId,
      provider,
      fieldId,
      providerUserId: userData.providerUserId,
      requisitesKeys: Object.keys(requisites),
      hasToken: !!integramToken,
      hasXsrf: !!integramXsrf,
      tokenFieldId: OAUTH_FIELDS.token,
      xsrfFieldId: OAUTH_FIELDS.xsrf,
      formDataKeys: Array.from(setData.keys()),
      formDataValues: Array.from(setData.entries()).map(([k, v]) => [k, k.includes('125') || k.includes('40') ? '***MASKED***' : v])
    },
    'Setting OAuth user requisites via _m_set (with TOKEN and XSRF)'
  )

  let setResponse
  try {
    setResponse = await axios.post(
      `https://example.integram.io/my/_m_set/${userId}?JSON_KV`,
      setData,
      {
        headers: {
          'X-Authorization': client.session.token,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    logger.info(
      {
        userId,
        provider,
        setResponseStatus: setResponse.status,
        setResponseData: setResponse.data,
        hasWarnings: !!setResponse.data?.warnings
      },
      'OAuth user requisites _m_set response'
    )
  } catch (setError) {
    logger.error(
      {
        userId,
        provider,
        error: setError.message,
        responseData: setError.response?.data
      },
      'Failed to set OAuth user requisites via _m_set'
    )
    // Don't throw - user was created, we just failed to set requisites
  }

  logger.info(
    { userId, provider, email: userData.email, hasIntegramToken: !!integramToken, hasIntegramXsrf: !!integramXsrf },
    'OAuth user created in Integram with TOKEN and XSRF'
  )
  return { id: userId, isNew: true, integramToken, integramXsrf }
}

/**
 * Save OAuth profile photo to Integram (Issue #5139)
 * Downloads image from OAuth provider and uploads to Integram as file
 * @param {Object} client - Authenticated Integram client
 * @param {string} userId - User ID in Integram
 * @param {string} avatarUrl - URL of the avatar from OAuth provider
 * @param {string} provider - OAuth provider name (for logging)
 */
async function saveOAuthPhoto(client, userId, avatarUrl, provider) {
  if (!avatarUrl) {
    logger.debug({ userId, provider }, 'No avatar URL provided, skipping photo save')
    return
  }

  try {
    logger.info({ userId, provider, avatarUrl: avatarUrl.substring(0, 100) }, 'Downloading OAuth profile photo')

    // Download image from OAuth provider
    const imageResponse = await axios.get(avatarUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Integram/1.0',
        'Accept': 'image/*'
      }
    })

    const imageBuffer = Buffer.from(imageResponse.data)

    // Detect content type and extension
    let contentType = 'image/jpeg'
    let extension = 'jpg'
    const responseContentType = imageResponse.headers['content-type']
    if (responseContentType) {
      contentType = responseContentType.split(';')[0].trim()
      if (contentType.includes('png')) {
        extension = 'png'
      } else if (contentType.includes('gif')) {
        extension = 'gif'
      } else if (contentType.includes('webp')) {
        extension = 'webp'
      }
    }

    logger.info({ userId, provider, bufferSize: imageBuffer.length, contentType }, 'OAuth photo downloaded')

    // Upload to Integram using multipart/form-data
    const formData = new FormData()
    formData.append('_xsrf', client.session.xsrf)
    formData.append(`t${OAUTH_FIELDS.photo}`, imageBuffer, {
      filename: `oauth_${provider}_photo.${extension}`,
      contentType: contentType
    })

    await axios.post(
      `https://example.integram.io/my/_m_set/${userId}?JSON_KV`,
      formData,
      {
        headers: {
          'X-Authorization': client.session.token,
          ...formData.getHeaders()
        }
      }
    )

    logger.info({ userId, provider }, 'OAuth profile photo saved successfully')
  } catch (error) {
    // Don't throw - photo is optional, user creation should not fail
    logger.warn({ userId, provider, error: error.message, avatarUrl: avatarUrl?.substring(0, 100) }, 'Failed to save OAuth photo (non-critical)')
  }
}

/**
 * Build OAuth authorization URL
 * Returns { url, codeVerifier } - codeVerifier is only set for VK ID (PKCE)
 */
function buildAuthorizationUrl(provider, state) {
  const configs = {
    yandex: {
      authUrl: 'https://oauth.yandex.ru/authorize',
      clientId: process.env.YANDEX_CLIENT_ID,
      redirectUri: process.env.YANDEX_REDIRECT_URI,
      scope: 'login:email login:info login:avatar'  // Issue #5139: Added avatar scope
    },
    google: {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      clientId: process.env.GOOGLE_CLIENT_ID,
      redirectUri: process.env.GOOGLE_REDIRECT_URI,
      scope: 'openid email profile'
    },
    vk: {
      // VK ID (new auth system) - https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-integration/api-description
      authUrl: 'https://id.vk.com/authorize',
      clientId: process.env.VK_CLIENT_ID,
      redirectUri: process.env.VK_REDIRECT_URI,
      scope: 'email'
    }
  }

  const config = configs[provider]
  if (!config || !config.clientId) {
    throw new Error(`OAuth provider ${provider} not configured`)
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state: state,
    scope: config.scope
  })

  let codeVerifier = null

  // Google requires additional parameters for consent screen
  if (provider === 'google') {
    params.set('prompt', 'consent')         // Always show consent screen
    params.set('access_type', 'offline')    // Request refresh token
  }

  // VK ID requires PKCE and additional parameters
  if (provider === 'vk') {
    // Generate PKCE code_verifier and code_challenge
    const pkce = generatePKCE()
    codeVerifier = pkce.codeVerifier
    params.set('code_challenge', pkce.codeChallenge)
    params.set('code_challenge_method', 'S256')

    // Generate unique device ID for this auth session
    const uuid = crypto.randomUUID()
    params.set('uuid', uuid)

    logger.info({ provider, uuid, codeChallenge: pkce.codeChallenge.substring(0, 20) + '...' }, 'VK ID: Added PKCE and uuid parameters')
  }

  const finalUrl = `${config.authUrl}?${params.toString()}`
  logger.debug({ provider, finalUrl: finalUrl.substring(0, 100) }, 'Built OAuth URL')
  return { url: finalUrl, codeVerifier }
}

/**
 * Exchange Yandex code for user data
 */
async function exchangeYandexCode(code) {
  const tokenResponse = await axios.post(
    'https://oauth.yandex.ru/token',
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: process.env.YANDEX_CLIENT_ID,
      client_secret: process.env.YANDEX_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  const accessToken = tokenResponse.data.access_token

  const userResponse = await axios.get('https://login.yandex.ru/info', {
    headers: { Authorization: `OAuth ${accessToken}` }
  })

  const data = userResponse.data
  return {
    providerUserId: String(data.id),
    email: data.default_email,
    username: data.login,
    displayName: data.display_name || data.real_name,
    avatarUrl: data.default_avatar_id ? `https://avatars.yandex.net/get-yapic/${data.default_avatar_id}/islands-200` : null
  }
}

/**
 * Exchange Google code for user data
 */
async function exchangeGoogleCode(code) {
  const tokenResponse = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  const accessToken = tokenResponse.data.access_token

  const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  const data = userResponse.data
  return {
    providerUserId: String(data.id),
    email: data.email,
    username: data.email?.split('@')[0],
    displayName: data.name,
    avatarUrl: data.picture
  }
}

/**
 * Exchange VK code for user data (VK ID API with PKCE)
 * https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-integration/api-description
 */
async function exchangeVKCode(code, deviceId, codeVerifier) {
  // Build token request parameters
  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.VK_CLIENT_ID,
    redirect_uri: process.env.VK_REDIRECT_URI,
    code: code,
    device_id: deviceId || crypto.randomUUID(),
    state: 'dronedoc'
  })

  // Add PKCE code_verifier if available
  if (codeVerifier) {
    tokenParams.set('code_verifier', codeVerifier)
  }

  logger.info({
    hasCodeVerifier: !!codeVerifier,
    deviceId: deviceId || 'generated',
    clientId: process.env.VK_CLIENT_ID
  }, 'VK ID: Requesting access token')

  // VK ID uses POST to /oauth2/auth endpoint
  const tokenResponse = await axios.post(
    'https://id.vk.com/oauth2/auth',
    tokenParams,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  logger.info({ responseKeys: Object.keys(tokenResponse.data) }, 'VK ID: Token response received')

  const { access_token, user_id, email } = tokenResponse.data

  // Get user info from VK ID
  const userResponse = await axios.post(
    'https://id.vk.com/oauth2/user_info',
    new URLSearchParams({
      access_token: access_token,
      client_id: process.env.VK_CLIENT_ID
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  const data = userResponse.data.user
  logger.info({ userId: data?.user_id || user_id, hasEmail: !!data?.email }, 'VK ID: User info received')

  return {
    providerUserId: String(data.user_id || user_id),
    email: data.email || email,
    username: data.email?.split('@')[0] || `vk_${data.user_id || user_id}`,
    displayName: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
    avatarUrl: data.avatar || data.photo_200
  }
}

/**
 * GET /api/auth/oauth/:provider - Initiate OAuth flow
 */
router.get('/:provider', async (req, res) => {
  try {
    const { provider } = req.params
    const allowedProviders = ['yandex', 'vk', 'google']

    logger.info({ provider }, 'OAuth initiation request')

    if (!allowedProviders.includes(provider)) {
      return res.status(400).json({ success: false, error: 'Unsupported OAuth provider' })
    }

    const state = generateOAuthState()
    const { url: authUrl, codeVerifier } = buildAuthorizationUrl(provider, state)

    // Store state with codeVerifier for PKCE (VK ID)
    oauthStates.set(state, { provider, createdAt: Date.now(), codeVerifier })

    // Clean old states
    const tenMinutesAgo = Date.now() - 600000
    for (const [key, value] of oauthStates.entries()) {
      if (value.createdAt < tenMinutesAgo) oauthStates.delete(key)
    }

    logger.info({ provider, authUrlPrefix: authUrl.substring(0, 60) }, 'OAuth URL generated')
    res.json({ success: true, data: { authUrl, state } })
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'OAuth initiation error')
    res.status(500).json({ success: false, error: error.message || 'Failed to initiate OAuth flow' })
  }
})

/**
 * GET /api/auth/oauth/yandex/callback - Yandex OAuth callback
 */
router.get('/yandex/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query
    const frontendUrl = process.env.FRONTEND_URL || 'https://dev.example.integram.io'

    if (error) {
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`)
    }

    if (!oauthStates.has(state)) {
      return res.redirect(`${frontendUrl}/login?error=invalid_state`)
    }
    oauthStates.delete(state)

    // Exchange code for user data
    const userData = await exchangeYandexCode(code)

    // Create Integram client and authenticate
    const client = createIntegramClient('my')
    await client.authenticate(
      process.env.INTEGRAM_REGISTRATION_USERNAME || 'api_reg',
      process.env.INTEGRAM_REGISTRATION_PASSWORD || 'ca84qkcx'
    )

    // Create or find user in Integram
    const { id: userId, isNew, integramToken, integramXsrf } = await createOrUpdateOAuthUser(client, 'yandex', userData)

    // Generate JWT tokens for the OAuth user
    const user = {
      id: userId,
      username: userData.username || userData.email?.split('@')[0],
      email: userData.email
    }
    const { accessToken, refreshToken } = generateTokenPair(user)

    logger.info({ userId, provider: 'yandex', isNew, hasIntegram: !!integramToken }, 'Yandex OAuth successful')

    // Create default AI token for new OAuth users
    if (isNew) {
      defaultTokenService.ensureDefaultToken(userId, null).catch(err => {
        logger.warn({ userId, error: err.message }, 'Failed to create default token for OAuth user')
      })
    }

    // Save OAuth profile photo (Issue #5139) - async, don't wait
    if (userData.avatarUrl) {
      saveOAuthPhoto(client, userId, userData.avatarUrl, 'yandex').catch(err => {
        logger.debug({ userId, error: err.message }, 'OAuth photo save failed (non-blocking)')
      })
    }

    // Redirect to frontend with tokens (both JWT and Integram for legacy PHP)
    const params = new URLSearchParams({
      accessToken,
      refreshToken,
      userId: userId.toString()
    })
    if (integramToken) params.append('token', integramToken)
    if (integramXsrf) params.append('_xsrf', integramXsrf)
    res.redirect(`${frontendUrl}/oauth-callback?${params.toString()}`)
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Yandex OAuth callback error')
    const frontendUrl = process.env.FRONTEND_URL || 'https://dev.example.integram.io'
    res.redirect(`${frontendUrl}/login?error=oauth_failed`)
  }
})

/**
 * GET /api/auth/oauth/google/callback - Google OAuth callback
 */
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query
    const frontendUrl = process.env.FRONTEND_URL || 'https://dev.example.integram.io'

    if (error) {
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`)
    }

    if (!oauthStates.has(state)) {
      return res.redirect(`${frontendUrl}/login?error=invalid_state`)
    }
    oauthStates.delete(state)

    const userData = await exchangeGoogleCode(code)

    const client = createIntegramClient('my')
    await client.authenticate(
      process.env.INTEGRAM_REGISTRATION_USERNAME || 'api_reg',
      process.env.INTEGRAM_REGISTRATION_PASSWORD || 'ca84qkcx'
    )

    const { id: userId, isNew, integramToken, integramXsrf } = await createOrUpdateOAuthUser(client, 'google', userData)

    // Generate JWT tokens
    const user = {
      id: userId,
      username: userData.username || userData.email?.split('@')[0],
      email: userData.email
    }
    const { accessToken, refreshToken } = generateTokenPair(user)

    logger.info({ userId, provider: 'google', isNew, hasIntegram: !!integramToken }, 'Google OAuth successful')

    if (isNew) {
      defaultTokenService.ensureDefaultToken(userId, null).catch(err => {
        logger.warn({ userId, error: err.message }, 'Failed to create default token for OAuth user')
      })
    }

    // Save OAuth profile photo (Issue #5139) - async, don't wait
    if (userData.avatarUrl) {
      saveOAuthPhoto(client, userId, userData.avatarUrl, 'google').catch(err => {
        logger.debug({ userId, error: err.message }, 'OAuth photo save failed (non-blocking)')
      })
    }

    // Redirect to frontend with tokens (both JWT and Integram for legacy PHP)
    const params = new URLSearchParams({
      accessToken,
      refreshToken,
      userId: userId.toString()
    })
    if (integramToken) params.append('token', integramToken)
    if (integramXsrf) params.append('_xsrf', integramXsrf)
    res.redirect(`${frontendUrl}/oauth-callback?${params.toString()}`)
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Google OAuth callback error')
    const frontendUrl = process.env.FRONTEND_URL || 'https://dev.example.integram.io'
    res.redirect(`${frontendUrl}/login?error=oauth_failed`)
  }
})

/**
 * GET /api/auth/oauth/vk/callback - VK OAuth callback
 */
router.get('/vk/callback', async (req, res) => {
  try {
    const { code, state, error, device_id } = req.query
    const frontendUrl = process.env.FRONTEND_URL || 'https://dev.example.integram.io'

    logger.info({ code: code?.substring(0, 20), state: state?.substring(0, 20), device_id }, 'VK callback received')

    if (error) {
      logger.warn({ error }, 'VK OAuth error returned')
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`)
    }

    if (!oauthStates.has(state)) {
      logger.warn({ state }, 'VK OAuth invalid state')
      return res.redirect(`${frontendUrl}/login?error=invalid_state`)
    }

    // Get stored state data including PKCE codeVerifier
    const stateData = oauthStates.get(state)
    const { codeVerifier } = stateData
    oauthStates.delete(state)

    logger.info({ hasCodeVerifier: !!codeVerifier }, 'VK OAuth: Exchanging code for token')

    const userData = await exchangeVKCode(code, device_id, codeVerifier)

    const client = createIntegramClient('my')
    await client.authenticate(
      process.env.INTEGRAM_REGISTRATION_USERNAME || 'api_reg',
      process.env.INTEGRAM_REGISTRATION_PASSWORD || 'ca84qkcx'
    )

    const { id: userId, isNew, integramToken, integramXsrf } = await createOrUpdateOAuthUser(client, 'vk', userData)

    // Generate JWT tokens
    const user = {
      id: userId,
      username: userData.username || `vk_${userData.providerUserId}`,
      email: userData.email
    }
    const { accessToken, refreshToken } = generateTokenPair(user)

    logger.info({ userId, provider: 'vk', isNew, hasIntegram: !!integramToken }, 'VK OAuth successful')

    if (isNew) {
      defaultTokenService.ensureDefaultToken(userId, null).catch(err => {
        logger.warn({ userId, error: err.message }, 'Failed to create default token for OAuth user')
      })
    }

    // Save OAuth profile photo (Issue #5139) - async, don't wait
    if (userData.avatarUrl) {
      saveOAuthPhoto(client, userId, userData.avatarUrl, 'vk').catch(err => {
        logger.debug({ userId, error: err.message }, 'OAuth photo save failed (non-blocking)')
      })
    }

    // Redirect to frontend with tokens (both JWT and Integram for legacy PHP)
    const params = new URLSearchParams({
      accessToken,
      refreshToken,
      userId: userId.toString()
    })
    if (integramToken) params.append('token', integramToken)
    if (integramXsrf) params.append('_xsrf', integramXsrf)
    res.redirect(`${frontendUrl}/oauth-callback?${params.toString()}`)
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'VK OAuth callback error')
    const frontendUrl = process.env.FRONTEND_URL || 'https://dev.example.integram.io'
    res.redirect(`${frontendUrl}/login?error=oauth_failed`)
  }
})

/**
 * POST /api/auth/oauth/telegram - Telegram widget auth
 */
router.post('/telegram', async (req, res) => {
  try {
    const authData = req.body

    // Verify Telegram auth hash
    const { hash, ...data } = authData
    const checkString = Object.keys(data)
      .sort()
      .map(key => `${key}=${data[key]}`)
      .join('\n')

    const secretKey = crypto.createHash('sha256')
      .update(process.env.TELEGRAM_BOT_TOKEN || '')
      .digest()

    const expectedHash = crypto.createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex')

    if (hash !== expectedHash) {
      return res.status(401).json({ success: false, error: 'Invalid Telegram auth' })
    }

    // Check auth_date is not too old (1 day)
    if (Date.now() / 1000 - data.auth_date > 86400) {
      return res.status(401).json({ success: false, error: 'Auth data expired' })
    }

    const userData = {
      providerUserId: String(data.id),
      username: data.username,
      displayName: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
      avatarUrl: data.photo_url
    }

    const client = createIntegramClient('my')
    await client.authenticate(
      process.env.INTEGRAM_REGISTRATION_USERNAME || 'api_reg',
      process.env.INTEGRAM_REGISTRATION_PASSWORD || 'ca84qkcx'
    )

    const { id: userId, isNew, integramToken, integramXsrf } = await createOrUpdateOAuthUser(client, 'telegram', userData)

    // Generate JWT tokens
    const user = {
      id: userId,
      username: userData.username || `tg_${userData.providerUserId}`,
      email: null // Telegram doesn't provide email
    }
    const { accessToken, refreshToken } = generateTokenPair(user)

    logger.info({ userId, provider: 'telegram', isNew, hasIntegram: !!integramToken }, 'Telegram OAuth successful')

    // Create default AI token for new OAuth users
    if (isNew) {
      defaultTokenService.ensureDefaultToken(userId, null).catch(err => {
        logger.warn({ userId, error: err.message }, 'Failed to create default token for Telegram user')
      })
    }

    // Save OAuth profile photo (Issue #5139) - async, don't wait
    if (userData.avatarUrl) {
      saveOAuthPhoto(client, userId, userData.avatarUrl, 'telegram').catch(err => {
        logger.debug({ userId, error: err.message }, 'OAuth photo save failed (non-blocking)')
      })
    }

    res.json({
      success: true,
      data: {
        userId,
        username: userData.username,
        displayName: userData.displayName,
        isNew,
        accessToken,
        refreshToken,
        token: integramToken,
        _xsrf: integramXsrf
      }
    })
  } catch (error) {
    logger.error({ error: error.message }, 'Telegram auth error')
    res.status(401).json({ success: false, error: error.message || 'Telegram auth failed' })
  }
})

/**
 * POST /api/auth/oauth/blacklist/add - Add user to OAuth blacklist
 * This should be called when admin deletes a user to prevent re-registration
 */
router.post('/blacklist/add', async (req, res) => {
  try {
    const { provider, providerUserId, reason } = req.body

    if (!provider || !providerUserId) {
      return res.status(400).json({
        success: false,
        error: 'Provider and providerUserId are required'
      })
    }

    await addToBlacklist(provider, providerUserId, reason || 'User deleted by admin')

    res.json({
      success: true,
      message: 'User added to OAuth blacklist',
      data: { provider, providerUserId, reason }
    })
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to add user to blacklist')
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/auth/oauth/blacklist - Get OAuth blacklist
 */
router.get('/blacklist', async (req, res) => {
  try {
    const blacklistArray = Array.from(oauthBlacklist.entries()).map(([key, value]) => {
      const [provider, userId] = key.split('_')
      return {
        provider,
        userId,
        ...value
      }
    })

    res.json({
      success: true,
      data: blacklistArray,
      count: blacklistArray.length
    })
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get blacklist')
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/auth/oauth/blacklist/:provider/:userId - Remove user from blacklist
 */
router.delete('/blacklist/:provider/:userId', async (req, res) => {
  try {
    const { provider, userId } = req.params
    const key = `${provider}_${userId}`

    if (!oauthBlacklist.has(key)) {
      return res.status(404).json({
        success: false,
        error: 'User not found in blacklist'
      })
    }

    oauthBlacklist.delete(key)
    await saveBlacklist()

    logger.info({ provider, userId }, 'User removed from OAuth blacklist')

    res.json({
      success: true,
      message: 'User removed from OAuth blacklist'
    })
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to remove user from blacklist')
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router
