import { verifyToken } from '../../utils/auth/jwt.js'
import { getAccessTokenFromCookie } from '../../utils/auth/cookies.js'
import logger from '../../utils/logger.js'

/**
 * Authentication middleware - verifies JWT token
 *
 * Security: Supports both Authorization header and httpOnly cookies
 * Priority: Cookies > Authorization header (more secure)
 *
 * Token sources (in order of preference):
 * 1. httpOnly cookie (most secure, prevents XSS)
 * 2. Authorization header: Bearer <token> (backward compatibility)
 */
export function authenticate(req, res, next) {
  try {
    let token = null

    // Priority 1: Check httpOnly cookie (more secure against XSS)
    token = getAccessTokenFromCookie(req)

    // Priority 2: Fall back to Authorization header (backward compatibility)
    if (!token) {
      const authHeader = req.headers.authorization
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7) // Remove 'Bearer ' prefix
      }
    }

    // No token found in either location
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided',
      })
    }

    // Verify token
    const decoded = verifyToken(token)
    req.user = decoded // Attach user info to request
    next()
  } catch (error) {
    logger.warn({ error: error.message }, 'Authentication failed')
    return res.status(401).json({
      success: false,
      error: error.message || 'Invalid authentication token',
    })
  }
}

/**
 * Optional authentication middleware - doesn't fail if no token
 * Useful for endpoints that work differently for authenticated users
 */
export function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const decoded = verifyToken(token)
      req.user = decoded
    }

    next()
  } catch (error) {
    // Continue without authentication
    next()
  }
}

/**
 * Check if user has required permissions
 * @param {string[]} requiredPermissions - Array of required permissions
 */
export function requirePermissions(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      })
    }

    const userPermissions = req.user.permissions || []

    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.includes(permission)
    )

    if (!hasPermission) {
      logger.warn(
        {
          userId: req.user.userId,
          required: requiredPermissions,
          has: userPermissions,
        },
        'Permission denied'
      )

      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      })
    }

    next()
  }
}

/**
 * Check if user is verified
 */
export function requireVerified(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    })
  }

  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      error: 'Account verification required',
    })
  }

  next()
}

export default {
  authenticate,
  optionalAuth,
  requirePermissions,
  requireVerified,
}
