/**
 * Email Authentication Service
 *
 * Provides email-based authentication functionality including:
 * - User registration with email verification
 * - Email verification via token
 * - Resending verification emails
 */

import axios from 'axios';

const API_BASE_URL = '/api/auth';

/**
 * Register a new user with email
 * @param {Object} data - Registration data
 * @param {string} data.email - User's email address
 * @param {string} data.password - User's password
 * @param {string} [data.username] - Optional username
 * @param {string} [data.referralCode] - Optional referral code
 * @returns {Promise<Object>} Registration result
 */
export async function registerWithEmail({ email, password, username, referralCode }) {
  try {
    const response = await axios.post(`${API_BASE_URL}/register/email`, {
      email,
      password,
      username,
      referralCode
    });

    return response.data;
  } catch (error) {
    console.error('Email registration error:', error);
    throw new Error(
      error.response?.data?.message ||
      error.response?.data?.error ||
      'Failed to register with email'
    );
  }
}

/**
 * Verify email address using verification token
 * @param {string} token - Verification token from email
 * @returns {Promise<Object>} Verification result with user data
 */
export async function verifyEmail(token) {
  try {
    const response = await axios.post(`${API_BASE_URL}/verify-email`, {
      token
    });

    return response.data;
  } catch (error) {
    console.error('Email verification error:', error);
    throw new Error(
      error.response?.data?.message ||
      error.response?.data?.error ||
      'Failed to verify email'
    );
  }
}

/**
 * Resend verification email
 * @param {Object} data - User credentials
 * @param {string} data.email - User's email address
 * @param {string} data.password - User's password
 * @param {string} [data.username] - Optional username
 * @returns {Promise<Object>} Result of resend operation
 */
export async function resendVerification({ email, password, username }) {
  try {
    const response = await axios.post(`${API_BASE_URL}/resend-verification`, {
      email,
      password,
      username
    });

    return response.data;
  } catch (error) {
    console.error('Resend verification error:', error);
    throw new Error(
      error.response?.data?.message ||
      error.response?.data?.error ||
      'Failed to resend verification email'
    );
  }
}

export default {
  registerWithEmail,
  verifyEmail,
  resendVerification
};
