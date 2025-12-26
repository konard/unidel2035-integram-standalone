/**
 * General Chat Service
 * Service for real-time messaging (NOT AI chat)
 * Integrates with /api/general-chat/* endpoints and WebSocket
 */

import apiClient from '@/axios2'
import { logger } from '@/utils/logger'

class GeneralChatService {
  constructor() {
    this.ws = null
    this.wsUrl = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 3000
    this.currentRoomId = null
    this.currentUserId = null
    this.messageHandlers = []
    this.pingInterval = null  // Keepalive ping interval
    this.pingIntervalMs = 30000  // Send ping every 30 seconds
    this.eventHandlers = {
      'connected': [],
      'generalchat:joined': [],
      'generalchat:user-joined': [],
      'generalchat:user-left': [],
      'generalchat:new-message': [],
      'generalchat:message-updated': [],
      'generalchat:message-deleted': [],
      'generalchat:typing': []
    }
  }

  // ============================================================
  // REST API Methods
  // ============================================================

  /**
   * Get all chat rooms
   */
  async getRooms(params = {}) {
    try {
      const { limit = 100, offset = 0 } = params
      const response = await apiClient.get('/api/general-chat/rooms', {
        params: { limit, offset }
      })
      return response.data
    } catch (error) {
      logger.error('[GeneralChat] Failed to get rooms:', error)
      throw error
    }
  }

  /**
   * Get chat room by ID
   */
  async getRoom(roomId) {
    try {
      const response = await apiClient.get(`/api/general-chat/rooms/${roomId}`)
      return response.data
    } catch (error) {
      logger.error(`[GeneralChat] Failed to get room ${roomId}:`, error)
      throw error
    }
  }

  /**
   * Create new chat room
   */
  async createRoom(data) {
    try {
      const response = await apiClient.post('/api/general-chat/rooms', data)
      return response.data
    } catch (error) {
      logger.error('[GeneralChat] Failed to create room:', error)
      throw error
    }
  }

  /**
   * Get messages for a room
   */
  async getMessages(roomId, params = {}) {
    try {
      const { limit = 50, offset = 0 } = params
      const response = await apiClient.get(`/api/general-chat/rooms/${roomId}/messages`, {
        params: { limit, offset }
      })
      return response.data
    } catch (error) {
      logger.error(`[GeneralChat] Failed to get messages for room ${roomId}:`, error)
      throw error
    }
  }

  /**
   * Send message to room
   */
  async sendMessage(roomId, data) {
    try {
      const response = await apiClient.post(`/api/general-chat/rooms/${roomId}/messages`, data)
      return response.data
    } catch (error) {
      logger.error(`[GeneralChat] Failed to send message to room ${roomId}:`, error)
      throw error
    }
  }

  /**
   * Update message
   */
  async updateMessage(messageId, text) {
    try {
      const response = await apiClient.put(`/api/general-chat/messages/${messageId}`, { text })
      return response.data
    } catch (error) {
      logger.error(`[GeneralChat] Failed to update message ${messageId}:`, error)
      throw error
    }
  }

  /**
   * Delete message
   */
  async deleteMessage(roomId, messageId) {
    try {
      const response = await apiClient.delete(`/api/general-chat/rooms/${roomId}/messages/${messageId}`)
      return response.data
    } catch (error) {
      logger.error(`[GeneralChat] Failed to delete message ${messageId}:`, error)
      throw error
    }
  }

  /**
   * Get members of a room
   */
  async getMembers(roomId) {
    try {
      const response = await apiClient.get(`/api/general-chat/rooms/${roomId}/members`)
      return response.data
    } catch (error) {
      logger.error(`[GeneralChat] Failed to get members for room ${roomId}:`, error)
      throw error
    }
  }

  /**
   * Add member to room
   */
  async addMember(roomId, data) {
    try {
      const response = await apiClient.post(`/api/general-chat/rooms/${roomId}/members`, data)
      return response.data
    } catch (error) {
      logger.error(`[GeneralChat] Failed to add member to room ${roomId}:`, error)
      throw error
    }
  }

  /**
   * Update last read timestamp
   */
  async updateLastRead(memberId) {
    try {
      const response = await apiClient.put(`/api/general-chat/members/${memberId}/read`)
      return response.data
    } catch (error) {
      logger.error(`[GeneralChat] Failed to update last read for member ${memberId}:`, error)
      throw error
    }
  }

  // ============================================================
  // WebSocket Methods
  // ============================================================

  /**
   * Connect to WebSocket server
   */
  connectWebSocket(wsBaseUrl = null) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    // Determine WebSocket URL
    if (!wsBaseUrl) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      wsBaseUrl = `${protocol}//${host}/ws`
    }
    this.wsUrl = wsBaseUrl

    logger.info('[GeneralChat] Connecting to WebSocket:', this.wsUrl)

    try {
      this.ws = new WebSocket(this.wsUrl)

      this.ws.onopen = () => {
        logger.info('[GeneralChat] WebSocket connected')
        this.reconnectAttempts = 0

        // Start keepalive ping
        this.startPing()

        // Emit connected event
        this.handleWebSocketMessage({ type: 'connected' })

        // Rejoin current room if any
        if (this.currentRoomId && this.currentUserId) {
          this.joinRoom(this.currentRoomId, this.currentUserId)
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleWebSocketMessage(data)
        } catch (error) {
          logger.error('[GeneralChat] Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onerror = (error) => {
        logger.error('[GeneralChat] WebSocket error:', {
          type: error.type,
          message: error.message,
          url: this.wsUrl,
          readyState: this.ws?.readyState
        })
      }

      this.ws.onclose = (event) => {
        logger.warn('[GeneralChat] WebSocket disconnected', {
          code: event.code,
          reason: event.reason || 'No reason provided',
          wasClean: event.wasClean,
          url: this.wsUrl
        })

        // Log close code details
        const closeReasons = {
          1000: 'Normal closure',
          1001: 'Going away',
          1002: 'Protocol error',
          1003: 'Unsupported data',
          1006: 'Abnormal closure (no close frame)',
          1007: 'Invalid frame payload data',
          1008: 'Policy violation',
          1009: 'Message too big',
          1010: 'Extension negotiation failed',
          1011: 'Server error',
          1015: 'TLS handshake failed'
        }
        logger.info(`[GeneralChat] Close code ${event.code}: ${closeReasons[event.code] || 'Unknown'}`)

        // Stop keepalive ping
        this.stopPing()

        this.ws = null

        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++
          logger.info(`[GeneralChat] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
          setTimeout(() => this.connectWebSocket(wsBaseUrl), this.reconnectDelay)
        } else {
          logger.error('[GeneralChat] Max reconnection attempts reached')
        }
      }
    } catch (error) {
      logger.error('[GeneralChat] Failed to create WebSocket:', error)
    }
  }

  /**
   * Start keepalive ping
   * Sends ping every 30 seconds to keep WebSocket connection alive
   */
  startPing() {
    // Clear existing interval if any
    this.stopPing()

    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
        logger.debug('[GeneralChat] Sent keepalive ping')
      }
    }, this.pingIntervalMs)

    logger.debug(`[GeneralChat] Keepalive ping started (${this.pingIntervalMs}ms interval)`)
  }

  /**
   * Stop keepalive ping
   */
  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
      logger.debug('[GeneralChat] Keepalive ping stopped')
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  handleWebSocketMessage(data) {
    // Call type-specific event handlers
    const handlers = this.eventHandlers[data.type] || []
    handlers.forEach(handler => {
      try {
        handler(data)
      } catch (error) {
        logger.error(`[GeneralChat] Error in event handler for ${data.type}:`, error)
      }
    })

    // Call generic message handlers
    this.messageHandlers.forEach(handler => {
      try {
        handler(data)
      } catch (error) {
        logger.error('[GeneralChat] Error in message handler:', error)
      }
    })
  }

  /**
   * Join a chat room (WebSocket)
   */
  joinRoom(roomId, userId, userName = 'User') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('[GeneralChat] Cannot join room: WebSocket not connected')
      this.currentRoomId = roomId
      this.currentUserId = userId
      return
    }

    this.currentRoomId = roomId
    this.currentUserId = userId

    const message = {
      type: 'generalchat:join-room',
      roomId,
      userId,
      userName
    }

    this.ws.send(JSON.stringify(message))
    logger.info(`[GeneralChat] Joined room ${roomId}`)
  }

  /**
   * Leave current chat room (WebSocket)
   */
  leaveRoom() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.currentRoomId) {
      return
    }

    const message = {
      type: 'generalchat:leave-room',
      roomId: this.currentRoomId
    }

    this.ws.send(JSON.stringify(message))
    logger.info(`[GeneralChat] Left room ${this.currentRoomId}`)

    this.currentRoomId = null
    this.currentUserId = null
  }

  /**
   * Send typing indicator
   */
  sendTyping(isTyping = true) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.currentRoomId) {
      return
    }

    const message = {
      type: 'generalchat:typing',
      roomId: this.currentRoomId,
      isTyping
    }

    this.ws.send(JSON.stringify(message))
  }

  /**
   * Broadcast new message via WebSocket
   */
  broadcastMessage(messageData) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.currentRoomId) {
      return
    }

    const message = {
      type: 'generalchat:message',
      roomId: this.currentRoomId,
      message: messageData
    }

    this.ws.send(JSON.stringify(message))
  }

  /**
   * Subscribe to WebSocket events
   */
  on(eventType, handler) {
    if (this.eventHandlers[eventType]) {
      this.eventHandlers[eventType].push(handler)
    } else {
      // Generic message handler
      this.messageHandlers.push(handler)
    }
  }

  /**
   * Unsubscribe from WebSocket events
   */
  off(eventType, handler) {
    if (this.eventHandlers[eventType]) {
      const index = this.eventHandlers[eventType].indexOf(handler)
      if (index > -1) {
        this.eventHandlers[eventType].splice(index, 1)
      }
    } else {
      const index = this.messageHandlers.indexOf(handler)
      if (index > -1) {
        this.messageHandlers.splice(index, 1)
      }
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    if (this.ws) {
      this.leaveRoom()
      this.stopPing()
      this.ws.close()
      this.ws = null
    }
  }
}

// Export singleton instance
export const generalChatService = new GeneralChatService()
export default generalChatService
