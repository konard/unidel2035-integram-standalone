import logger from '../../utils/logger.js';

/**
 * Request Validation Middleware
 * Issue #77: Input validation and payload size limits
 *
 * Features:
 * - Payload size validation
 * - Content-Type validation
 * - File upload restrictions
 * - Query parameter validation
 * - SQL injection protection (DISABLED - Issue #1847)
 * - XSS protection
 */

/**
 * Configuration for request validation
 */
const VALIDATION_CONFIG = {
  // Payload size limits (in bytes)
  maxJsonSize: parseInt(process.env.MAX_JSON_SIZE || String(10 * 1024 * 1024)), // 10MB default
  maxFormSize: parseInt(process.env.MAX_FORM_SIZE || String(10 * 1024 * 1024)), // 10MB default
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || String(100 * 1024 * 1024)), // 100MB default

  // File upload restrictions
  allowedFileTypes: process.env.ALLOWED_FILE_TYPES
    ? process.env.ALLOWED_FILE_TYPES.split(',')
    : [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'application/json',
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'video/mp4',
        'video/webm',
        'audio/mpeg',
        'audio/wav',
      ],

  maxFilesPerUpload: parseInt(process.env.MAX_FILES_PER_UPLOAD || '10'),

  // Query parameter limits
  maxQueryParams: parseInt(process.env.MAX_QUERY_PARAMS || '50'),
  maxQueryLength: parseInt(process.env.MAX_QUERY_LENGTH || '2000'),
};

/**
 * Patterns for detecting malicious input
 */
const MALICIOUS_PATTERNS = {
  // SQL injection patterns - DISABLED (Issue #1847)
  // These patterns were blocking legitimate data in API requests
  // sqlInjection: [
  //   /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/i,
  //   /(--|\#|\/\*|\*\/)/,
  //   /(\bOR\b\s+\d+\s*=\s*\d+)/i,
  //   /('|\")(\s*)(OR|AND)(\s*)(\d+)(\s*)(=)(\s*)(\d+)/i,
  // ],

  // XSS patterns
  xss: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=\s*["'][^"']*["']/gi,
    /<iframe/gi,
    /<embed/gi,
    /<object/gi,
  ],

  // Path traversal patterns
  pathTraversal: [/\.\.[\/\\]/g, /\.\.%2[fF]/g],

  // Command injection patterns - DISABLED (Issue #1843)
  // These patterns were too strict and blocked legitimate JSON data
  // commandInjection: [/[;&|`$()]/g],
};

/**
 * Sanitize string input
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return input;
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // HTML encode special characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  return sanitized;
}

/**
 * Check if input contains malicious patterns
 */
function containsMaliciousPattern(input, patternType) {
  if (typeof input !== 'string') {
    return false;
  }

  const patterns = MALICIOUS_PATTERNS[patternType] || [];
  return patterns.some((pattern) => pattern.test(input));
}

/**
 * Validate payload size
 */
export const validatePayloadSize = (req, res, next) => {
  const contentLength = parseInt(req.get('content-length') || '0');

  // Check JSON payload size
  if (req.is('application/json') && contentLength > VALIDATION_CONFIG.maxJsonSize) {
    logger.warn(`Rejected oversized JSON payload: ${contentLength} bytes from ${req.ip}`);
    return res.status(413).json({
      success: false,
      error: 'Размер JSON-данных превышает допустимый лимит',
      maxSize: VALIDATION_CONFIG.maxJsonSize,
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  // Check form data size
  if (
    req.is('application/x-www-form-urlencoded') ||
    (req.is('multipart/form-data') && contentLength > VALIDATION_CONFIG.maxFormSize)
  ) {
    logger.warn(`Rejected oversized form data: ${contentLength} bytes from ${req.ip}`);
    return res.status(413).json({
      success: false,
      error: 'Размер данных формы превышает допустимый лимит',
      maxSize: VALIDATION_CONFIG.maxFormSize,
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  next();
};

/**
 * Validate file uploads
 */
export const validateFileUpload = (req, res, next) => {
  if (!req.files && !req.file) {
    return next();
  }

  const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : [req.file];

  // Check number of files
  if (files.length > VALIDATION_CONFIG.maxFilesPerUpload) {
    logger.warn(`Too many files uploaded: ${files.length} from ${req.ip}`);
    return res.status(400).json({
      success: false,
      error: `Можно загрузить максимум ${VALIDATION_CONFIG.maxFilesPerUpload} файлов`,
      code: 'TOO_MANY_FILES',
    });
  }

  // Validate each file
  for (const file of files) {
    // Check file size
    if (file.size > VALIDATION_CONFIG.maxFileSize) {
      logger.warn(`File too large: ${file.size} bytes, name: ${file.originalname} from ${req.ip}`);
      return res.status(413).json({
        success: false,
        error: `Файл "${file.originalname}" превышает максимальный размер ${VALIDATION_CONFIG.maxFileSize} байт`,
        code: 'FILE_TOO_LARGE',
      });
    }

    // Check file type
    if (!VALIDATION_CONFIG.allowedFileTypes.includes(file.mimetype)) {
      logger.warn(`Invalid file type: ${file.mimetype}, name: ${file.originalname} from ${req.ip}`);
      return res.status(400).json({
        success: false,
        error: `Тип файла "${file.mimetype}" не разрешен`,
        allowedTypes: VALIDATION_CONFIG.allowedFileTypes,
        code: 'INVALID_FILE_TYPE',
      });
    }

    // Check for path traversal in filename
    if (containsMaliciousPattern(file.originalname, 'pathTraversal')) {
      logger.error(`Path traversal attempt in filename: ${file.originalname} from ${req.ip}`);
      return res.status(400).json({
        success: false,
        error: 'Недопустимое имя файла',
        code: 'INVALID_FILENAME',
      });
    }
  }

  next();
};

/**
 * Validate query parameters
 */
export const validateQueryParams = (req, res, next) => {
  const queryParams = Object.keys(req.query);

  // Check number of query parameters
  if (queryParams.length > VALIDATION_CONFIG.maxQueryParams) {
    logger.warn(`Too many query parameters: ${queryParams.length} from ${req.ip}`);
    return res.status(400).json({
      success: false,
      error: `Слишком много параметров запроса (максимум ${VALIDATION_CONFIG.maxQueryParams})`,
      code: 'TOO_MANY_QUERY_PARAMS',
    });
  }

  // Check total query string length
  const queryString = req.originalUrl.split('?')[1] || '';
  if (queryString.length > VALIDATION_CONFIG.maxQueryLength) {
    logger.warn(`Query string too long: ${queryString.length} chars from ${req.ip}`);
    return res.status(400).json({
      success: false,
      error: `Строка запроса слишком длинная (максимум ${VALIDATION_CONFIG.maxQueryLength} символов)`,
      code: 'QUERY_TOO_LONG',
    });
  }

  // Check for malicious patterns in query parameters
  for (const [key, value] of Object.entries(req.query)) {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

    // SQL injection check - DISABLED (Issue #1847)
    // if (containsMaliciousPattern(stringValue, 'sqlInjection')) {
    //   logger.error(`SQL injection attempt in query: ${key}=${stringValue} from ${req.ip}`);
    //   return res.status(400).json({
    //     success: false,
    //     error: 'Обнаружена подозрительная активность',
    //     code: 'MALICIOUS_INPUT',
    //   });
    // }

    if (containsMaliciousPattern(stringValue, 'xss')) {
      logger.error(`XSS attempt in query: ${key}=${stringValue} from ${req.ip}`);
      return res.status(400).json({
        success: false,
        error: 'Обнаружена подозрительная активность',
        code: 'MALICIOUS_INPUT',
      });
    }

    if (containsMaliciousPattern(stringValue, 'pathTraversal')) {
      logger.error(`Path traversal attempt in query: ${key}=${stringValue} from ${req.ip}`);
      return res.status(400).json({
        success: false,
        error: 'Обнаружена подозрительная активность',
        code: 'MALICIOUS_INPUT',
      });
    }
  }

  next();
};

/**
 * Validate request body for malicious input
 */
export const validateRequestBody = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object') {
    return next();
  }

  // Skip XSS validation for AI endpoints that need to process code/documentation
  // Issue #5053: RAG chat sends knowledge base content that may contain HTML/code examples
  const XSS_WHITELIST_PATHS = [
    '/api/ai-tokens/chat',
    '/api/ai-tokens/completions',
  ];

  // Use originalUrl to get full path including prefix (e.g., /api/ai-tokens/chat)
  // req.path might be relative to router mount point
  // Remove query string if present (e.g., /api/foo?bar=1 -> /api/foo)
  const fullUrl = req.originalUrl || req.url || req.path;
  const requestPath = fullUrl.split('?')[0];
  const skipXssValidation = XSS_WHITELIST_PATHS.some(path => requestPath.startsWith(path));

  const checkObject = (obj, path = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === 'string') {
        // Check for SQL injection - DISABLED (Issue #1847)
        // This check was blocking legitimate data in API requests
        // if (containsMaliciousPattern(value, 'sqlInjection')) {
        //   logger.error(`SQL injection attempt in body: ${currentPath}=${value} from ${req.ip}`);
        //   return { valid: false, code: 'SQL_INJECTION_DETECTED' };
        // }

        // Check for XSS (skip for whitelisted AI endpoints)
        if (!skipXssValidation && containsMaliciousPattern(value, 'xss')) {
          logger.error(`XSS attempt in body: ${currentPath}=${value} from ${req.ip}`);
          return { valid: false, code: 'XSS_DETECTED' };
        }

        // Check for command injection - DISABLED (Issue #1843)
        // This check was too strict and blocked legitimate JSON data
        // if (containsMaliciousPattern(value, 'commandInjection')) {
        //   logger.error(`Command injection attempt in body: ${currentPath}=${value} from ${req.ip}`);
        //   return { valid: false, code: 'COMMAND_INJECTION_DETECTED' };
        // }
      } else if (typeof value === 'object' && value !== null) {
        const result = checkObject(value, currentPath);
        if (!result.valid) {
          return result;
        }
      }
    }

    return { valid: true };
  };

  const validationResult = checkObject(req.body);

  if (!validationResult.valid) {
    return res.status(400).json({
      success: false,
      error: 'Обнаружена подозрительная активность в данных запроса',
      code: validationResult.code,
    });
  }

  next();
};

/**
 * Sanitize request body (use with caution - may break legitimate data)
 */
export const sanitizeRequestBody = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object') {
    return next();
  }

  const sanitizeObject = (obj) => {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeInput(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = Array.isArray(value) ? value.map((v) => (typeof v === 'object' ? sanitizeObject(v) : v)) : sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };

  req.body = sanitizeObject(req.body);
  next();
};

/**
 * Validate Content-Type header
 */
export const validateContentType = (allowedTypes) => {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return next();
    }

    const contentType = req.get('content-type');
    if (!contentType) {
      return res.status(400).json({
        success: false,
        error: 'Заголовок Content-Type обязателен',
        code: 'MISSING_CONTENT_TYPE',
      });
    }

    const matches = allowedTypes.some((type) => contentType.includes(type));
    if (!matches) {
      return res.status(415).json({
        success: false,
        error: 'Неподдерживаемый тип контента',
        allowedTypes,
        code: 'UNSUPPORTED_MEDIA_TYPE',
      });
    }

    next();
  };
};

export default {
  validatePayloadSize,
  validateFileUpload,
  validateQueryParams,
  validateRequestBody,
  sanitizeRequestBody,
  validateContentType,
  VALIDATION_CONFIG,
};
