import { query, getClient } from '../../config/database.js'
import { hashPassword, comparePassword } from '../../utils/auth/password.js'
import logger from '../../utils/logger.js'

/**
 * Create authentication method for user
 * @param {string} userId - User ID
 * @param {Object} authData - Authentication method data
 * @returns {Promise<Object>} Created auth method
 */
export async function createAuthMethod(userId, authData) {
  const { authType, provider, providerUserId, password, isPrimary, metadata } = authData

  let passwordHash = null
  if (password) {
    passwordHash = await hashPassword(password)
  }

  const result = await query(
    `INSERT INTO auth_methods (user_id, auth_type, provider, provider_user_id, password_hash, is_primary, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, user_id, auth_type, provider, is_primary, is_verified, created_at`,
    [
      userId,
      authType,
      provider || null,
      providerUserId || null,
      passwordHash,
      isPrimary || false,
      JSON.stringify(metadata || {}),
    ]
  )

  logger.info({ userId, authType, provider }, 'Auth method created')
  return result.rows[0]
}

/**
 * Find auth method by provider and provider user ID
 * @param {string} provider - OAuth provider name
 * @param {string} providerUserId - User ID from provider
 * @returns {Promise<Object|null>} Auth method or null
 */
export async function findAuthMethodByProvider(provider, providerUserId) {
  const result = await query(
    `SELECT am.*, u.* FROM auth_methods am
     JOIN users u ON am.user_id = u.id
     WHERE am.provider = $1 AND am.provider_user_id = $2 AND u.is_active = true`,
    [provider, providerUserId]
  )
  return result.rows[0] || null
}

/**
 * Find password auth method for user by email/phone/username
 * @param {string} identifier - Email, phone, or username
 * @returns {Promise<Object|null>} User and auth method or null
 */
export async function findPasswordAuthMethod(identifier) {
  const result = await query(
    `SELECT u.*, am.password_hash, am.id as auth_method_id
     FROM users u
     JOIN auth_methods am ON u.id = am.user_id
     WHERE (u.email = $1 OR u.phone = $1 OR u.username = $1)
       AND am.auth_type IN ('email_password', 'phone_password')
       AND u.is_active = true
     LIMIT 1`,
    [identifier]
  )
  return result.rows[0] || null
}

/**
 * Verify password for auth method
 * @param {string} authMethodId - Auth method ID
 * @param {string} password - Password to verify
 * @returns {Promise<boolean>} True if password is correct
 */
export async function verifyPassword(authMethodId, password) {
  const result = await query(
    'SELECT password_hash FROM auth_methods WHERE id = $1',
    [authMethodId]
  )

  if (!result.rows[0]) {
    return false
  }

  return await comparePassword(password, result.rows[0].password_hash)
}

/**
 * Update password for auth method
 * @param {string} userId - User ID
 * @param {string} newPassword - New password
 * @returns {Promise<void>}
 */
export async function updatePassword(userId, newPassword) {
  const passwordHash = await hashPassword(newPassword)

  await query(
    `UPDATE auth_methods
     SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $2 AND auth_type IN ('email_password', 'phone_password')`,
    [passwordHash, userId]
  )

  logger.info({ userId }, 'Password updated')
}

/**
 * Update last used timestamp for auth method
 * @param {string} authMethodId - Auth method ID
 */
export async function updateAuthMethodLastUsed(authMethodId) {
  await query(
    'UPDATE auth_methods SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
    [authMethodId]
  )
}

/**
 * Set primary auth method for user
 * @param {string} userId - User ID
 * @param {string} authMethodId - Auth method ID to set as primary
 */
export async function setPrimaryAuthMethod(userId, authMethodId) {
  const client = await getClient()

  try {
    await client.query('BEGIN')

    // Remove primary flag from all auth methods
    await client.query(
      'UPDATE auth_methods SET is_primary = false WHERE user_id = $1',
      [userId]
    )

    // Set new primary
    await client.query(
      'UPDATE auth_methods SET is_primary = true WHERE id = $1 AND user_id = $2',
      [authMethodId, userId]
    )

    await client.query('COMMIT')
    logger.info({ userId, authMethodId }, 'Primary auth method updated')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Get all auth methods for user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of auth methods
 */
export async function getUserAuthMethods(userId) {
  const result = await query(
    'SELECT id, auth_type, provider, is_primary, is_verified, last_used_at, created_at FROM auth_methods WHERE user_id = $1',
    [userId]
  )
  return result.rows
}

/**
 * Delete auth method
 * @param {string} userId - User ID
 * @param {string} authMethodId - Auth method ID to delete
 */
export async function deleteAuthMethod(userId, authMethodId) {
  // Ensure user has at least one other auth method
  const authMethods = await getUserAuthMethods(userId)

  if (authMethods.length <= 1) {
    throw new Error('Cannot delete the only authentication method')
  }

  await query(
    'DELETE FROM auth_methods WHERE id = $1 AND user_id = $2',
    [authMethodId, userId]
  )

  logger.info({ userId, authMethodId }, 'Auth method deleted')
}

/**
 * Verify auth method (mark as verified)
 * @param {string} authMethodId - Auth method ID
 */
export async function verifyAuthMethod(authMethodId) {
  await query(
    'UPDATE auth_methods SET is_verified = true WHERE id = $1',
    [authMethodId]
  )
}

export default {
  createAuthMethod,
  findAuthMethodByProvider,
  findPasswordAuthMethod,
  verifyPassword,
  updatePassword,
  updateAuthMethodLastUsed,
  setPrimaryAuthMethod,
  getUserAuthMethods,
  deleteAuthMethod,
  verifyAuthMethod,
}
