import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import logger from '../logger.js'

// Security: Validate JWT_SECRET exists and is strong enough
// Allow lenient mode with JWT_SKIP_VALIDATION=true for development/testing
const skipValidation = process.env.JWT_SKIP_VALIDATION === 'true'
const isDevelopment = process.env.NODE_ENV !== 'production' || skipValidation
const ACCESS_TOKEN_EXPIRES = process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '15m'
const REFRESH_TOKEN_EXPIRES = process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '7d'

// Default fallback for development only
const DEFAULT_DEV_SECRET = 'dev-secret-change-before-production-954c4f428e58ebc3e05752df7918dbef271657bdc7de62794e3ef7bd24010244'

let JWT_SECRET = process.env.JWT_SECRET

// Validate JWT_SECRET
if (!JWT_SECRET) {
  if (isDevelopment || skipValidation) {
    console.warn('⚠️  JWT_SECRET not set! Using default dev secret.')
    console.warn('   Set JWT_SKIP_VALIDATION=true to suppress strict validation')
    console.warn('   Generate proper secret: node scripts/generate-jwt-secret.js')
    JWT_SECRET = DEFAULT_DEV_SECRET
  } else {
    const error = new Error(
      'CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set in production!\n' +
      'Generate a strong secret with: node scripts/generate-jwt-secret.js\n' +
      'Then add it to your .env file: JWT_SECRET=<generated_secret>\n' +
      'Or set JWT_SKIP_VALIDATION=true for testing (NOT RECOMMENDED)'
    )
    console.error(error.message)
    throw error
  }
}

// Warn if JWT_SECRET is too short (less than 32 bytes / 64 hex chars)
if (JWT_SECRET.length < 64 && !skipValidation) {
  const message =
    'JWT_SECRET is shorter than recommended 256 bits (64 hex characters). ' +
    'Generate a stronger secret with: node scripts/generate-jwt-secret.js'

  if (isDevelopment) {
    console.warn(`⚠️  ${message}`)
  } else {
    console.error(`❌ ${message}`)
  }
}

// Warn if using common weak secrets
const WEAK_SECRETS = [
  'secret',
  'default-secret-change-in-production',
  'your-jwt-secret',
  'changeme',
  'password',
  '12345678'
]
if (WEAK_SECRETS.includes(JWT_SECRET.toLowerCase()) && !skipValidation) {
  const message =
    'JWT_SECRET is using a known weak value! ' +
    'This makes your application vulnerable to token forgery. ' +
    'Generate a strong secret immediately with: node scripts/generate-jwt-secret.js'

  if (isDevelopment) {
    console.warn(`⚠️  ${message}`)
  } else {
    const error = new Error('CRITICAL SECURITY ERROR: ' + message)
    console.error(error.message)
    throw error
  }
}

/**
 * Generate JWT access token
 * @param {Object} payload - Token payload (user data)
 * @returns {string} JWT access token
 */
export function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES,
    issuer: 'dronedoc-auth-service',
    audience: 'dronedoc-api',
  })
}

/**
 * Generate JWT refresh token
 * @param {Object} payload - Token payload (user data)
 * @returns {string} JWT refresh token
 */
export function generateRefreshToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES,
    issuer: 'dronedoc-auth-service',
    audience: 'dronedoc-api',
  })
}

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User object
 * @returns {Object} {accessToken, refreshToken, expiresIn}
 */
export function generateTokenPair(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    email: user.email,
  }

  const accessToken = generateAccessToken(payload)
  const refreshToken = generateRefreshToken(payload)

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRES,
  }
}

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'dronedoc-auth-service',
      audience: 'dronedoc-api',
    })
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired')
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token')
    }
    throw error
  }
}

/**
 * Hash token for storage (SHA-256)
 * @param {string} token - Token to hash
 * @returns {string} Hashed token
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Generate random token string
 * @param {number} length - Token length in bytes (default 32)
 * @returns {string} Random hex token
 */
export function generateRandomToken(length = 32) {
  return crypto.randomBytes(length).toString('hex')
}

/**
 * Calculate token expiration time
 * @param {string} expiresIn - Expiration time (e.g., '15m', '7d')
 * @returns {Date} Expiration date
 */
export function calculateExpiration(expiresIn) {
  const match = expiresIn.match(/^(\d+)([smhd])$/)
  if (!match) {
    throw new Error('Invalid expiration format')
  }

  const value = parseInt(match[1])
  const unit = match[2]

  const now = new Date()
  switch (unit) {
    case 's':
      return new Date(now.getTime() + value * 1000)
    case 'm':
      return new Date(now.getTime() + value * 60 * 1000)
    case 'h':
      return new Date(now.getTime() + value * 60 * 60 * 1000)
    case 'd':
      return new Date(now.getTime() + value * 24 * 60 * 60 * 1000)
    default:
      throw new Error('Invalid time unit')
  }
}

export default {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyToken,
  hashToken,
  generateRandomToken,
  calculateExpiration,
}
