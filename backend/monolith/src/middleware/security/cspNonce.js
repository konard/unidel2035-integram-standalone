import crypto from 'crypto';

/**
 * CSP Nonce Middleware
 * Issue #66: Generate unique nonces for inline scripts and styles
 *
 * Generates a cryptographically secure nonce for each request
 * to allow specific inline scripts/styles while blocking others.
 * This replaces the need for 'unsafe-inline' in CSP.
 */

/**
 * Generate a CSP nonce for the current request
 * Stores the nonce in res.locals for use in templates and CSP headers
 */
export const generateCspNonce = (req, res, next) => {
  // Generate a cryptographically secure random nonce
  // Using 16 bytes (128 bits) of randomness, encoded as base64
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
};

/**
 * Get the CSP nonce for the current request
 * Helper function for use in route handlers
 */
export const getCspNonce = (res) => {
  return res.locals.cspNonce || '';
};

export default {
  generateCspNonce,
  getCspNonce,
};
