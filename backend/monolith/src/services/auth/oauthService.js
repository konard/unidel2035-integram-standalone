import axios from 'axios'
import crypto from 'crypto'
import { query } from '../../config/database.js'
import logger from '../../utils/logger.js'

/**
 * Generate OAuth state parameter for CSRF protection
 * @returns {string} Random state string
 */
export function generateOAuthState() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Get OAuth provider configuration
 * @param {string} providerName - Provider name (yandex, vk, telegram, google)
 * @returns {Promise<Object>} Provider configuration
 */
export async function getProviderConfig(providerName) {
  const result = await query(
    'SELECT * FROM oauth_providers WHERE name = $1 AND is_active = true',
    [providerName]
  )

  if (!result.rows[0]) {
    throw new Error(`OAuth provider '${providerName}' not found or inactive`)
  }

  return result.rows[0]
}

/**
 * Build OAuth authorization URL
 * @param {string} providerName - Provider name
 * @param {string} state - CSRF state parameter
 * @returns {Promise<string>} Authorization URL
 */
export async function buildAuthorizationUrl(providerName, state) {
  const config = await getProviderConfig(providerName)

  // Get client ID from environment (more secure than DB)
  const clientIdKey = `${providerName.toUpperCase()}_CLIENT_ID`
  const redirectUriKey = `${providerName.toUpperCase()}_REDIRECT_URI`

  const clientId = process.env[clientIdKey] || config.client_id
  const redirectUri = process.env[redirectUriKey]

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: state,
  })

  // Add scopes if available
  if (config.scopes && config.scopes.length > 0) {
    params.append('scope', config.scopes.join(' '))
  }

  // Provider-specific parameters
  if (providerName === 'vk') {
    params.append('v', config.configuration.api_version || '5.131')
  }

  return `${config.auth_url}?${params.toString()}`
}

/**
 * Exchange authorization code for access token (Yandex)
 * @param {string} code - Authorization code
 * @returns {Promise<Object>} {accessToken, userData}
 */
export async function exchangeYandexCode(code) {
  const clientId = process.env.YANDEX_CLIENT_ID
  const clientSecret = process.env.YANDEX_CLIENT_SECRET

  // Exchange code for token
  const tokenResponse = await axios.post(
    'https://oauth.yandex.ru/token',
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  )

  const accessToken = tokenResponse.data.access_token

  // Get user info
  const userResponse = await axios.get('https://login.yandex.ru/info', {
    headers: { Authorization: `OAuth ${accessToken}` },
  })

  const userData = userResponse.data

  return {
    accessToken,
    userData: {
      providerUserId: userData.id,
      email: userData.default_email || userData.emails?.[0],
      displayName: userData.display_name || userData.real_name,
      avatarUrl: userData.default_avatar_id
        ? `https://avatars.yandex.net/get-yapic/${userData.default_avatar_id}/islands-200`
        : null,
      metadata: {
        login: userData.login,
        firstName: userData.first_name,
        lastName: userData.last_name,
        gender: userData.sex,
      },
    },
  }
}

/**
 * Exchange authorization code for access token (VKontakte)
 * @param {string} code - Authorization code
 * @returns {Promise<Object>} {accessToken, userData}
 */
export async function exchangeVKCode(code) {
  const clientId = process.env.VK_CLIENT_ID
  const clientSecret = process.env.VK_CLIENT_SECRET
  const redirectUri = process.env.VK_REDIRECT_URI

  // Exchange code for token
  const tokenResponse = await axios.get('https://oauth.vk.com/access_token', {
    params: {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code: code,
    },
  })

  const { access_token: accessToken, user_id: userId, email } = tokenResponse.data

  // Get user info
  const userResponse = await axios.get('https://api.vk.com/method/users.get', {
    params: {
      user_ids: userId,
      fields: 'photo_200,screen_name,sex,bdate',
      access_token: accessToken,
      v: '5.131',
    },
  })

  const userData = userResponse.data.response[0]

  return {
    accessToken,
    userData: {
      providerUserId: userId.toString(),
      email: email || null,
      displayName: `${userData.first_name} ${userData.last_name}`,
      avatarUrl: userData.photo_200,
      metadata: {
        screenName: userData.screen_name,
        firstName: userData.first_name,
        lastName: userData.last_name,
        sex: userData.sex,
        birthDate: userData.bdate,
      },
    },
  }
}

/**
 * Verify Telegram auth data
 * @param {Object} authData - Telegram auth data from widget
 * @returns {Promise<Object>} User data
 */
export async function verifyTelegramAuth(authData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN

  // Check data freshness (not older than 1 day)
  const authTimestamp = parseInt(authData.auth_date)
  const now = Math.floor(Date.now() / 1000)
  if (now - authTimestamp > 86400) {
    throw new Error('Telegram auth data expired')
  }

  // Verify hash
  const checkHash = authData.hash
  delete authData.hash

  const dataCheckString = Object.keys(authData)
    .sort()
    .map((key) => `${key}=${authData[key]}`)
    .join('\n')

  const secretKey = crypto.createHash('sha256').update(botToken).digest()
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  if (hash !== checkHash) {
    throw new Error('Invalid Telegram auth hash')
  }

  return {
    userData: {
      providerUserId: authData.id.toString(),
      displayName: `${authData.first_name || ''} ${authData.last_name || ''}`.trim(),
      username: authData.username || null,
      avatarUrl: authData.photo_url || null,
      metadata: {
        firstName: authData.first_name,
        lastName: authData.last_name,
        username: authData.username,
      },
    },
  }
}

/**
 * Exchange authorization code for access token (Google)
 * @param {string} code - Authorization code
 * @returns {Promise<Object>} {accessToken, userData}
 */
export async function exchangeGoogleCode(code) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  // Exchange code for token
  const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
    code: code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const accessToken = tokenResponse.data.access_token

  // Get user info
  const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const userData = userResponse.data

  return {
    accessToken,
    userData: {
      providerUserId: userData.id,
      email: userData.email,
      displayName: userData.name,
      avatarUrl: userData.picture,
      metadata: {
        givenName: userData.given_name,
        familyName: userData.family_name,
        locale: userData.locale,
        verifiedEmail: userData.verified_email,
      },
    },
  }
}

export default {
  generateOAuthState,
  getProviderConfig,
  buildAuthorizationUrl,
  exchangeYandexCode,
  exchangeVKCode,
  verifyTelegramAuth,
  exchangeGoogleCode,
}
