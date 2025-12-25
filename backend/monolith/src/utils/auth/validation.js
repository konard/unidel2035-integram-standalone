/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate phone number format (international format)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid phone format
 */
export function isValidPhone(phone) {
  // Accepts formats: +79991234567, +7 (999) 123-45-67, 89991234567, etc.
  const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''))
}

/**
 * Normalize phone number to international format
 * @param {string} phone - Phone number to normalize
 * @returns {string} Normalized phone number
 */
export function normalizePhone(phone) {
  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, '')

  // If starts with 8 (Russian format), replace with +7
  if (normalized.startsWith('8')) {
    normalized = '+7' + normalized.substring(1)
  }

  // If doesn't start with +, add +
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized
  }

  return normalized
}

/**
 * Validate username format
 * @param {string} username - Username to validate
 * @returns {Object} {isValid: boolean, error: string}
 */
export function validateUsername(username) {
  if (!username || username.length < 3) {
    return {
      isValid: false,
      error: 'Имя пользователя должно содержать минимум 3 символа',
    }
  }

  if (username.length > 50) {
    return {
      isValid: false,
      error: 'Имя пользователя не может быть длиннее 50 символов',
    }
  }

  // Allow only alphanumeric, underscore, and hyphen
  const usernameRegex = /^[a-zA-Z0-9_-]+$/
  if (!usernameRegex.test(username)) {
    return {
      isValid: false,
      error: 'Имя пользователя может содержать только буквы, цифры, дефис и подчеркивание',
    }
  }

  return { isValid: true }
}

/**
 * Generate verification code (6-digit)
 * @returns {string} 6-digit verification code
 */
export function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/**
 * Sanitize user input (remove potentially dangerous characters)
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return input
  }

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and > to prevent XSS
    .substring(0, 1000) // Limit length
}

/**
 * Check if string is empty or whitespace only
 * @param {string} str - String to check
 * @returns {boolean} True if empty or whitespace
 */
export function isEmpty(str) {
  return !str || str.trim().length === 0
}

/**
 * Validate OAuth state parameter (CSRF protection)
 * @param {string} state - State parameter to validate
 * @returns {boolean} True if valid state format
 */
export function isValidOAuthState(state) {
  // State should be a secure random string (at least 16 chars)
  return state && state.length >= 16 && /^[a-zA-Z0-9_-]+$/.test(state)
}

export default {
  isValidEmail,
  isValidPhone,
  normalizePhone,
  validateUsername,
  generateVerificationCode,
  sanitizeInput,
  isEmpty,
  isValidOAuthState,
}
