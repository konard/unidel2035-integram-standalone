import axios from 'axios'

const AUTH_API_URL = '/api/auth'

/**
 * Register a new user with email
 * @param {Object} params - Registration parameters
 * @param {string} params.email - User email
 * @param {string} params.password - User password
 * @param {string} [params.username] - Username
 * @param {string} [params.displayName] - Display name
 * @param {string} [params.referralCode] - Referral code
 * @returns {Promise<Object>} - Registration result
 */
export async function registerWithEmail({ email, password, username, displayName, referralCode }) {
  try {
    const response = await axios.post(`${AUTH_API_URL}/register/email`, {
      email,
      password,
      username,
      displayName,
      referralCode
    })

    if (response.data.success) {
      return response.data
    } else {
      throw new Error(response.data.message || 'Ошибка регистрации')
    }
  } catch (error) {
    if (error.response?.data?.message) {
      throw new Error(error.response.data.message)
    }
    throw new Error(error.message || 'Ошибка регистрации')
  }
}

/**
 * Resend verification email
 * @param {Object} params - Resend parameters
 * @param {string} params.email - User email
 * @param {string} params.password - User password
 * @returns {Promise<Object>} - Resend result
 */
export async function resendVerification({ email, password }) {
  try {
    const response = await axios.post(`${AUTH_API_URL}/resend-verification`, {
      email,
      password
    })

    if (response.data.success) {
      return response.data
    } else {
      throw new Error(response.data.message || 'Ошибка отправки письма')
    }
  } catch (error) {
    if (error.response?.data?.message) {
      throw new Error(error.response.data.message)
    }
    throw new Error(error.message || 'Ошибка отправки письма')
  }
}
