/**
 * Email Authentication API Routes
 *
 * Handles email-based user registration, verification, and password reset.
 * Integrates with Integram user database (table 18).
 *
 * Routes:
 * - POST /api/email-auth/register - Send email verification
 * - POST /api/email-auth/verify - Verify email and create user
 * - POST /api/email-auth/resend-verification - Resend verification email
 * - POST /api/email-auth/password-reset-request - Request password reset
 * - POST /api/email-auth/password-reset - Reset password with token
 * - POST /api/email-auth/magic-link - Request magic link
 * - POST /api/email-auth/magic-login - Login with magic link
 *
 * @module EmailAuthRoutes
 */

import express from 'express';
import logger from '../../utils/logger.js';
import {
  sendEmailVerification,
  verifyEmail,
  sendPasswordReset,
  verifyPasswordResetToken,
  resetPassword,
  sendMagicLink,
  verifyMagicLink
} from '../../services/email/EmailVerificationService.js';
import defaultTokenService from '../../services/ai/defaultTokenService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import {
  enforceHTTPS,
  getSecureAxiosConfig,
  validateSensitiveDataTransmission,
  auditSecurityOperation
} from '../../utils/secureApiClient.js';
import { validatePasswordStrength } from '../../utils/auth/password.js';
import { isValidEmail, validateUsername } from '../../utils/auth/validation.js';

const router = express.Router();

/**
 * POST /api/email-auth/register
 * Send email verification for new user registration
 *
 * Body:
 * - email: string (required)
 * - password: string (required, min 8 chars)
 * - username: string (optional)
 * - displayName: string (optional)
 */
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, username, displayName, referralCode } = req.body;

  // Validate required fields
  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'Email is required'
    });
  }

  if (!password) {
    return res.status(400).json({
      success: false,
      error: 'Password is required'
    });
  }

  // Get base URL for verification link
  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = process.env.FRONTEND_URL || `${protocol}://${host}`;

  logger.info({ email, username, referralCode }, 'Email registration request');

  // Send verification email - errors are caught by asyncHandler
  const result = await sendEmailVerification({
    email,
    password,
    username,
    displayName,
    referralCode, // Pass referral code
    baseUrl
  });

  res.status(200).json({
    success: true,
    message: 'Verification email sent. Please check your inbox.',
    email: result.email
  });
}));

/**
 * POST /api/email-auth/register-direct
 * Register user directly without email verification (for development/testing)
 *
 * Body:
 * - email: string (required)
 * - password: string (required)
 * - username: string (optional)
 * - displayName: string (optional)
 * - database: string (optional, default: 'my')
 */
router.post('/register-direct', async (req, res) => {
  try {
    const { email, password, username, displayName, database = 'my' } = req.body;

    // Validate required fields
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        errors: passwordValidation.errors
      });
    }

    // Validate username if provided
    if (username) {
      const usernameValidation = validateUsername(username);
      if (!usernameValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: usernameValidation.error
        });
      }
    }

    logger.info({ email, username, database }, 'Direct registration request');

    // Import axios for direct Integram API calls
    const axios = (await import('axios')).default;
    const { createIntegramClient } = await import('../../utils/IntegramClient.js');

    const baseUrl = 'https://example.integram.io';
    const systemLogin = process.env.INTEGRAM_REGISTRATION_USERNAME;
    const systemPwd = process.env.INTEGRAM_REGISTRATION_PASSWORD;

    // Validate required credentials
    if (!systemLogin || !systemPwd) {
      throw new Error('INTEGRAM_REGISTRATION credentials not configured. Please set INTEGRAM_REGISTRATION_USERNAME and INTEGRAM_REGISTRATION_PASSWORD environment variables.');
    }

    // SECURITY: Validate HTTPS before transmitting credentials (CWE-319 mitigation)
    enforceHTTPS(baseUrl);

    // Step 1: Authenticate with Integram
    const authUrl = `${baseUrl}/${database}/auth?JSON_KV`;
    const formData = new URLSearchParams();
    formData.append('login', systemLogin);
    formData.append('pwd', systemPwd);

    // Get secure axios configuration with HTTPS agent
    const secureConfig = getSecureAxiosConfig(authUrl, { hasSensitiveData: true });

    const authResponse = await axios.post(authUrl, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      ...secureConfig
    });

    if (authResponse.data.failed) {
      throw new Error('System authentication failed');
    }

    // Get token and xsrf from auth response
    const token = authResponse.data.token;
    const xsrfToken = authResponse.data._xsrf;

    // Step 1.5: Check if username or email already exists
    const client = createIntegramClient(database);
    client.session = {
      token: token,
      xsrf: xsrfToken,
      userId: authResponse.data.id
    };

    const userCheck = await client.checkUserExists(username || email.split('@')[0], email);
    if (userCheck.exists) {
      const field = userCheck.matchedField === 'username' ? 'Имя пользователя' : 'Email';
      const value = userCheck.matchedField === 'username' ? (username || email.split('@')[0]) : email;
      logger.warn({ username, email, matchedField: userCheck.matchedField }, 'User already exists');
      return res.status(409).json({
        success: false,
        error: `${field} "${value}" уже зарегистрирован. Пожалуйста, используйте другой ${userCheck.matchedField === 'username' ? 'логин' : 'email'} или войдите в существующий аккаунт.`
      });
    }

    // Step 2: Create user in table 18 (Users table)
    const usersTableId = 18;
    const createUrl = `${baseUrl}/${database}/_m_new/${usersTableId}?JSON_KV`;

    // IMPORTANT: Send plain password to Integram - it handles hashing internally
    // Do NOT hash with bcrypt as Integram uses its own hashing algorithm

    const createData = new URLSearchParams();
    createData.append('_xsrf', xsrfToken);
    createData.append(`t${usersTableId}`, username || email.split('@')[0]); // Main value (username)
    createData.append('up', '1'); // Independent object

    const createResponse = await axios.post(createUrl, createData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Authorization': token
      }
    });

    if (!createResponse.data || !createResponse.data.id) {
      throw new Error('Failed to create user record');
    }

    const userId = createResponse.data.id;

    // Step 3: Set user requisites (email, password, name)
    // Standard User table requisite IDs in Integram 'my' database:
    // - 41: Email (SHORT)
    // - 20: Password (PWD) - Send PLAIN password, Integram hashes it internally!
    // - 33: Name (SHORT)
    const emailReqId = 41;
    const pwdReqId = 20;
    const nameReqId = 33;

    // IMPORTANT: Send PLAIN password - Integram handles MD5 hashing internally
    // Do NOT hash with MD5 or bcrypt - just send the plain text password

    // Use _m_save instead of _m_set (same as MCP integram_set_object_requisites)
    // _m_save requires t{typeId}=value to work correctly
    const saveUrl = `${baseUrl}/${database}/_m_save/${userId}?JSON_KV`;

    // SECURITY: Validate HTTPS before transmitting password (CWE-319 mitigation)
    validateSensitiveDataTransmission(saveUrl, { password }, ['password', `t${pwdReqId}`]);

    const saveData = new URLSearchParams();
    saveData.append('_xsrf', xsrfToken);
    saveData.append(`t${usersTableId}`, username || email.split('@')[0]); // Main value (t18)
    saveData.append(`t${emailReqId}`, email);
    saveData.append(`t${pwdReqId}`, password); // Send PLAIN password!
    saveData.append(`t${nameReqId}`, displayName || username || email.split('@')[0]);

    logger.info({
      url: saveUrl,
      data: {
        t18: username || email.split('@')[0],
        t41: email,
        t20: '[PASSWORD]',
        t33: displayName || username || email.split('@')[0]
      }
    }, 'Sending password to Integram _m_save');

    // Get secure axios configuration with HTTPS agent
    const saveSecureConfig = getSecureAxiosConfig(saveUrl, { hasSensitiveData: true });

    await axios.post(saveUrl, saveData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Authorization': token
      },
      ...saveSecureConfig
    });

    // Audit user registration
    auditSecurityOperation({
      type: 'user_registered_direct',
      url: saveUrl,
      user: email,
      success: true,
      details: { userId, database }
    });

    logger.info({ email, username, userId, database }, 'User registered successfully');

    // Create welcome token for new user (async, non-blocking)
    defaultTokenService.ensureDefaultToken(userId, token)
      .then(tokenResult => {
        if (tokenResult.success) {
          logger.info({ userId, email, tokenId: tokenResult.tokenId }, 'Welcome token created');
        } else {
          logger.warn({ userId, email, error: tokenResult.error }, 'Failed to create welcome token');
        }
      })
      .catch(err => {
        logger.error({ userId, email, error: err.message }, 'Error creating welcome token');
      });

    res.status(200).json({
      success: true,
      message: 'User registered successfully',
      userId,
      email,
      database
    });
  } catch (error) {
    // Log full error server-side only (Issue #67)
    logger.error({ error: error.message, stack: error.stack }, 'Direct registration failed');
    // Send generic error to client without exposing internal details
    res.status(400).json({
      success: false,
      error: 'Ошибка регистрации. Пожалуйста, проверьте данные и попробуйте снова.'
    });
  }
});

/**
 * POST /api/email-auth/verify
 * Verify email and create user account
 *
 * Body:
 * - token: string (required)
 * - databases: string[] (optional, default: ['my'])
 */
router.post('/verify', asyncHandler(async (req, res) => {
  const { token, databases } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'Verification token is required'
    });
  }

  logger.info({ token: token.substring(0, 10) + '...' }, 'Email verification request');

  // Verify email and create user - errors caught by asyncHandler
  const result = await verifyEmail(token, databases);

  res.status(200).json({
    success: true,
    message: 'Email verified successfully. Your account has been created.',
    userId: result.userId,
    email: result.email,
    databases: result.databases
  });
}));

/**
 * POST /api/email-auth/resend-verification
 * Resend verification email
 *
 * Body:
 * - email: string (required)
 * - password: string (required)
 * - username: string (optional)
 * - displayName: string (optional)
 */
router.post('/resend-verification', asyncHandler(async (req, res) => {
  const { email, password, username, displayName } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = process.env.FRONTEND_URL || `${protocol}://${host}`;

  logger.info({ email }, 'Resend verification email request');

  // Send new verification email - errors caught by asyncHandler
  const result = await sendEmailVerification({
    email,
    password,
    username,
    displayName,
    baseUrl
  });

  res.status(200).json({
    success: true,
    message: 'Verification email resent. Please check your inbox.',
    email: result.email
  });
}));

/**
 * POST /api/email-auth/password-reset-request
 * Request password reset email
 *
 * Body:
 * - email: string (required)
 */
router.post('/password-reset-request', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    logger.info({ email }, 'Password reset request');

    // Look up user by email
    // NOTE: This requires implementing a getUserByEmail function in userSyncService
    // For now, we'll use a placeholder userId
    // In production, you should fetch the actual userId from the registry

    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = process.env.FRONTEND_URL || `${protocol}://${host}`;

    // TODO: Get actual userId from registry by email
    // For now, we'll just send the email
    // const user = await getUserByEmail(email);

    // Send password reset email
    const result = await sendPasswordReset({
      email,
      userId: 'placeholder-user-id', // TODO: Replace with actual userId
      baseUrl
    });

    // Always return success (don't reveal if email exists or not for security)
    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, we have sent a password reset link.',
      email
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Password reset request failed');
    // Don't reveal error details for security
    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, we have sent a password reset link.'
    });
  }
});

/**
 * POST /api/email-auth/password-reset
 * Reset password using token
 *
 * Body:
 * - token: string (required)
 * - newPassword: string (required, min 8 chars)
 */
router.post('/password-reset', asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'Reset token is required'
    });
  }

  if (!newPassword) {
    return res.status(400).json({
      success: false,
      error: 'New password is required'
    });
  }

  logger.info({ token: token.substring(0, 10) + '...' }, 'Password reset');

  // Reset password - errors caught by asyncHandler
  const result = await resetPassword(token, newPassword);

  res.status(200).json({
    success: true,
    message: 'Password reset successfully. You can now login with your new password.',
    email: result.email
  });
}));

/**
 * GET /api/email-auth/verify-reset-token
 * Verify password reset token (without resetting)
 *
 * Query:
 * - token: string (required)
 */
router.get('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Reset token is required'
      });
    }

    logger.info({ token: token.substring(0, 10) + '...' }, 'Verify reset token');

    // Verify token
    const result = await verifyPasswordResetToken(token);

    res.status(200).json({
      success: true,
      message: 'Token is valid',
      email: result.email
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Token verification failed');
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/email-auth/magic-link
 * Request magic link for passwordless login
 *
 * Body:
 * - email: string (required)
 */
router.post('/magic-link', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    logger.info({ email }, 'Magic link request');

    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = process.env.FRONTEND_URL || `${protocol}://${host}`;

    // TODO: Get actual userId from registry by email
    // For now, we'll use a placeholder
    // const user = await getUserByEmail(email);

    // Send magic link
    const result = await sendMagicLink({
      email,
      userId: 'placeholder-user-id', // TODO: Replace with actual userId
      baseUrl
    });

    // Always return success (don't reveal if email exists or not for security)
    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, we have sent a magic link to your inbox.'
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Magic link request failed');
    // Don't reveal error details for security
    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, we have sent a magic link to your inbox.'
    });
  }
});

/**
 * POST /api/email-auth/magic-login
 * Login using magic link token
 *
 * Body:
 * - token: string (required)
 */
router.post('/magic-login', asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'Magic link token is required'
    });
  }

  logger.info({ token: token.substring(0, 10) + '...' }, 'Magic login');

  // Verify magic link - errors caught by asyncHandler
  const result = await verifyMagicLink(token);

  // TODO: Create session/JWT token for the user
  // For now, just return user info

  res.status(200).json({
    success: true,
    message: 'Login successful',
    userId: result.userId,
    email: result.email
    // TODO: Add session token or JWT here
  });
}));

/**
 * GET /api/email-auth/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'email-auth',
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

export default router;
