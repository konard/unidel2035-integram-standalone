/**
 * Unified Auth Service
 * Client-side service for unified authentication
 *
 * This service provides a wrapper around the backend unified auth API
 */

import axios from 'axios'

class UnifiedAuthService {
  constructor() {
    this.sessionId = null
    this.api = axios.create({
      baseURL: '/api/unified-auth',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    // Try to restore session from localStorage
    this.tryRestoreSession()
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.sessionId
  }

  /**
   * Get current session
   */
  async getSession() {
    if (!this.sessionId) return null

    try {
      const response = await this.api.get(`/session/${this.sessionId}`)
      return response.data
    } catch (error) {
      console.error('Failed to get session:', error)
      return null
    }
  }

  /**
   * Get all tokens for the current session
   */
  async getAllTokens() {
    if (!this.sessionId) return {}

    try {
      const response = await this.api.get(`/session/${this.sessionId}/tokens`)
      return response.data.tokens || {}
    } catch (error) {
      console.error('Failed to get all tokens:', error)
      return {}
    }
  }

  /**
   * Get token for a specific database
   */
  async getTokenForDatabase(database) {
    if (!this.sessionId) return null

    try {
      const response = await this.api.get(`/session/${this.sessionId}/database/${database}`)
      return response.data
    } catch (error) {
      console.error(`Failed to get token for database ${database}:`, error)
      return null
    }
  }

  /**
   * Get available databases for the current session
   */
  async getAvailableDatabases() {
    if (!this.sessionId) return []

    try {
      const tokens = await this.getAllTokens()
      return Object.keys(tokens)
    } catch (error) {
      console.error('Failed to get available databases:', error)
      return []
    }
  }

  /**
   * Logout from unified session
   */
  async logout() {
    if (!this.sessionId) return

    try {
      await this.api.post(`/session/${this.sessionId}/logout`)
    } catch (error) {
      console.error('Failed to logout:', error)
    } finally {
      this.sessionId = null
      this.clearSession()
    }
  }

  /**
   * Try to restore session from localStorage
   */
  tryRestoreSession() {
    const sessionId = localStorage.getItem('unified_session_id')
    if (sessionId) {
      this.sessionId = sessionId
    }
  }

  /**
   * Save session to localStorage
   */
  saveSession() {
    if (this.sessionId) {
      localStorage.setItem('unified_session_id', this.sessionId)
    }
  }

  /**
   * Clear session from localStorage
   */
  clearSession() {
    localStorage.removeItem('unified_session_id')
  }
}

// Create singleton instance
export const unifiedAuthService = new UnifiedAuthService()

export default unifiedAuthService
