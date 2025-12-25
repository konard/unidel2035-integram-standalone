/**
 * Email Authentication Service
 *
 * This service provides email-based authentication functionality
 * for user registration and verification.
 *
 * Created to resolve missing module error during build (Issue #14)
 */

import axios from 'axios'

const API_BASE_URL = '/api/email-auth'

/**
 * Register a new user with email
 * @param {Object} userData - User registration data
 * @param {string} userData.login - User login/username
 * @param {string} userData.email - User email address
 * @param {string} userData.password - User password
 * @returns {Promise<Object>} Registration response
 */
export async function registerWithEmail(userData) {
  try {
    const response = await axios.post(`${API_BASE_URL}/register`, userData)
    return response.data
  } catch (error) {
    throw error.response?.data || error
  }
}

/**
 * Verify user email with verification code
 * @param {string} code - Verification code from email
 * @returns {Promise<Object>} Verification response
 */
export async function verifyEmail(code) {
  try {
    const response = await axios.post(`${API_BASE_URL}/verify`, { code })
    return response.data
  } catch (error) {
    throw error.response?.data || error
  }
}

/**
 * Resend verification email
 * @param {string} email - User email address
 * @returns {Promise<Object>} Resend response
 */
export async function resendVerification(email) {
  try {
    const response = await axios.post(`${API_BASE_URL}/resend`, { email })
    return response.data
  } catch (error) {
    throw error.response?.data || error
  }
}
