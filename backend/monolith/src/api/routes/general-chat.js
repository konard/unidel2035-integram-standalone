/**
 * General Chat API Routes
 * REST API for general chat functionality (NOT AI chat)
 */

import express from 'express'
import fs from 'fs'
import ChatService from '../../services/chat/chatService.js'
import { authenticate } from '../../middleware/auth/auth.js'

const router = express.Router()

// Initialize chat service instance
const chatService = new ChatService()

// Middleware to initialize chat service with user's Integram credentials
router.use(async (req, res, next) => {
  try {
    // Get Integram token from X-Authorization header (same as Profile.vue)
    const integramToken = req.headers['x-authorization']

    if (integramToken) {
      // Get XSRF token and userId from /xsrf endpoint
      const xsrfResponse = await fetch(`${process.env.INTEGRAM_API_URL || 'https://dronedoc.ru'}/${process.env.INTEGRAM_DATABASE || 'my'}/xsrf?JSON_KV=true`, {
        headers: { 'X-Authorization': integramToken }
      })

      if (xsrfResponse.ok) {
        const xsrfData = await xsrfResponse.json()
        const integramXsrf = xsrfData._xsrf
        const integramUserId = xsrfData.id

        chatService.setAuth(integramToken, integramXsrf, integramUserId)

        // Store userId in request for later use
        req.integramUserId = integramUserId
      } else {
        throw new Error('Failed to validate Integram token')
      }
    } else {
      // Fallback: use system credentials
      const systemLogin = process.env.INTEGRAM_SYSTEM_USERNAME || 'd'
      const systemPassword = process.env.INTEGRAM_SYSTEM_PASSWORD || 'd'
      await chatService.initialize(systemLogin, systemPassword)

      // Get userId from authenticated session
      req.integramUserId = chatService.client.getUserId() || 'd'
    }

    next()
  } catch (error) {
    console.error('[General Chat API] Service initialization failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to initialize chat service',
      message: error.message
    })
  }
})

// ============================================================
// Chat Rooms Routes
// ============================================================

/**
 * GET /api/general-chat/rooms
 * Get all chat rooms
 */
router.get('/rooms', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query
    const rooms = await chatService.getChatRooms({
      limit: parseInt(limit),
      offset: parseInt(offset)
    })

    res.json({
      success: true,
      data: rooms,
      total: rooms.length
    })
  } catch (error) {
    console.error('[General Chat API] Get rooms failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get chat rooms',
      message: error.message
    })
  }
})

/**
 * GET /api/general-chat/rooms/:id
 * Get chat room by ID
 */
router.get('/rooms/:id', async (req, res) => {
  try {
    const { id } = req.params
    const room = await chatService.getChatRoom(parseInt(id))

    res.json({
      success: true,
      data: room
    })
  } catch (error) {
    console.error('[General Chat API] Get room failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get chat room',
      message: error.message
    })
  }
})

/**
 * POST /api/general-chat/rooms
 * Create new chat room
 */
router.post('/rooms', async (req, res) => {
  try {
    const { name, description, typeId } = req.body
    const creatorId = req.user?.id || req.session?.userId

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Room name is required'
      })
    }

    const room = await chatService.createChatRoom({
      name,
      description,
      typeId: typeId || 217733, // Default to Group chat
      creatorId: parseInt(creatorId)
    })

    res.status(201).json({
      success: true,
      data: room
    })
  } catch (error) {
    console.error('[General Chat API] Create room failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to create chat room',
      message: error.message
    })
  }
})

// ============================================================
// Messages Routes
// ============================================================

/**
 * GET /api/general-chat/rooms/:roomId/messages
 * Get messages for a chat room
 */
router.get('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params
    const { limit = 50, offset = 0 } = req.query

    fs.appendFileSync('/tmp/general-chat-api.log', `${new Date().toISOString()} - GET /rooms/${roomId}/messages - limit: ${limit}\n`)
    console.error('[general-chat.js] GET /rooms/:roomId/messages called - roomId:', roomId, 'limit:', limit)

    const messages = await chatService.getMessages(parseInt(roomId), {
      limit: parseInt(limit),
      offset: parseInt(offset)
    })

    fs.appendFileSync('/tmp/general-chat-api.log', `${new Date().toISOString()} - Got ${messages.length} messages, first authorAvatar: ${messages[0]?.authorAvatar}\n`)
    console.error('[general-chat.js] Got', messages.length, 'messages, first has authorAvatar:', messages[0]?.authorAvatar)

    res.json({
      success: true,
      data: messages,
      total: messages.length
    })
  } catch (error) {
    console.error('[General Chat API] Get messages failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get messages',
      message: error.message
    })
  }
})

/**
 * POST /api/general-chat/rooms/:roomId/messages
 * Send message to chat room
 */
router.post('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params
    const { text, replyToId } = req.body

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Message text is required'
      })
    }

    // Get authorId from Integram session (set by middleware)
    const authorId = req.integramUserId
    if (!authorId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated. Please provide Integram token in X-Authorization header'
      })
    }

    const message = await chatService.sendMessage({
      roomId: parseInt(roomId),
      authorId: parseInt(authorId) || authorId, // Handle both string and number IDs
      text,
      replyToId: replyToId ? parseInt(replyToId) : null
    })

    console.error('[general-chat.js] Message created:', message.id, 'Broadcasting...')

    // Broadcast to all clients in the room via WebSocket
    if (req.app.websocket) {
      console.error('[general-chat.js] Calling broadcastToRoom for room:', parseInt(roomId))
      req.app.websocket.broadcastToRoom(parseInt(roomId), {
        type: 'generalchat:new-message',
        message: message
      })
      console.error('[general-chat.js] broadcastToRoom completed')
    } else {
      console.error('[general-chat.js] WARNING: req.app.websocket is undefined!')
    }

    res.status(201).json({
      success: true,
      data: message
    })
  } catch (error) {
    console.error('[General Chat API] Send message failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to send message',
      message: error.message
    })
  }
})

/**
 * DELETE /api/general-chat/rooms/:roomId/messages/:messageId
 * Delete message (soft delete - sets IS_DELETED flag)
 */
router.delete('/rooms/:roomId/messages/:messageId', async (req, res) => {
  try {
    const { roomId, messageId } = req.params

    // Get authorId from Integram session
    const userId = req.integramUserId
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      })
    }

    // Delete message (will check ownership)
    const result = await chatService.deleteMessage(parseInt(messageId), parseInt(userId) || userId)

    console.error('[general-chat.js] Message deleted:', messageId, 'Broadcasting...')

    // Broadcast to all clients in the room via WebSocket
    if (req.app.websocket) {
      req.app.websocket.broadcastToRoom(parseInt(roomId), {
        type: 'generalchat:message-deleted',
        messageId: parseInt(messageId),
        deletedBy: parseInt(userId) || userId,
        timestamp: result.deletedAt
      })
      console.error('[general-chat.js] Delete broadcast completed')
    }

    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('[General Chat API] Delete message failed:', error)

    // Return 403 if user doesn't own the message
    if (error.message.includes('only delete your own')) {
      return res.status(403).json({
        success: false,
        error: error.message
      })
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete message',
      message: error.message
    })
  }
})

/**
 * PUT /api/general-chat/messages/:id
 * Update message
 */
router.put('/messages/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { text } = req.body

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Message text is required'
      })
    }

    const message = await chatService.updateMessage(parseInt(id), text)

    res.json({
      success: true,
      data: message
    })
  } catch (error) {
    console.error('[General Chat API] Update message failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update message',
      message: error.message
    })
  }
})

/**
 * DELETE /api/general-chat/messages/:id
 * Delete message (soft delete)
 */
router.delete('/messages/:id', async (req, res) => {
  try {
    const { id } = req.params
    await chatService.deleteMessage(parseInt(id))

    res.json({
      success: true,
      message: 'Message deleted'
    })
  } catch (error) {
    console.error('[General Chat API] Delete message failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete message',
      message: error.message
    })
  }
})

// ============================================================
// Members Routes
// ============================================================

/**
 * GET /api/general-chat/rooms/:roomId/members
 * Get members of chat room
 */
router.get('/rooms/:roomId/members', async (req, res) => {
  try {
    const { roomId } = req.params
    const members = await chatService.getMembers(parseInt(roomId))

    res.json({
      success: true,
      data: members,
      total: members.length
    })
  } catch (error) {
    console.error('[General Chat API] Get members failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get members',
      message: error.message
    })
  }
})

/**
 * POST /api/general-chat/rooms/:roomId/members
 * Add member to chat room
 */
router.post('/rooms/:roomId/members', async (req, res) => {
  try {
    const { roomId } = req.params
    const { userId, role = 'member' } = req.body

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      })
    }

    const member = await chatService.addMember({
      roomId: parseInt(roomId),
      userId: parseInt(userId),
      role
    })

    res.status(201).json({
      success: true,
      data: member
    })
  } catch (error) {
    console.error('[General Chat API] Add member failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to add member',
      message: error.message
    })
  }
})

/**
 * DELETE /api/general-chat/members/:id
 * Remove member from chat room
 */
router.delete('/members/:id', async (req, res) => {
  try {
    const { id } = req.params
    await chatService.removeMember(parseInt(id))

    res.json({
      success: true,
      message: 'Member removed'
    })
  } catch (error) {
    console.error('[General Chat API] Remove member failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to remove member',
      message: error.message
    })
  }
})

/**
 * PUT /api/general-chat/members/:id/read
 * Update member's last read timestamp
 */
router.put('/members/:id/read', async (req, res) => {
  try {
    const { id } = req.params
    await chatService.updateLastRead(parseInt(id))

    res.json({
      success: true,
      message: 'Last read updated'
    })
  } catch (error) {
    console.error('[General Chat API] Update last read failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update last read',
      message: error.message
    })
  }
})

// ============================================================
// Files Routes
// ============================================================

/**
 * GET /api/general-chat/messages/:messageId/files
 * Get files attached to message
 */
router.get('/messages/:messageId/files', async (req, res) => {
  try {
    const { messageId } = req.params
    const files = await chatService.getFiles(parseInt(messageId))

    res.json({
      success: true,
      data: files,
      total: files.length
    })
  } catch (error) {
    console.error('[General Chat API] Get files failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get files',
      message: error.message
    })
  }
})

/**
 * POST /api/general-chat/messages/:messageId/files
 * Attach file to message
 */
router.post('/messages/:messageId/files', async (req, res) => {
  try {
    const { messageId } = req.params
    const { filename, url, size, mimeType } = req.body

    if (!filename || !url) {
      return res.status(400).json({
        success: false,
        error: 'Filename and URL are required'
      })
    }

    const file = await chatService.attachFile({
      messageId: parseInt(messageId),
      filename,
      url,
      size: parseInt(size) || 0,
      mimeType: mimeType || 'application/octet-stream'
    })

    res.status(201).json({
      success: true,
      data: file
    })
  } catch (error) {
    console.error('[General Chat API] Attach file failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to attach file',
      message: error.message
    })
  }
})

export default router
