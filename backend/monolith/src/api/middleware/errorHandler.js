/**
 * Centralized Error Handler Middleware
 *
 * Security Issue #67: Prevents information disclosure through error messages
 * CWE-209: Generation of Error Message Containing Sensitive Information
 *
 * This middleware:
 * - Logs full error details server-side for debugging
 * - Returns sanitized error messages to clients
 * - Includes stack traces only in development mode
 * - Filters sensitive information from error responses
 *
 * @module errorHandler
 */

import logger from '../../utils/logger.js';

/**
 * Map of safe error messages for common error types
 * These messages don't reveal internal implementation details
 */
const SAFE_ERROR_MESSAGES = {
  // Authentication & Authorization
  'EAUTH': 'Ошибка аутентификации',
  'EACCESS': 'Доступ запрещен',
  'ETOKEN': 'Недействительный токен',

  // Validation errors
  'EVALID': 'Ошибка валидации данных',
  'EINPUT': 'Некорректные входные данные',

  // Database errors
  'EQUERY': 'Ошибка обработки запроса',
  'ECONNECT': 'Ошибка подключения к базе данных',
  'EDUPLICATE': 'Запись уже существует',

  // File system errors
  'ENOENT': 'Ресурс не найден',
  'EACCES': 'Доступ запрещен',
  'EPERM': 'Операция не разрешена',

  // Network errors
  'ETIMEDOUT': 'Превышено время ожидания',
  'ECONNREFUSED': 'Невозможно установить соединение',
  'ENETWORK': 'Ошибка сети',

  // Generic errors
  'EINTERNAL': 'Внутренняя ошибка сервера',
  'ENOTFOUND': 'Не найдено',
  'ECONFLICT': 'Конфликт данных'
};

/**
 * Patterns to detect and sanitize from error messages
 * These patterns might leak sensitive information
 */
const SENSITIVE_PATTERNS = [
  // File paths
  /\/var\/[^\s]+/gi,
  /\/home\/[^\s]+/gi,
  /\/tmp\/[^\s]+/gi,
  /\/etc\/[^\s]+/gi,
  /[A-Z]:\\[^\s]+/gi,

  // Database connection strings
  /postgresql:\/\/[^\s]+/gi,
  /mysql:\/\/[^\s]+/gi,
  /mongodb:\/\/[^\s]+/gi,

  // IP addresses (internal)
  /\b(?:10|172\.(?:1[6-9]|2[0-9]|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/g,

  // Tokens and keys
  /['\"]?(?:token|key|secret|password|pwd)['\"]?\s*[:=]\s*['\"]\w+['\"]?/gi,

  // Email addresses in errors
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // SQL table/column names in error messages
  /(?:table|column|field)\s+[`'"]?\w+[`'"]?/gi
];

/**
 * Sanitize error message to remove sensitive information
 *
 * @param {string} message - Original error message
 * @returns {string} Sanitized error message
 */
function sanitizeErrorMessage(message) {
  if (!message || typeof message !== 'string') {
    return 'Внутренняя ошибка сервера';
  }

  let sanitized = message;

  // Replace sensitive patterns with generic placeholders
  SENSITIVE_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });

  // If message still contains paths or looks like internal error, use generic message
  if (sanitized.includes('/') || sanitized.includes('\\') || sanitized.length > 200) {
    return 'Внутренняя ошибка сервера';
  }

  return sanitized;
}

/**
 * Get safe error message based on error code or type
 *
 * @param {Error} error - Error object
 * @returns {string} Safe error message
 */
function getSafeErrorMessage(error) {
  // Check if error has a specific code
  if (error.code && SAFE_ERROR_MESSAGES[error.code]) {
    return SAFE_ERROR_MESSAGES[error.code];
  }

  // Check for common error types
  if (error.name === 'ValidationError') {
    return SAFE_ERROR_MESSAGES.EVALID;
  }
  if (error.name === 'UnauthorizedError' || error.name === 'AuthenticationError') {
    return SAFE_ERROR_MESSAGES.EAUTH;
  }
  if (error.name === 'ForbiddenError' || error.name === 'AuthorizationError') {
    return SAFE_ERROR_MESSAGES.EACCESS;
  }
  if (error.name === 'NotFoundError') {
    return SAFE_ERROR_MESSAGES.ENOTFOUND;
  }
  if (error.name === 'ConflictError') {
    return SAFE_ERROR_MESSAGES.ECONFLICT;
  }

  // Database errors
  if (error.name === 'SequelizeUniqueConstraintError' || error.code === '23505') {
    return SAFE_ERROR_MESSAGES.EDUPLICATE;
  }
  if (error.name?.includes('Database') || error.name?.includes('Sequelize')) {
    return SAFE_ERROR_MESSAGES.EQUERY;
  }

  // Network errors
  if (error.code === 'ETIMEDOUT') {
    return SAFE_ERROR_MESSAGES.ETIMEDOUT;
  }
  if (error.code === 'ECONNREFUSED') {
    return SAFE_ERROR_MESSAGES.ECONNREFUSED;
  }

  // File system errors
  if (error.code === 'ENOENT') {
    return SAFE_ERROR_MESSAGES.ENOENT;
  }
  if (error.code === 'EACCES' || error.code === 'EPERM') {
    return SAFE_ERROR_MESSAGES.EACCES;
  }

  // Default to sanitized message
  return sanitizeErrorMessage(error.message);
}

/**
 * Determine HTTP status code from error
 *
 * @param {Error} error - Error object
 * @returns {number} HTTP status code
 */
function getStatusCode(error) {
  // If error has explicit status
  if (error.status) {
    return error.status;
  }
  if (error.statusCode) {
    return error.statusCode;
  }

  // Determine status from error type
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return 400; // Bad Request
  }
  if (error.name === 'UnauthorizedError' || error.name === 'AuthenticationError') {
    return 401; // Unauthorized
  }
  if (error.name === 'ForbiddenError' || error.name === 'AuthorizationError') {
    return 403; // Forbidden
  }
  if (error.name === 'NotFoundError' || error.code === 'ENOENT') {
    return 404; // Not Found
  }
  if (error.name === 'ConflictError' || error.name === 'SequelizeUniqueConstraintError') {
    return 409; // Conflict
  }
  if (error.name === 'TooManyRequestsError') {
    return 429; // Too Many Requests
  }

  // Default to 500 Internal Server Error
  return 500;
}

/**
 * Log error with appropriate detail level
 *
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 */
function logError(error, req) {
  const errorInfo = {
    message: error.message,
    name: error.name,
    code: error.code,
    status: getStatusCode(error),
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  };

  // In development, include stack trace
  if (process.env.NODE_ENV === 'development') {
    errorInfo.stack = error.stack;
  }

  // Log at appropriate level based on status code
  const status = getStatusCode(error);
  if (status >= 500) {
    logger.error(errorInfo, 'Server error occurred');
  } else if (status >= 400) {
    logger.warn(errorInfo, 'Client error occurred');
  } else {
    logger.info(errorInfo, 'Request error occurred');
  }
}

/**
 * Centralized error handler middleware
 *
 * This must be registered AFTER all routes in Express
 *
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function errorHandler(err, req, res, next) {
  // If response already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Log the full error server-side
  logError(err, req);

  // Determine status code
  const status = getStatusCode(err);

  // Prepare response based on environment
  const isDevelopment = process.env.NODE_ENV === 'development';

  const errorResponse = {
    success: false,
    error: getSafeErrorMessage(err)
  };

  // In development, include additional debug information
  if (isDevelopment) {
    errorResponse.debug = {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack?.split('\n').slice(0, 5) // Limit stack trace lines
    };
  }

  // Send error response
  res.status(status).json(errorResponse);
}

/**
 * Async handler wrapper to catch promise rejections
 * Use this to wrap async route handlers
 *
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function that catches errors
 *
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await getUsersFromDB();
 *   res.json(users);
 * }));
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create custom error with specific properties
 *
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @param {string} code - Error code
 * @returns {Error} Custom error object
 */
export function createError(message, status = 500, code = 'EINTERNAL') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export default errorHandler;
