import express from 'express'
import { body, validationResult } from 'express-validator'
import * as userService from '../../services/auth/userService.js'
import * as authMethodService from '../../services/auth/authMethodService.js'
import * as sessionService from '../../services/auth/sessionService.js'
import { isValidEmail, isValidPhone, normalizePhone, validateUsername } from '../../utils/auth/validation.js'
import { validatePasswordStrength } from '../../utils/auth/password.js'
import logger from '../../utils/logger.js'
import { authLimiter, registerLimiter, passwordResetLimiter, verificationLimiter } from '../../middleware/security/rateLimiter.js'
import { authenticate } from '../../middleware/auth/auth.js'
import defaultTokenService from '../../services/ai/defaultTokenService.js'

// Auth-specific logging helpers
const logAuthSuccess = (data) => logger.info({ ...data, type: 'auth_success' })
const logAuthFailure = (data) => logger.error({ ...data, type: 'auth_failure' })

const router = express.Router()

/**
 * Register with email and password
 * POST /api/auth/register/email
 */
router.post(
  '/register/email',
  registerLimiter,
  [
    body('email').isEmail().withMessage('Неверный формат email'),
    body('password').isLength({ min: 8 }).withMessage('Пароль должен быть минимум 8 символов'),
    body('username').optional().isLength({ min: 3, max: 50 }),
    body('displayName').optional().isLength({ max: 255 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { email, password, username, displayName } = req.body

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password)
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          success: false,
          errors: passwordValidation.errors,
        })
      }

      // Check if user exists
      const existingUser = await userService.userExists({ email })
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Пользователь с таким email уже существует',
        })
      }

      // Validate username if provided
      if (username) {
        const usernameValidation = validateUsername(username)
        if (!usernameValidation.isValid) {
          return res.status(400).json({
            success: false,
            error: usernameValidation.error,
          })
        }

        const usernameExists = await userService.userExists({ username })
        if (usernameExists) {
          return res.status(409).json({
            success: false,
            error: 'Имя пользователя уже занято',
          })
        }
      }

      // Create user
      const user = await userService.createUser({
        email,
        username: username || null,
        displayName: displayName || null,
      })

      // Create password auth method
      await authMethodService.createAuthMethod(user.id, {
        authType: 'email_password',
        password,
        isPrimary: true,
      })

      // Create session
      const tokens = await sessionService.createSession(user, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      })

      // Issue #5025: Create default AI token for new user (1M tokens welcome bonus)
      // This is done asynchronously and non-blocking - registration succeeds even if token creation fails
      defaultTokenService.ensureDefaultToken(user.id, tokens.accessToken).catch(error => {
        logger.error('Failed to create default AI token for new user', {
          userId: user.id,
          error: error.message
        })
        // Don't fail registration if token creation fails
      })

      logAuthSuccess(user, 'email_password', req.ip)

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.display_name,
            isVerified: user.is_verified,
          },
          ...tokens,
        },
      })
    } catch (error) {
      console.error('Registration error:', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка регистрации',
      })
    }
  }
)

/**
 * Register with phone and password
 * POST /api/auth/register/phone
 */
router.post(
  '/register/phone',
  registerLimiter,
  [
    body('phone').custom((value) => isValidPhone(value)).withMessage('Неверный формат телефона'),
    body('password').isLength({ min: 8 }).withMessage('Пароль должен быть минимум 8 символов'),
    body('displayName').optional().isLength({ max: 255 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { phone, password, displayName } = req.body
      const normalizedPhone = normalizePhone(phone)

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password)
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          success: false,
          errors: passwordValidation.errors,
        })
      }

      // Check if user exists
      const existingUser = await userService.userExists({ phone: normalizedPhone })
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Пользователь с таким телефоном уже существует',
        })
      }

      // Create user
      const user = await userService.createUser({
        phone: normalizedPhone,
        displayName: displayName || null,
      })

      // Create password auth method
      await authMethodService.createAuthMethod(user.id, {
        authType: 'phone_password',
        password,
        isPrimary: true,
      })

      // Create session
      const tokens = await sessionService.createSession(user, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      })

      // Issue #5025: Create default AI token for new user (1M tokens welcome bonus)
      // This is done asynchronously and non-blocking - registration succeeds even if token creation fails
      defaultTokenService.ensureDefaultToken(user.id, tokens.accessToken).catch(error => {
        logger.error('Failed to create default AI token for new user', {
          userId: user.id,
          error: error.message
        })
        // Don't fail registration if token creation fails
      })

      logAuthSuccess(user, 'phone_password', req.ip)

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            phone: user.phone,
            displayName: user.display_name,
            isVerified: user.is_verified,
          },
          ...tokens,
        },
      })
    } catch (error) {
      console.error('Registration error:', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка регистрации',
      })
    }
  }
)

/**
 * Login with email/username/phone and password
 * POST /api/auth/login
 */
router.post(
  '/login',
  authLimiter,
  [
    body('identifier').notEmpty().withMessage('Укажите email, телефон или имя пользователя'),
    body('password').notEmpty().withMessage('Укажите пароль'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { identifier, password } = req.body

      // Normalize phone if it looks like a phone number
      const normalizedIdentifier = isValidPhone(identifier)
        ? normalizePhone(identifier)
        : identifier

      // Find user with password auth method
      const authData = await authMethodService.findPasswordAuthMethod(normalizedIdentifier)

      if (!authData) {
        logAuthFailure(identifier, 'user_not_found', req.ip)
        return res.status(401).json({
          success: false,
          error: 'Неверные учетные данные',
        })
      }

      // Verify password
      const isValidPassword = await authMethodService.verifyPassword(
        authData.auth_method_id,
        password
      )

      if (!isValidPassword) {
        logAuthFailure(identifier, 'invalid_password', req.ip)
        return res.status(401).json({
          success: false,
          error: 'Неверные учетные данные',
        })
      }

      // Update last login and auth method last used
      await userService.updateLastLogin(authData.id)
      await authMethodService.updateAuthMethodLastUsed(authData.auth_method_id)

      // Create session
      const tokens = await sessionService.createSession(authData, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      })

      logAuthSuccess(authData, 'password', req.ip)

      res.json({
        success: true,
        data: {
          user: {
            id: authData.id,
            username: authData.username,
            email: authData.email,
            phone: authData.phone,
            displayName: authData.display_name,
            isVerified: authData.is_verified,
          },
          ...tokens,
        },
      })
    } catch (error) {
      console.error('Login error:', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка входа',
      })
    }
  }
)

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required',
      })
    }

    // Find session by refresh token
    const session = await sessionService.findSessionByRefreshToken(refreshToken)

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token',
      })
    }

    // Get user
    const user = await userService.findUserById(session.user_id)

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
      })
    }

    // Refresh session
    const tokens = await sessionService.refreshSession(refreshToken, user)

    res.json({
      success: true,
      data: tokens,
    })
  } catch (error) {
    console.error('Refresh error:', error)
    res.status(401).json({
      success: false,
      error: error.message || 'Failed to refresh token',
    })
  }
})

/**
 * Logout (invalidate current session)
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    const accessToken = authHeader.substring(7)

    await sessionService.invalidateSession(accessToken)

    res.json({
      success: true,
      message: 'Logged out successfully',
    })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({
      success: false,
      error: 'Logout failed',
    })
  }
})

/**
 * Logout from all sessions
 * POST /api/auth/logout-all
 */
router.post('/logout-all', authenticate, async (req, res) => {
  try {
    await sessionService.invalidateAllUserSessions(req.user.userId)

    res.json({
      success: true,
      message: 'Logged out from all sessions',
    })
  } catch (error) {
    console.error('Logout all error:', error)
    res.status(500).json({
      success: false,
      error: 'Logout failed',
    })
  }
})

/**
 * Get current user info
 * GET /api/auth/me
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await userService.getUserWithAuthMethods(req.user.userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      })
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          phone: user.phone,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
          isVerified: user.is_verified,
          createdAt: user.created_at,
        },
        authMethods: user.authMethods,
      },
    })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get user info',
    })
  }
})

export default router
