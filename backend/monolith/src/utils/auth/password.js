import bcrypt from 'bcrypt'

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10')

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password) {
  return await bcrypt.hash(password, BCRYPT_ROUNDS)
}

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Bcrypt hash to compare against
 * @returns {Promise<boolean>} True if password matches
 */
export async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash)
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} {isValid: boolean, errors: string[]}
 */
export function validatePasswordStrength(password) {
  const errors = []

  if (!password || password.length < 8) {
    errors.push('Пароль должен содержать минимум 8 символов')
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Пароль должен содержать хотя бы одну строчную букву')
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Пароль должен содержать хотя бы одну заглавную букву')
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Пароль должен содержать хотя бы одну цифру')
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Пароль должен содержать хотя бы один специальный символ')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Generate random password
 * @param {number} length - Password length (default 12)
 * @returns {string} Random password
 */
export function generateRandomPassword(length = 12) {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const numbers = '0123456789'
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?'
  const all = lowercase + uppercase + numbers + symbols

  let password = ''

  // Ensure at least one character from each category
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += symbols[Math.floor(Math.random() * symbols.length)]

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)]
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

export default {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  generateRandomPassword,
}
