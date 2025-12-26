/**
 * Request Logger Middleware
 *
 * Logs incoming HTTP requests without exposing sensitive information
 * Security Issue #67: Ensures logging doesn't leak sensitive data
 *
 * @module requestLogger
 */

import logger from '../../utils/logger.js';

/**
 * Headers to redact from logs (contain sensitive information)
 */
const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'x-auth-token',
  'x-api-key',
  'x-csrf-token',
  'x-xsrf-token'
];

/**
 * Query parameters to redact from logs
 */
const SENSITIVE_QUERY_PARAMS = [
  'token',
  'password',
  'pwd',
  'secret',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token'
];

/**
 * Redact sensitive information from object
 *
 * @param {Object} obj - Object to redact
 * @param {string[]} sensitiveKeys - Keys to redact
 * @returns {Object} Redacted object
 */
function redactSensitiveData(obj, sensitiveKeys) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const redacted = { ...obj };

  sensitiveKeys.forEach(key => {
    const lowerKey = key.toLowerCase();
    Object.keys(redacted).forEach(objKey => {
      if (objKey.toLowerCase() === lowerKey) {
        redacted[objKey] = '[REDACTED]';
      }
    });
  });

  return redacted;
}

/**
 * Request logger middleware
 * Logs HTTP requests with sanitized information
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function requestLogger(req, res, next) {
  const start = Date.now();

  // Capture response finish event
  res.on('finish', () => {
    const duration = Date.now() - start;

    const logData = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id
    };

    // Add query params if present (redacted)
    if (Object.keys(req.query).length > 0) {
      logData.query = redactSensitiveData(req.query, SENSITIVE_QUERY_PARAMS);
    }

    // Log at appropriate level based on status code
    if (res.statusCode >= 500) {
      logger.error(logData, 'HTTP request completed with server error');
    } else if (res.statusCode >= 400) {
      logger.warn(logData, 'HTTP request completed with client error');
    } else {
      logger.info(logData, 'HTTP request completed');
    }
  });

  next();
}

export default requestLogger;
