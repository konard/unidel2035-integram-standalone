import { query, getClient } from '../../config/database.js'
import { hashPassword } from '../../utils/auth/password.js'
import logger from '../../utils/logger.js'

/**
 * Create a new user
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} Created user
 */
export async function createUser(userData) {
  const { username, email, phone, displayName, avatarUrl } = userData

  const result = await query(
    `INSERT INTO users (username, email, phone, display_name, avatar_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, email, phone, display_name, avatar_url, is_active, is_verified, created_at`,
    [username || null, email || null, phone || null, displayName || null, avatarUrl || null]
  )

  logger.info({ userId: result.rows[0].id, email, phone }, 'User created')
  return result.rows[0]
}

/**
 * Find user by ID
 * @param {string} userId - User UUID
 * @returns {Promise<Object|null>} User object or null
 */
export async function findUserById(userId) {
  const result = await query(
    'SELECT * FROM users WHERE id = $1 AND is_active = true',
    [userId]
  )
  return result.rows[0] || null
}

/**
 * Find user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} User object or null
 */
export async function findUserByEmail(email) {
  const result = await query(
    'SELECT * FROM users WHERE email = $1 AND is_active = true',
    [email]
  )
  return result.rows[0] || null
}

/**
 * Find user by phone
 * @param {string} phone - User phone number
 * @returns {Promise<Object|null>} User object or null
 */
export async function findUserByPhone(phone) {
  const result = await query(
    'SELECT * FROM users WHERE phone = $1 AND is_active = true',
    [phone]
  )
  return result.rows[0] || null
}

/**
 * Find user by username
 * @param {string} username - Username
 * @returns {Promise<Object|null>} User object or null
 */
export async function findUserByUsername(username) {
  const result = await query(
    'SELECT * FROM users WHERE username = $1 AND is_active = true',
    [username]
  )
  return result.rows[0] || null
}

/**
 * Update user information
 * @param {string} userId - User ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated user
 */
export async function updateUser(userId, updates) {
  const allowedFields = ['username', 'email', 'phone', 'display_name', 'avatar_url', 'is_verified']
  const setClause = []
  const values = []
  let paramCount = 1

  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    if (allowedFields.includes(snakeKey)) {
      setClause.push(`${snakeKey} = $${paramCount}`)
      values.push(value)
      paramCount++
    }
  }

  if (setClause.length === 0) {
    throw new Error('No valid fields to update')
  }

  values.push(userId)

  const result = await query(
    `UPDATE users SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${paramCount}
     RETURNING *`,
    values
  )

  logger.info({ userId, updates: Object.keys(updates) }, 'User updated')
  return result.rows[0]
}

/**
 * Update last login timestamp
 * @param {string} userId - User ID
 */
export async function updateLastLogin(userId) {
  await query(
    'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
    [userId]
  )
}

/**
 * Verify user account (email/phone verified)
 * @param {string} userId - User ID
 */
export async function verifyUser(userId) {
  await query(
    'UPDATE users SET is_verified = true WHERE id = $1',
    [userId]
  )
  logger.info({ userId }, 'User verified')
}

/**
 * Deactivate user account
 * @param {string} userId - User ID
 */
export async function deactivateUser(userId) {
  await query(
    'UPDATE users SET is_active = false WHERE id = $1',
    [userId]
  )
  logger.info({ userId }, 'User deactivated')
}

/**
 * Check if user exists by email, phone, or username
 * @param {Object} identifiers - {email?, phone?, username?}
 * @returns {Promise<boolean>} True if user exists
 */
export async function userExists(identifiers) {
  const conditions = []
  const values = []
  let paramCount = 1

  if (identifiers.email) {
    conditions.push(`email = $${paramCount}`)
    values.push(identifiers.email)
    paramCount++
  }

  if (identifiers.phone) {
    conditions.push(`phone = $${paramCount}`)
    values.push(identifiers.phone)
    paramCount++
  }

  if (identifiers.username) {
    conditions.push(`username = $${paramCount}`)
    values.push(identifiers.username)
    paramCount++
  }

  if (conditions.length === 0) {
    return false
  }

  const result = await query(
    `SELECT id FROM users WHERE (${conditions.join(' OR ')}) AND is_active = true`,
    values
  )

  return result.rows.length > 0
}

/**
 * Get user with all auth methods
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User with auth methods
 */
export async function getUserWithAuthMethods(userId) {
  const user = await findUserById(userId)
  if (!user) return null

  const authMethods = await query(
    'SELECT id, auth_type, provider, is_primary, is_verified, last_used_at FROM auth_methods WHERE user_id = $1',
    [userId]
  )

  return {
    ...user,
    authMethods: authMethods.rows,
  }
}

export default {
  createUser,
  findUserById,
  findUserByEmail,
  findUserByPhone,
  findUserByUsername,
  updateUser,
  updateLastLogin,
  verifyUser,
  deactivateUser,
  userExists,
  getUserWithAuthMethods,
}
