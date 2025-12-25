import rateLimit from 'express-rate-limit';
import logger from '../../utils/logger.js';

/**
 * Rate Limiting and Abuse Protection Middleware
 * Issue #77: Comprehensive rate limiting system
 *
 * Features:
 * - In-memory rate limiting (no Redis required)
 * - Tier-based limits (Free, Team, Enterprise)
 * - Per-IP and per-user rate limiting
 * - Sliding window algorithm
 * - Custom error responses with retry information
 */

logger.info('Rate limiting using in-memory store (Redis removed)');

/**
 * Create rate limiter with in-memory store
 */
function createRateLimiter(options) {
  const config = {
    standardHeaders: true, // Return rate limit info in RateLimit-* headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    handler: (req, res) => {
      // Security: Log rate limit violations for suspicious activity monitoring
      logger.warn({
        type: 'rate_limit_exceeded',
        ip: req.ip,
        path: req.path,
        method: req.method,
        user: req.user?.id || 'anonymous',
        limiter: options.prefix || 'unknown',
        userAgent: req.get('user-agent'),
      }, 'Rate limit exceeded');

      const retryAfter = res.getHeader('Retry-After');
      res.status(429).json({
        success: false,
        error: options.message || 'Слишком много запросов, попробуйте позже',
        retryAfter: retryAfter ? parseInt(retryAfter) : Math.ceil(options.windowMs / 1000),
        limit: options.max,
        windowMs: options.windowMs,
      });
    },
    ...options,
  };

  // Use default in-memory store (express-rate-limit built-in)
  // No Redis needed - data stored in process memory

  return rateLimit(config);
}

/**
 * Extract user ID from request (if authenticated)
 */
function getUserKey(req) {
  // Try to get user ID from JWT token
  if (req.user && req.user.id) {
    return `user:${req.user.id}`;
  }
  // Fall back to IP address
  return `ip:${req.ip}`;
}

/**
 * Tier-based rate limiting configuration
 */
export const RATE_LIMIT_TIERS = {
  free: {
    requestsPerHour: parseInt(process.env.RATE_LIMIT_FREE_HOURLY || '100'),
    requestsPerDay: parseInt(process.env.RATE_LIMIT_FREE_DAILY || '1000'),
    burstLimit: parseInt(process.env.RATE_LIMIT_FREE_BURST || '10'),
  },
  team: {
    requestsPerHour: parseInt(process.env.RATE_LIMIT_TEAM_HOURLY || '1000'),
    requestsPerDay: parseInt(process.env.RATE_LIMIT_TEAM_DAILY || '10000'),
    burstLimit: parseInt(process.env.RATE_LIMIT_TEAM_BURST || '50'),
  },
  enterprise: {
    requestsPerHour: parseInt(process.env.RATE_LIMIT_ENTERPRISE_HOURLY || '10000'),
    requestsPerDay: parseInt(process.env.RATE_LIMIT_ENTERPRISE_DAILY || '100000'),
    burstLimit: parseInt(process.env.RATE_LIMIT_ENTERPRISE_BURST || '200'),
  },
};

/**
 * Get user's rate limit tier from database or default to free
 */
async function getUserTier(req) {
  // TODO: Implement database lookup for user tier
  // For now, return 'free' as default
  // In production, this should query the user's subscription tier from database
  return 'free';
}

/**
 * General API rate limiter (per-IP, sliding window)
 * Note: Health check endpoints (/api/health, /api/ready, /api/metrics) are registered
 * BEFORE this limiter in index.js to allow unrestricted monitoring access (Issue #2633)
 */
export const apiLimiter = createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Слишком много запросов, попробуйте позже',
  prefix: 'rl:api:',
  keyGenerator: (req) => req.ip,
});

/**
 * Tier-based API rate limiter (per-user with tier-based limits)
 */
export const tierBasedLimiter = async (req, res, next) => {
  const tier = await getUserTier(req);
  const limits = RATE_LIMIT_TIERS[tier] || RATE_LIMIT_TIERS.free;

  // Apply hourly limit
  const hourlyLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: limits.requestsPerHour,
    message: `Превышен лимит запросов для тарифа "${tier}". Попробуйте через час.`,
    prefix: `rl:tier:${tier}:hourly:`,
    keyGenerator: getUserKey,
  });

  return hourlyLimiter(req, res, next);
};

/**
 * Strict rate limiter for authentication endpoints
 * Protects against brute force attacks
 */
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT || '10'),
  skipSuccessfulRequests: true, // Don't count successful logins
  message: 'Слишком много попыток входа, попробуйте через 15 минут',
  prefix: 'rl:auth:',
  keyGenerator: (req) => req.ip,
});

/**
 * Rate limiter for registration endpoints
 * Prevents mass account creation
 */
export const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.REGISTER_RATE_LIMIT || '5'),
  message: 'Слишком много попыток регистрации, попробуйте через час',
  prefix: 'rl:register:',
  keyGenerator: (req) => req.ip,
});

/**
 * Rate limiter for password reset endpoints
 * Prevents password reset abuse
 */
export const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.PASSWORD_RESET_RATE_LIMIT || '3'),
  message: 'Слишком много запросов на сброс пароля, попробуйте через час',
  prefix: 'rl:password:',
  keyGenerator: (req) => req.ip,
});

/**
 * Rate limiter for verification code requests
 * Prevents spam of verification codes
 */
export const verificationLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: parseInt(process.env.VERIFICATION_RATE_LIMIT || '5'),
  message: 'Слишком много запросов кода подтверждения, попробуйте через 10 минут',
  prefix: 'rl:verify:',
  keyGenerator: (req) => req.ip,
});

/**
 * Aggressive rate limiter for sensitive operations
 * (e.g., payment processing, data export)
 */
export const sensitiveOperationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.SENSITIVE_OPERATION_LIMIT || '10'),
  message: 'Слишком много запросов на выполнение критических операций',
  prefix: 'rl:sensitive:',
  keyGenerator: getUserKey,
});

/**
 * Burst protection limiter
 * Protects against rapid-fire requests (e.g., script attacks)
 */
export const burstLimiter = createRateLimiter({
  windowMs: 1000, // 1 second
  max: parseInt(process.env.BURST_LIMIT || '5'),
  message: 'Слишком много запросов в секунду, замедлите запросы',
  prefix: 'rl:burst:',
  keyGenerator: getUserKey,
});

/**
 * File upload rate limiter
 * Prevents upload abuse
 */
export const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.UPLOAD_RATE_LIMIT || '20'),
  message: 'Слишком много загрузок файлов, попробуйте через час',
  prefix: 'rl:upload:',
  keyGenerator: getUserKey,
});

/**
 * API endpoint rate limiter
 * Specific limits for different API endpoints
 */
export function createEndpointLimiter(endpoint, options = {}) {
  return createRateLimiter({
    windowMs: options.windowMs || 60 * 60 * 1000, // 1 hour
    max: options.max || 100,
    message: options.message || `Слишком много запросов к ${endpoint}`,
    prefix: `rl:endpoint:${endpoint}:`,
    keyGenerator: getUserKey,
    ...options,
  });
}

/**
 * Cleanup function (no-op since we're using in-memory store)
 */
export function closeRateLimiterRedis() {
  // No Redis to close - using in-memory store
  logger.info('Rate limiter cleanup (in-memory store, no connection to close)');
}

export default {
  apiLimiter,
  tierBasedLimiter,
  authLimiter,
  registerLimiter,
  passwordResetLimiter,
  verificationLimiter,
  sensitiveOperationLimiter,
  burstLimiter,
  uploadLimiter,
  createEndpointLimiter,
  closeRateLimiterRedis,
  RATE_LIMIT_TIERS,
};
