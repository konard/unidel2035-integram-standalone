/**
 * Email Authentication Service
 * Handles email-based user registration and verification
 */

import axios from 'axios'

const API_BASE_URL = '/api/auth'

/**
 * Register a new user with email
 * @param {Object} userData - User registration data
 * @param {string} userData.login - User login/username
 * @param {string} userData.email - User email address
 * @param {string} userData.password - User password
 * @param {string} [userData.referralCode] - Optional referral code
 * @returns {Promise<Object>} Registration response
 */
export async function registerWithEmail(userData) {
  try {
    const response = await axios.post(`${API_BASE_URL}/register/email`, userData)
    return response.data
  } catch (error) {
    throw error.response?.data || error
  }
}

/**
 * Verify email address with verification code
 * @param {Object} verifyData - Verification data
 * @param {string} verifyData.email - User email address
 * @param {string} verifyData.code - Verification code
 * @returns {Promise<Object>} Verification response
 */
export async function verifyEmail(verifyData) {
  try {
    const response = await axios.post(`${API_BASE_URL}/verify/email`, verifyData)
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
    const response = await axios.post(`${API_BASE_URL}/verify/resend`, { email })
    return response.data
  } catch (error) {
    throw error.response?.data || error
  }
}
