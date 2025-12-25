import { query } from '../../config/database.js'
import { generateTokenPair, hashToken, calculateExpiration } from '../../utils/auth/jwt.js'
import logger from '../../utils/logger.js'

/**
 * Create new session for user
 * @param {Object} user - User object
 * @param {Object} metadata - Session metadata (ip, userAgent, etc.)
 * @returns {Promise<Object>} Session with tokens
 */
export async function createSession(user, metadata = {}) {
  const { accessToken, refreshToken, expiresIn } = generateTokenPair(user)

  const accessTokenHash = hashToken(accessToken)
  const refreshTokenHash = hashToken(refreshToken)

  const accessExpires = calculateExpiration(expiresIn)
  const refreshExpires = calculateExpiration(
    process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '7d'
  )

  await query(
    `INSERT INTO sessions (user_id, access_token_hash, refresh_token_hash, ip_address, user_agent, expires_at, refresh_expires_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      user.id,
      accessTokenHash,
      refreshTokenHash,
      metadata.ip || null,
      metadata.userAgent || null,
      accessExpires,
      refreshExpires,
      JSON.stringify(metadata),
    ]
  )

  logger.info({ userId: user.id, ip: metadata.ip }, 'Session created')

  return {
    accessToken,
    refreshToken,
    expiresIn,
    tokenType: 'Bearer',
  }
}

/**
 * Find session by access token hash
 * @param {string} accessToken - Access token (unhashed)
 * @returns {Promise<Object|null>} Session or null
 */
export async function findSessionByAccessToken(accessToken) {
  const tokenHash = hashToken(accessToken)

  const result = await query(
    `SELECT * FROM sessions
     WHERE access_token_hash = $1
       AND is_active = true
       AND expires_at > CURRENT_TIMESTAMP`,
    [tokenHash]
  )

  return result.rows[0] || null
}

/**
 * Find session by refresh token hash
 * @param {string} refreshToken - Refresh token (unhashed)
 * @returns {Promise<Object|null>} Session or null
 */
export async function findSessionByRefreshToken(refreshToken) {
  const tokenHash = hashToken(refreshToken)

  const result = await query(
    `SELECT * FROM sessions
     WHERE refresh_token_hash = $1
       AND is_active = true
       AND refresh_expires_at > CURRENT_TIMESTAMP`,
    [tokenHash]
  )

  return result.rows[0] || null
}

/**
 * Refresh session tokens
 * @param {string} refreshToken - Current refresh token
 * @param {Object} user - User object
 * @returns {Promise<Object>} New tokens
 */
export async function refreshSession(refreshToken, user) {
  const session = await findSessionByRefreshToken(refreshToken)

  if (!session) {
    throw new Error('Invalid or expired refresh token')
  }

  // Generate new token pair
  const { accessToken, refreshToken: newRefreshToken, expiresIn } = generateTokenPair(user)

  const accessTokenHash = hashToken(accessToken)
  const newRefreshTokenHash = hashToken(newRefreshToken)

  const accessExpires = calculateExpiration(expiresIn)
  const refreshExpires = calculateExpiration(
    process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '7d'
  )

  // Update session with new tokens
  await query(
    `UPDATE sessions
     SET access_token_hash = $1,
         refresh_token_hash = $2,
         expires_at = $3,
         refresh_expires_at = $4,
         last_activity_at = CURRENT_TIMESTAMP
     WHERE id = $5`,
    [accessTokenHash, newRefreshTokenHash, accessExpires, refreshExpires, session.id]
  )

  logger.info({ userId: user.id, sessionId: session.id }, 'Session refreshed')

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn,
    tokenType: 'Bearer',
  }
}

/**
 * Update session last activity
 * @param {string} sessionId - Session ID
 */
export async function updateSessionActivity(sessionId) {
  await query(
    'UPDATE sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1',
    [sessionId]
  )
}

/**
 * Invalidate session (logout)
 * @param {string} accessToken - Access token
 */
export async function invalidateSession(accessToken) {
  const tokenHash = hashToken(accessToken)

  await query(
    'UPDATE sessions SET is_active = false WHERE access_token_hash = $1',
    [tokenHash]
  )

  logger.info({ tokenHash: tokenHash.substring(0, 10) }, 'Session invalidated')
}

/**
 * Invalidate all sessions for user
 * @param {string} userId - User ID
 */
export async function invalidateAllUserSessions(userId) {
  await query(
    'UPDATE sessions SET is_active = false WHERE user_id = $1',
    [userId]
  )

  logger.info({ userId }, 'All user sessions invalidated')
}

/**
 * Get active sessions for user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of active sessions
 */
export async function getUserActiveSessions(userId) {
  const result = await query(
    `SELECT id, ip_address, user_agent, created_at, last_activity_at, expires_at
     FROM sessions
     WHERE user_id = $1
       AND is_active = true
       AND expires_at > CURRENT_TIMESTAMP
     ORDER BY last_activity_at DESC`,
    [userId]
  )

  return result.rows
}

/**
 * Clean up expired sessions (maintenance task)
 */
export async function cleanupExpiredSessions() {
  const result = await query(
    'DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP OR refresh_expires_at < CURRENT_TIMESTAMP'
  )

  logger.info({ deletedCount: result.rowCount }, 'Expired sessions cleaned up')
  return result.rowCount
}

export default {
  createSession,
  findSessionByAccessToken,
  findSessionByRefreshToken,
  refreshSession,
  updateSessionActivity,
  invalidateSession,
  invalidateAllUserSessions,
  getUserActiveSessions,
  cleanupExpiredSessions,
}
