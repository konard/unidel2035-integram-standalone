/**
 * Unified Authentication API Routes
 *
 * Issue #3554: Single authentication point for all databases
 * Issue #3556: Enhanced authentication with auto-renewal, SSO, MFA, and monitoring
 *
 * Endpoints:
 * - POST /api/unified-auth/login - Unified login across all databases (with MFA support)
 * - GET /api/unified-auth/session/:sessionId - Get session details
 * - GET /api/unified-auth/tokens/:sessionId - Get all tokens from session
 * - GET /api/unified-auth/token/:sessionId/:database - Get token for specific database
 * - POST /api/unified-auth/refresh - Refresh authentication for a database
 * - POST /api/unified-auth/renew-tokens - Manually renew all tokens (Issue #3556)
 * - POST /api/unified-auth/logout - Invalidate session
 * - GET /api/unified-auth/stats - Get authentication statistics
 * - POST /api/unified-auth/mfa/verify - Verify MFA code (Issue #3556)
 * - POST /api/unified-auth/sso/configure - Configure SSO provider (Issue #3556)
 * - GET /api/unified-auth/sso/auth-url/:provider - Get SSO authorization URL (Issue #3556)
 * - POST /api/unified-auth/sso/login - Login with SSO (Issue #3556)
 * - GET /api/unified-auth/session/:sessionId/activity - Get session activity (Issue #3556)
 * - GET /api/unified-auth/activities - Get all session activities (Issue #3556)
 */

import express from 'express';
import { UnifiedAuthService } from '../../services/unified-auth/UnifiedAuthService.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Initialize unified auth service
// Issue #3631: Enhanced with database persistence support
let unifiedAuthService;

try {
  // Try to load persistence wrapper if available (CommonJS module)
  const UnifiedAuthServiceWithPersistence = require('../../services/unified-auth/UnifiedAuthServiceWithPersistence.js');
  const baseAuthService = new UnifiedAuthService({ logger });

  unifiedAuthService = new UnifiedAuthServiceWithPersistence({
    logger,
    baseAuthService,
    enablePersistence: process.env.ENABLE_DB_TOKEN_STORAGE === 'true'
  });

  logger.info({
    persistenceEnabled: process.env.ENABLE_DB_TOKEN_STORAGE === 'true'
  }, 'Unified auth service initialized with persistence support');
} catch (error) {
  // Fall back to base service if persistence wrapper not available
  logger.warn({ error: error.message }, 'Database token storage not available, using in-memory only');
  unifiedAuthService = new UnifiedAuthService({ logger });
}

// Cleanup expired sessions every hour
setInterval(async () => {
  await unifiedAuthService.cleanupExpiredSessions();
}, 60 * 60 * 1000);

/**
 * POST /api/unified-auth/login
 * Unified login across all databases (with MFA and SSO support - Issue #3556)
 *
 * Body:
 * - username: string (required if not using SSO)
 * - password: string (required if not using SSO)
 * - databases: string[] (optional) - specific databases to authenticate
 * - mfaCode: string (optional) - MFA verification code
 * - ssoProvider: string (optional) - SSO provider name (e.g., 'google', 'github')
 * - ssoToken: string (optional) - SSO access token
 *
 * Returns:
 * - success: boolean
 * - session: object with sessionId and tokens for all databases
 * - requiresMFA: boolean (if MFA is required)
 * - challengeId: string (if MFA challenge was generated)
 * - error: string (if failed)
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password, databases, mfaCode, ssoProvider, ssoToken } = req.body;

    // SSO login path
    if (ssoProvider && ssoToken) {
      logger.info({ ssoProvider }, 'SSO login request');
      const result = await unifiedAuthService.authenticateUnified(null, null, {
        ssoProvider,
        ssoToken,
        databases
      });

      if (!result.success) {
        return res.status(401).json(result);
      }

      return res.json(result);
    }

    // Regular login (with MFA support)
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required (or use SSO)'
      });
    }

    logger.info({ username, databases, mfa: !!mfaCode }, 'Unified auth login request');

    const result = await unifiedAuthService.authenticateUnified(username, password, {
      databases,
      mfaCode
    });

    // MFA required response
    if (!result.success && result.requiresMFA) {
      return res.status(403).json(result);
    }

    if (!result.success) {
      return res.status(401).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Unified auth login error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/unified-auth/session/:sessionId
 * Get session details
 * Issue #3631: Now supports database persistence (async)
 *
 * Returns:
 * - Session object or 404 if not found
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info({ sessionId }, 'Get session request');

    const session = await unifiedAuthService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired'
      });
    }

    res.json({
      success: true,
      session
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Get session error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/unified-auth/tokens/:sessionId
 * Get all tokens from session
 *
 * Returns:
 * - Object mapping database names to token data
 */
router.get('/tokens/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info({ sessionId }, 'Get all tokens request');

    const tokens = await unifiedAuthService.getAllTokens(sessionId);

    if (Object.keys(tokens).length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired'
      });
    }

    res.json({
      success: true,
      tokens
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Get tokens error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/unified-auth/token/:sessionId/:database
 * Get token for specific database
 *
 * Returns:
 * - Database authentication data or 404 if not found
 */
router.get('/token/:sessionId/:database', async (req, res) => {
  try {
    const { sessionId, database } = req.params;

    logger.info({ sessionId, database }, 'Get database token request');

    const dbAuth = await unifiedAuthService.getTokenForDatabase(sessionId, database);

    if (!dbAuth) {
      return res.status(404).json({
        success: false,
        error: `Token not found for database '${database}' or session expired`
      });
    }

    res.json({
      success: true,
      database: dbAuth.database,
      token: dbAuth.token,
      xsrf: dbAuth.xsrf,
      userId: dbAuth.userId,
      userName: dbAuth.userName,
      userRole: dbAuth.userRole,
      authenticatedAt: dbAuth.authenticatedAt
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Get database token error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/unified-auth/my-token/:sessionId
 * Get 'my' database token for cross-database access (Issue #3811)
 *
 * This endpoint returns the 'my' database token which can be used
 * with the 'my:' header to access other databases.
 *
 * Returns:
 * - My database authentication data or 404 if not found
 */
router.get('/my-token/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info({ sessionId }, 'Get my database token request');

    const myDbAuth = await unifiedAuthService.getMyDatabaseToken(sessionId);

    if (!myDbAuth) {
      return res.status(404).json({
        success: false,
        error: 'My database token not found or session expired'
      });
    }

    res.json({
      success: true,
      database: 'my',
      token: myDbAuth.token,
      xsrf: myDbAuth.xsrf,
      userId: myDbAuth.userId,
      userName: myDbAuth.userName,
      userRole: myDbAuth.userRole,
      authenticatedAt: myDbAuth.authenticatedAt,
      usage: 'Use this token with "my: {token}" header for cross-database access'
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Get my database token error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/unified-auth/refresh
 * Refresh authentication for a specific database
 *
 * Body:
 * - sessionId: string (required)
 * - database: string (required)
 * - password: string (required)
 *
 * Returns:
 * - Refresh result with new token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { sessionId, database, password } = req.body;

    if (!sessionId || !database || !password) {
      return res.status(400).json({
        success: false,
        error: 'SessionId, database, and password are required'
      });
    }

    logger.info({ sessionId, database }, 'Refresh database auth request');

    const result = await unifiedAuthService.refreshDatabaseAuth(sessionId, database, password);

    if (!result.success) {
      return res.status(401).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Refresh database auth error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/unified-auth/logout
 * Invalidate session (logout)
 *
 * Body:
 * - sessionId: string (required)
 *
 * Returns:
 * - Success message
 */
router.post('/logout', (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'SessionId is required'
      });
    }

    logger.info({ sessionId }, 'Logout request');

    unifiedAuthService.invalidateSession(sessionId);

    res.json({
      success: true,
      message: 'Session invalidated successfully'
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Logout error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/unified-auth/stats
 * Get authentication statistics
 *
 * Returns:
 * - activeSessionsCount: number of active sessions
 */
router.get('/stats', (req, res) => {
  try {
    const activeSessionsCount = unifiedAuthService.getActiveSessionCount();

    res.json({
      success: true,
      stats: {
        activeSessionsCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Get stats error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========== Issue #3556: New Endpoints ==========

/**
 * POST /api/unified-auth/renew-tokens
 * Manually renew all tokens in a session (Issue #3556)
 *
 * Body:
 * - sessionId: string (required)
 * - username: string (required)
 * - password: string (required)
 *
 * Returns:
 * - success: boolean
 * - renewalResults: array of renewal results per database
 * - successCount: number
 * - failureCount: number
 */
router.post('/renew-tokens', async (req, res) => {
  try {
    const { sessionId, username, password } = req.body;

    if (!sessionId || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'SessionId, username, and password are required'
      });
    }

    logger.info({ sessionId }, 'Manual token renewal request');

    const result = await unifiedAuthService.renewAllTokens(sessionId, username, password);

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Token renewal error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/unified-auth/mfa/verify
 * Verify MFA code (Issue #3556)
 *
 * Body:
 * - username: string (required)
 * - code: string (required)
 *
 * Returns:
 * - success: boolean
 * - valid: boolean
 */
router.post('/mfa/verify', async (req, res) => {
  try {
    const { username, code } = req.body;

    if (!username || !code) {
      return res.status(400).json({
        success: false,
        error: 'Username and code are required'
      });
    }

    logger.info({ username }, 'MFA verification request');

    const valid = await unifiedAuthService.verifyMFACode(username, code);

    res.json({
      success: true,
      valid
    });
  } catch (error) {
    logger.error({ error: error.message }, 'MFA verification error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/unified-auth/sso/configure
 * Configure SSO provider (Issue #3556)
 *
 * Body:
 * - providerName: string (required) - e.g., 'google', 'github', 'microsoft'
 * - config: object (required) with:
 *   - clientId: string
 *   - clientSecret: string
 *   - redirectUri: string
 *   - authorizationUrl: string
 *   - tokenUrl: string
 *   - userInfoUrl: string
 *   - scopes: string[] (optional)
 *
 * Returns:
 * - success: boolean
 * - message: string
 */
router.post('/sso/configure', (req, res) => {
  try {
    const { providerName, config } = req.body;

    if (!providerName || !config) {
      return res.status(400).json({
        success: false,
        error: 'Provider name and config are required'
      });
    }

    const requiredFields = ['clientId', 'clientSecret', 'redirectUri', 'authorizationUrl', 'tokenUrl', 'userInfoUrl'];
    const missingFields = requiredFields.filter(field => !config[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required config fields: ${missingFields.join(', ')}`
      });
    }

    logger.info({ providerName }, 'SSO provider configuration request');

    unifiedAuthService.configureSSOProvider(providerName, config);

    res.json({
      success: true,
      message: `SSO provider '${providerName}' configured successfully`
    });
  } catch (error) {
    logger.error({ error: error.message }, 'SSO configuration error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/unified-auth/sso/auth-url/:provider
 * Get SSO authorization URL (Issue #3556)
 *
 * Query params:
 * - state: string (required) - CSRF state token
 *
 * Returns:
 * - success: boolean
 * - authUrl: string
 */
router.get('/sso/auth-url/:provider', (req, res) => {
  try {
    const { provider } = req.params;
    const { state } = req.query;

    if (!state) {
      return res.status(400).json({
        success: false,
        error: 'State parameter is required for CSRF protection'
      });
    }

    logger.info({ provider }, 'SSO auth URL request');

    const authUrl = unifiedAuthService.getSSOAuthorizationUrl(provider, state);

    res.json({
      success: true,
      authUrl
    });
  } catch (error) {
    logger.error({ error: error.message }, 'SSO auth URL error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/unified-auth/sso/login
 * Login with SSO (Issue #3556)
 *
 * Body:
 * - provider: string (required)
 * - ssoToken: string (required)
 * - databases: string[] (optional)
 *
 * Returns:
 * - success: boolean
 * - session: object
 */
router.post('/sso/login', async (req, res) => {
  try {
    const { provider, ssoToken, databases } = req.body;

    if (!provider || !ssoToken) {
      return res.status(400).json({
        success: false,
        error: 'Provider and SSO token are required'
      });
    }

    logger.info({ provider }, 'SSO login request');

    const result = await unifiedAuthService.authenticateUnified(null, null, {
      ssoProvider: provider,
      ssoToken,
      databases
    });

    if (!result.success) {
      return res.status(401).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'SSO login error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/unified-auth/session/:sessionId/activity
 * Get session activity statistics (Issue #3556)
 *
 * Returns:
 * - success: boolean
 * - activity: object with session activity data
 */
router.get('/session/:sessionId/activity', (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info({ sessionId }, 'Get session activity request');

    const activity = unifiedAuthService.getSessionActivity(sessionId);

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Session activity not found'
      });
    }

    res.json({
      success: true,
      activity
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Get session activity error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/unified-auth/activities
 * Get all session activities (Issue #3556)
 *
 * Returns:
 * - success: boolean
 * - activities: array of all session activities
 */
router.get('/activities', (req, res) => {
  try {
    logger.info('Get all session activities request');

    const activities = unifiedAuthService.getAllSessionActivities();

    res.json({
      success: true,
      activities,
      count: activities.length
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Get all session activities error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
