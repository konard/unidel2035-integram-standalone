import rateLimit from 'express-rate-limit'

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Слишком много запросов, попробуйте позже',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
})

/**
 * Strict rate limiter for authentication endpoints
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  skipSuccessfulRequests: true, // Don't count successful logins
  message: {
    success: false,
    error: 'Слишком много попыток входа, попробуйте через 15 минут',
  },
})

/**
 * Rate limiter for registration endpoints
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 registration attempts per hour
  message: {
    success: false,
    error: 'Слишком много попыток регистрации, попробуйте через час',
  },
})

/**
 * Rate limiter for password reset endpoints
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  message: {
    success: false,
    error: 'Слишком много запросов на сброс пароля, попробуйте через час',
  },
})

/**
 * Rate limiter for verification code requests
 */
export const verificationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Limit each IP to 5 verification code requests per 10 minutes
  message: {
    success: false,
    error: 'Слишком много запросов кода подтверждения, попробуйте через 10 минут',
  },
})

export default {
  apiLimiter,
  authLimiter,
  registerLimiter,
  passwordResetLimiter,
  verificationLimiter,
}
