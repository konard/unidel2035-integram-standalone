/**
 * Cookie Management Utilities
 *
 * Secure cookie handling for JWT tokens
 * Uses httpOnly cookies to prevent XSS attacks
 *
 * Security features:
 * - httpOnly: Prevents JavaScript access
 * - secure: Only sent over HTTPS
 * - sameSite: CSRF protection
 * - domain/path: Scope control
 */

import crypto from 'crypto'
import logger from '../logger.js'

/**
 * Cookie configuration
 */
const COOKIE_CONFIG = {
  // Access token cookie (short-lived)
  ACCESS_TOKEN: {
    name: 'access_token',
    maxAge: 15 * 60 * 1000, // 15 minutes
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict', // CSRF protection
    path: '/',
  },

  // Refresh token cookie (long-lived)
  REFRESH_TOKEN: {
    name: 'refresh_token',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth/refresh', // Only sent to refresh endpoint
  },

  // XSRF token cookie (readable by JS for CSRF protection)
  XSRF_TOKEN: {
    name: 'xsrf_token',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: false, // Must be readable by JS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  },
}

/**
 * Set access token cookie
 * @param {Object} res - Express response object
 * @param {string} token - JWT access token
 */
export function setAccessTokenCookie(res, token) {
  try {
    res.cookie(COOKIE_CONFIG.ACCESS_TOKEN.name, token, COOKIE_CONFIG.ACCESS_TOKEN)
    logger.debug('Access token cookie set')
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to set access token cookie')
    throw error
  }
}

/**
 * Set refresh token cookie
 * @param {Object} res - Express response object
 * @param {string} token - JWT refresh token
 */
export function setRefreshTokenCookie(res, token) {
  try {
    res.cookie(COOKIE_CONFIG.REFRESH_TOKEN.name, token, COOKIE_CONFIG.REFRESH_TOKEN)
    logger.debug('Refresh token cookie set')
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to set refresh token cookie')
    throw error
  }
}

/**
 * Set XSRF token cookie
 * @param {Object} res - Express response object
 * @param {string} token - XSRF token
 */
export function setXSRFTokenCookie(res, token) {
  try {
    res.cookie(COOKIE_CONFIG.XSRF_TOKEN.name, token, COOKIE_CONFIG.XSRF_TOKEN)
    logger.debug('XSRF token cookie set')
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to set XSRF token cookie')
    throw error
  }
}

/**
 * Set all authentication cookies
 * @param {Object} res - Express response object
 * @param {Object} tokens - { accessToken, refreshToken, xsrfToken }
 */
export function setAuthCookies(res, tokens) {
  setAccessTokenCookie(res, tokens.accessToken)
  setRefreshTokenCookie(res, tokens.refreshToken)
  if (tokens.xsrfToken) {
    setXSRFTokenCookie(res, tokens.xsrfToken)
  }
}

/**
 * Get access token from cookie
 * @param {Object} req - Express request object
 * @returns {string|null} Access token or null
 */
export function getAccessTokenFromCookie(req) {
  return req.cookies?.[COOKIE_CONFIG.ACCESS_TOKEN.name] || null
}

/**
 * Get refresh token from cookie
 * @param {Object} req - Express request object
 * @returns {string|null} Refresh token or null
 */
export function getRefreshTokenFromCookie(req) {
  return req.cookies?.[COOKIE_CONFIG.REFRESH_TOKEN.name] || null
}

/**
 * Get XSRF token from cookie
 * @param {Object} req - Express request object
 * @returns {string|null} XSRF token or null
 */
export function getXSRFTokenFromCookie(req) {
  return req.cookies?.[COOKIE_CONFIG.XSRF_TOKEN.name] || null
}

/**
 * Clear all authentication cookies
 * @param {Object} res - Express response object
 */
export function clearAuthCookies(res) {
  try {
    res.clearCookie(COOKIE_CONFIG.ACCESS_TOKEN.name, { path: '/' })
    res.clearCookie(COOKIE_CONFIG.REFRESH_TOKEN.name, { path: '/api/auth/refresh' })
    res.clearCookie(COOKIE_CONFIG.XSRF_TOKEN.name, { path: '/' })
    logger.debug('All auth cookies cleared')
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to clear auth cookies')
    throw error
  }
}

/**
 * Generate XSRF token
 * @returns {string} Random XSRF token
 */
export function generateXSRFToken() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Validate XSRF token
 * Compares cookie value with header value
 * @param {Object} req - Express request object
 * @returns {boolean} True if valid
 */
export function validateXSRFToken(req) {
  const cookieToken = getXSRFTokenFromCookie(req)
  const headerToken = req.get('X-XSRF-TOKEN')

  if (!cookieToken || !headerToken) {
    return false
  }

  return cookieToken === headerToken
}

export default {
  COOKIE_CONFIG,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  setXSRFTokenCookie,
  setAuthCookies,
  getAccessTokenFromCookie,
  getRefreshTokenFromCookie,
  getXSRFTokenFromCookie,
  clearAuthCookies,
  generateXSRFToken,
  validateXSRFToken,
}
