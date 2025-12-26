import helmet from 'helmet';

/**
 * Security Headers Middleware
 * Issue #77: Comprehensive security headers for production
 * Issue #66: Strengthen CSP by removing unsafe-inline and unsafe-eval
 *
 * Implements:
 * - X-Frame-Options (clickjacking protection)
 * - X-Content-Type-Options (MIME sniffing protection)
 * - X-XSS-Protection (XSS protection for older browsers)
 * - Content-Security-Policy (CSP) with environment-specific directives
 * - Strict-Transport-Security (HSTS)
 * - Referrer-Policy
 * - Permissions-Policy
 *
 * Security Improvements:
 * - Production: No unsafe-inline, no unsafe-eval (uses nonces instead)
 * - Development: unsafe-eval allowed for Vue dev tools, nonces for inline scripts
 * - Nonce-based CSP for inline scripts and styles (Issue #66)
 */

/**
 * Check if running in development mode
 */
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Configure Content Security Policy
 * Uses nonces for inline scripts/styles to eliminate need for unsafe-inline
 * Only allows unsafe-eval in development for Vue dev tools
 */
const contentSecurityPolicy = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      // Issue #66: Use nonces instead of unsafe-inline
      // The nonce will be injected dynamically per request
      (req, res) => `'nonce-${res.locals.cspNonce}'`,
      // Issue #66: Only allow unsafe-eval in development for Vue dev tools
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
      'https://www.google.com',
      'https://www.gstatic.com',
      'https://cdn.jsdelivr.net',
      'https://static.cloudflareinsights.com',
    ],
    styleSrc: [
      "'self'",
      // Issue #66: Use nonces instead of unsafe-inline where possible
      (req, res) => `'nonce-${res.locals.cspNonce}'`,
      // Note: Some frameworks may still require unsafe-inline for dynamic styles
      // Consider removing this if your application doesn't need it
      "'unsafe-inline'", // May be needed for some CSS-in-JS frameworks
      'https://fonts.googleapis.com',
    ],
    fontSrc: [
      "'self'",
      'https://fonts.gstatic.com',
      'data:',
    ],
    imgSrc: [
      "'self'",
      'data:',
      'blob:',
      'https:', // Allow images from any HTTPS source
    ],
    connectSrc: [
      "'self'",
      'https://api.openai.com',
      'https://api.deepseek.com',
      'https://api.github.com',
      'https://api.iconify.design',
      'https://api.simplesvg.com',
      'https://api.unisvg.com',
      'wss://*.drondoc.ru',
      'https://*.drondoc.ru',
      'ws://localhost:*', // Development only
    ],
    frameSrc: [
      "'self'",
      'https://www.google.com', // reCAPTCHA
    ],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'", 'blob:', 'data:'],
    workerSrc: ["'self'", 'blob:'],
    upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
  },
};

/**
 * Configure Helmet with comprehensive security settings
 */
export const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: process.env.DISABLE_CSP === 'true' ? false : contentSecurityPolicy,

  // HTTP Strict Transport Security (HSTS)
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // X-Frame-Options (clickjacking protection)
  frameguard: {
    action: 'deny', // Prevent embedding in iframes
  },

  // X-Content-Type-Options (MIME sniffing protection)
  noSniff: true,

  // X-XSS-Protection (for older browsers)
  xssFilter: true,

  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },

  // Remove X-Powered-By header
  hidePoweredBy: true,

  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false,
  },

  // Download Options (IE8+)
  ieNoOpen: true,

  // Permissions Policy (formerly Feature Policy)
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },
});

/**
 * Additional security headers middleware
 * Issue #1915: Relaxed Cross-Origin policies for API endpoints to allow CORS
 */
export const additionalSecurityHeaders = (req, res, next) => {
  // Permissions-Policy (Feature Policy replacement)
  res.setHeader(
    'Permissions-Policy',
    [
      'camera=(self)',
      'microphone=(self)',
      'geolocation=(self)',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
    ].join(', ')
  );

  // Cross-Origin policies
  // Issue #1915: Use 'same-origin-allow-popups' instead of 'same-origin' to allow cross-origin API calls
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  // Issue #1915: Use 'cross-origin' for API endpoints to allow CORS requests
  // Only use 'same-origin' for non-API routes
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  } else {
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  }

  // Issue #1915: Remove Cross-Origin-Embedder-Policy for API routes
  // This header is too restrictive and blocks CORS requests even when properly configured
  if (!req.path.startsWith('/api/')) {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  // Expect-CT (Certificate Transparency)
  res.setHeader('Expect-CT', 'max-age=86400, enforce');

  next();
};

/**
 * CORS security configuration
 * Issue #1890: Ensure CORS headers are set for all responses including errors
 */
export const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Allowed origins
    const allowedOrigins = [
      'https://drondoc.ru',
      'https://www.drondoc.ru',
      'https://dev.example.integram.io',
      'https://proxy.drondoc.ru', // Production proxy (Issue #5170)
      'http://dev.example.integram.io:5174', // Dev server via SSH tunnel
      'http://173.249.2.184:5174', // Production server (Issue #34)
      'http://localhost:5174', // Vite dev server
      'http://localhost:5173', // Legacy dev server
      'http://localhost:3000',
      'http://localhost:8081',
    ];

    // Add custom origins from environment
    if (process.env.ALLOWED_ORIGINS) {
      allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(','));
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'], // Added HEAD method (Issue #1890)
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Authorization',      // AI tokens API (Issue #1823)
    'X-YouTube-Token',      // YouTube API (Issue #1823)
    'X-Integram-Token',     // Integram API (torgi-parser)
    'X-Integram-XSRF',      // Integram XSRF token (torgi-parser)
  ],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
  maxAge: 600, // 10 minutes
  preflightContinue: false, // Pass preflight response to next handler
  optionsSuccessStatus: 204, // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

/**
 * Middleware to ensure CORS headers are set on all responses, including errors
 * Issue #1890: Fix missing CORS headers on 500 error responses
 */
export const ensureCorsHeaders = (req, res, next) => {
  const origin = req.headers.origin;

  // List of allowed origins (same as corsOptions)
  const allowedOrigins = [
    'https://drondoc.ru',
    'https://www.drondoc.ru',
    'https://dev.example.integram.io',
    'https://proxy.drondoc.ru', // Production proxy (Issue #5170)
    'http://dev.example.integram.io:5174', // Dev server via SSH tunnel
    'http://173.249.2.184:5174', // Production server (Issue #34)
    'http://localhost:5174', // Vite dev server
    'http://localhost:5173', // Legacy dev server
    'http://localhost:3000',
    'http://localhost:8081',
  ];

  // Add custom origins from environment
  if (process.env.ALLOWED_ORIGINS) {
    allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(','));
  }

  // If origin is allowed or not present, set CORS headers
  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Authorization, X-YouTube-Token, X-Integram-Token, X-Integram-XSRF');
    res.setHeader('Access-Control-Expose-Headers', 'RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
};

/**
 * Security headers for development environment
 */
export const developmentSecurityHeaders = (req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    // Relaxed CSP for development
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' *; connect-src 'self' ws: wss: *"
    );
  }
  next();
};

export default {
  securityHeaders,
  additionalSecurityHeaders,
  corsOptions,
  ensureCorsHeaders,
  developmentSecurityHeaders,
};
