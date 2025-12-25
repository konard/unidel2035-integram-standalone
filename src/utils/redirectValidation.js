/**
 * Redirect URL Validation Utility
 * Issue #3786 - Prevent open redirect and XSS vulnerabilities
 *
 * This utility validates redirect URLs to ensure they are safe internal routes
 * and not external URLs or malicious JavaScript URLs.
 */

/**
 * Check if a redirect URL is valid and safe to use
 *
 * A valid redirect URL must:
 * - Be a string
 * - Start with '/' (internal route)
 * - Not start with '//' (protocol-relative URL)
 * - Not contain ':' (to block protocols like http:, javascript:, data:)
 *
 * @param {string} url - The URL to validate
 * @returns {boolean} True if the URL is safe to redirect to
 *
 * @example
 * isValidRedirectUrl('/dashboard') // true
 * isValidRedirectUrl('/editor/123') // true
 * isValidRedirectUrl('https://evil.com') // false
 * isValidRedirectUrl('//evil.com') // false
 * isValidRedirectUrl('javascript:alert(1)') // false
 */
export function isValidRedirectUrl(url) {
  // Reject null, undefined, or non-string values
  if (!url || typeof url !== 'string') {
    return false
  }

  // Must start with '/' for internal routes
  if (!url.startsWith('/')) {
    return false
  }

  // Reject protocol-relative URLs (//example.com)
  if (url.startsWith('//')) {
    return false
  }

  // Reject any URL with a protocol (http:, https:, javascript:, data:, etc.)
  if (url.includes(':')) {
    return false
  }

  return true
}

/**
 * Get a safe redirect URL from a query parameter
 *
 * If the redirect URL is valid, return it.
 * Otherwise, return the default URL.
 *
 * @param {string} redirectParam - The redirect parameter from route.query.redirect
 * @param {string} defaultUrl - The default URL to use if redirect is invalid
 * @returns {string} A safe URL to redirect to
 *
 * @example
 * getSafeRedirectUrl('/editor/123', '/dash') // '/editor/123'
 * getSafeRedirectUrl('https://evil.com', '/dash') // '/dash'
 * getSafeRedirectUrl(null, '/dash') // '/dash'
 */
export function getSafeRedirectUrl(redirectParam, defaultUrl = '/dash') {
  if (isValidRedirectUrl(redirectParam)) {
    return redirectParam
  }
  return defaultUrl
}
