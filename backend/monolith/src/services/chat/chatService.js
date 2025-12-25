/**
 * Chat Service
 * Service for managing general chat using Integram API
 *
 * Provides CRUD operations for:
 * - Chat rooms
 * - Messages
 * - Members
 * - Files
 */

import { IntegramClient } from '../integram/integram-client.js'
import CHAT_TABLES from '../../config/chat-tables.js'
import { debugLog } from './debug-log.js'

const INTEGRAM_CONFIG = {
  serverURL: process.env.INTEGRAM_API_URL || 'https://dronedoc.ru',
  database: process.env.INTEGRAM_DATABASE || 'my'
}

export class ChatService {
  constructor() {
    this.client = null
    this.isInitialized = false
  }

  /**
   * Initialize service with authentication
   * @param {string} login - Username
   * @param {string} password - Password
   */
  async initialize(login, password) {
    if (!this.client) {
      this.client = new IntegramClient(INTEGRAM_CONFIG.serverURL, INTEGRAM_CONFIG.database)
      await this.client.authenticate(login, password)
      this.isInitialized = true
    }
  }

  /**
   * Set authentication tokens directly (for reusing existing session)
   * @param {string} token - Auth token
   * @param {string} xsrf - XSRF token
   */
  setAuth(token, xsrf) {
    if (!this.client) {
      this.client = new IntegramClient(INTEGRAM_CONFIG.serverURL, INTEGRAM_CONFIG.database)
    }
    this.client.setAuth(token, xsrf)
    this.isInitialized = true
  }

  // ============================================================
  // Chat Rooms Operations
  // ============================================================

  /**
   * Create new chat room
   * @param {Object} data - Chat room data
   * @param {string} data.name - Room name
   * @param {string} data.description - Room description
   * @param {number} data.typeId - Chat type ID (from CHAT_TABLES.CHAT_TYPES.VALUES)
   * @param {number} data.creatorId - Creator user ID
   * @returns {Promise<Object>} Created chat room
   */
  async createChatRoom({ name, description, typeId, creatorId }) {
    const requisites = {}

    if (description) {
      requisites[CHAT_TABLES.CHAT_ROOMS.REQUISITES.DESCRIPTION] = description
    }
    if (typeId) {
      requisites[CHAT_TABLES.CHAT_ROOMS.REQUISITES.TYPE_REF] = typeId.toString()
    }
    if (creatorId) {
      requisites[CHAT_TABLES.CHAT_ROOMS.REQUISITES.CREATOR_REF] = creatorId.toString()
    }

    // Set created_at to current datetime
    requisites[CHAT_TABLES.CHAT_ROOMS.REQUISITES.CREATED_AT] = new Date().toISOString()

    // Set active to true
    requisites[CHAT_TABLES.CHAT_ROOMS.REQUISITES.IS_ACTIVE] = '1'

    const result = await this.client.createObject(
      CHAT_TABLES.CHAT_ROOMS.TABLE_ID,
      name,
      { requisites }
    )

    return {
      id: result.id || result.ID,
      name,
      description,
      typeId,
      creatorId
    }
  }

  /**
   * Get all chat rooms
   * @param {Object} options - Query options
   * @param {number} options.limit - Max results
   * @param {number} options.offset - Offset for pagination
   * @returns {Promise<Array>} List of chat rooms
   */
  async getChatRooms({ limit = 100, offset = 0 } = {}) {
    const result = await this.client.getObjectList(
      CHAT_TABLES.CHAT_ROOMS.TABLE_ID,
      { limit, offset }
    )

    const rooms = result.object || []
    return rooms.map(room => ({
      id: room.id,
      name: room.val,
      description: room[CHAT_TABLES.CHAT_ROOMS.REQUISITES.DESCRIPTION],
      typeId: room[CHAT_TABLES.CHAT_ROOMS.REQUISITES.TYPE_REF],
      creatorId: room[CHAT_TABLES.CHAT_ROOMS.REQUISITES.CREATOR_REF],
      createdAt: room[CHAT_TABLES.CHAT_ROOMS.REQUISITES.CREATED_AT],
      isActive: room[CHAT_TABLES.CHAT_ROOMS.REQUISITES.IS_ACTIVE] === '1'
    }))
  }

  /**
   * Get chat room by ID
   * @param {number} roomId - Chat room ID
   * @returns {Promise<Object>} Chat room data
   */
  async getChatRoom(roomId) {
    const result = await this.client.getObjectEditData(roomId)
    const obj = result.obj
    const reqs = result.reqs || {}

    return {
      id: obj.id,
      name: obj.val,
      description: reqs[CHAT_TABLES.CHAT_ROOMS.REQUISITES.DESCRIPTION]?.val,
      typeId: reqs[CHAT_TABLES.CHAT_ROOMS.REQUISITES.TYPE_REF]?.val,
      typeName: reqs[CHAT_TABLES.CHAT_ROOMS.REQUISITES.TYPE_REF]?.name,
      creatorId: reqs[CHAT_TABLES.CHAT_ROOMS.REQUISITES.CREATOR_REF]?.val,
      creatorName: reqs[CHAT_TABLES.CHAT_ROOMS.REQUISITES.CREATOR_REF]?.name,
      createdAt: reqs[CHAT_TABLES.CHAT_ROOMS.REQUISITES.CREATED_AT]?.val,
      isActive: reqs[CHAT_TABLES.CHAT_ROOMS.REQUISITES.IS_ACTIVE]?.val === '1'
    }
  }

  // ============================================================
  // Messages Operations
  // ============================================================

  /**
   * Send message to chat room
   * @param {Object} data - Message data
   * @param {number} data.roomId - Chat room ID
   * @param {number} data.authorId - Author user ID
   * @param {string} data.text - Message text
   * @param {number} data.replyToId - Optional: message ID to reply to
   * @returns {Promise<Object>} Created message
   */
  async sendMessage({ roomId, authorId, text, replyToId }) {
    // Format date for Integram DATETIME fields
    // Use Moscow timezone (UTC+3)
    const now = new Date()
    const moscowOffset = 3 * 60 // Moscow is UTC+3
    const localOffset = now.getTimezoneOffset() // Minutes from UTC (negative for east of UTC)
    const moscowTime = new Date(now.getTime() + (moscowOffset + localOffset) * 60 * 1000)

    // SQL format for DB: YYYY-MM-DD HH:MM:SS
    const formattedDateSQL = `${moscowTime.getFullYear()}-${String(moscowTime.getMonth() + 1).padStart(2, '0')}-${String(moscowTime.getDate()).padStart(2, '0')} ${String(moscowTime.getHours()).padStart(2, '0')}:${String(moscowTime.getMinutes()).padStart(2, '0')}:${String(moscowTime.getSeconds()).padStart(2, '0')}`

    // Russian format for frontend/WebSocket: DD.MM.YYYY HH:MM:SS
    const formattedDate = `${String(moscowTime.getDate()).padStart(2, '0')}.${String(moscowTime.getMonth() + 1).padStart(2, '0')}.${moscowTime.getFullYear()} ${String(moscowTime.getHours()).padStart(2, '0')}:${String(moscowTime.getMinutes()).padStart(2, '0')}:${String(moscowTime.getSeconds()).padStart(2, '0')}`

    // IMPORTANT: Do NOT include SENT_AT in createObject requisites
    // DateTime fields must be set AFTER object creation via setObjectRequisites
    const requisites = {
      [CHAT_TABLES.MESSAGES.REQUISITES.TEXT]: text,
      [CHAT_TABLES.MESSAGES.REQUISITES.AUTHOR_REF]: authorId.toString(),
      [CHAT_TABLES.MESSAGES.REQUISITES.IS_DELETED]: '0'
    }

    if (replyToId) {
      requisites[CHAT_TABLES.MESSAGES.REQUISITES.REPLY_TO_REF] = replyToId.toString()
    }

    // Create message as independent object (up=1, not parentId)
    const result = await this.client.createObject(
      CHAT_TABLES.MESSAGES.TABLE_ID,
      `Message by ${authorId}`,
      { requisites } // No parentId - creates independent object
    )

    const messageId = result.id || result.ID

    // Set SENT_AT after object creation (DateTime fields require separate call)
    // Use SQL format for DB
    await this.client.setObjectRequisites(messageId, {
      [CHAT_TABLES.MESSAGES.REQUISITES.SENT_AT]: formattedDateSQL
    })

    // Add message to room's MESSAGES_REF multiselect field
    await this.client.addMultiselectItem(
      roomId,
      CHAT_TABLES.CHAT_ROOMS.REQUISITES.MESSAGES_REF,
      messageId
    )

    // Fetch author data from Table 18 (Users) for real-time broadcast
    let authorName = 'Unknown'
    let authorAvatar = null
    try {
      const userData = await this.client.getObjectEditData(authorId)
      const userReqs = userData.reqs || {}

      // Extract name from requisite 33 (Name field)
      const nameValue = userReqs[33]?.value || ''
      if (nameValue) {
        authorName = nameValue
      }

      // Extract photo URL from requisite 38 (Photo field)
      const photoValue = userReqs[38]?.value || ''
      if (photoValue) {
        // Photo field returns HTML: <a target="_blank" href="/download/...">filename</a>
        const hrefMatch = photoValue.match(/href="([^"]+)"/)
        if (hrefMatch) {
          const baseUrl = process.env.INTEGRAM_URL || 'https://dronedoc.ru'
          authorAvatar = `${baseUrl}${hrefMatch[1]}`
        }
      }
    } catch (error) {
      console.error(`[ChatService] Failed to fetch author data for ${authorId}:`, error)
    }

    return {
      id: messageId,
      roomId,
      authorId,
      authorName,
      authorAvatar,
      text,
      replyToId,
      sentAt: formattedDate
    }
  }

  /**
   * Delete message (soft delete by setting IS_DELETED flag)
   * @param {number} messageId - Message ID to delete
   * @param {number} userId - User ID requesting deletion (must be author)
   * @returns {Promise<Object>} Deleted message info
   */
  async deleteMessage(messageId, userId) {
    // Get message to check ownership
    const msgData = await this.client.getObjectEditData(messageId)
    const reqs = msgData.reqs || {}

    const authorId = reqs[CHAT_TABLES.MESSAGES.REQUISITES.AUTHOR_REF]?.value ||
                     reqs[CHAT_TABLES.MESSAGES.REQUISITES.AUTHOR_REF]?.ref

    // Check if user is the author
    if (parseInt(authorId) !== parseInt(userId)) {
      throw new Error('You can only delete your own messages')
    }

    // Soft delete: set IS_DELETED flag to true
    await this.client.setObjectRequisites(messageId, {
      [CHAT_TABLES.MESSAGES.REQUISITES.IS_DELETED]: '1'
    })

    return {
      id: messageId,
      authorId: parseInt(authorId),
      deletedAt: new Date().toISOString()
    }
  }

  /**
   * Get messages for chat room
   * @param {number} roomId - Chat room ID
   * @param {Object} options - Query options
   * @param {number} options.limit - Max results
   * @param {number} options.offset - Offset for pagination
   * @returns {Promise<Array>} List of messages
   */
  async getMessages(roomId, { limit = 50, offset = 0 } = {}) {
    // Get multiselect items from room's MESSAGES_REF field
    const multiItems = await this.client.getMultiselectItems(
      roomId,
      CHAT_TABLES.CHAT_ROOMS.REQUISITES.MESSAGES_REF
    )

    // multiItems is array of { id, object_id, val } where object_id is the message ID
    const messageIds = multiItems.map(item => item.object_id || item.val).filter(Boolean)

    if (messageIds.length === 0) {
      return []
    }

    // Fetch all messages by ID
    // TODO: Apply limit/offset pagination
    const messages = []
    for (const msgId of messageIds) {
      try {
        const msgData = await this.client.getObjectEditData(msgId)
        const msg = msgData.obj || {}
        const reqs = msgData.reqs || {}

        messages.push({
          id: msg.id || msgId,
          text: reqs[CHAT_TABLES.MESSAGES.REQUISITES.TEXT]?.value || '',
          authorId: reqs[CHAT_TABLES.MESSAGES.REQUISITES.AUTHOR_REF]?.value || reqs[CHAT_TABLES.MESSAGES.REQUISITES.AUTHOR_REF]?.ref || '',
          authorName: reqs[CHAT_TABLES.MESSAGES.REQUISITES.AUTHOR_REF]?.name || 'Unknown',
          sentAt: reqs[CHAT_TABLES.MESSAGES.REQUISITES.SENT_AT]?.value || '',
          editedAt: reqs[CHAT_TABLES.MESSAGES.REQUISITES.EDITED_AT]?.value || null,
          isDeleted: reqs[CHAT_TABLES.MESSAGES.REQUISITES.IS_DELETED]?.value === '1',
          replyToId: reqs[CHAT_TABLES.MESSAGES.REQUISITES.REPLY_TO_REF]?.value || reqs[CHAT_TABLES.MESSAGES.REQUISITES.REPLY_TO_REF]?.ref || null
        })
      } catch (error) {
        console.error(`[ChatService] Failed to load message ${msgId}:`, error)
      }
    }

    // Fetch author photos and names from Table 18 (Users)
    const uniqueAuthorIds = [...new Set(messages.map(m => m.authorId).filter(Boolean))]
    const authorPhotos = {}
    const authorNames = {}

    debugLog(`Fetching user data for ${uniqueAuthorIds.length} unique authors: ${JSON.stringify(uniqueAuthorIds)}`)
    console.log(`[ChatService] Fetching user data for ${uniqueAuthorIds.length} unique authors:`, uniqueAuthorIds)

    for (const authorId of uniqueAuthorIds) {
      try {
        const userData = await this.client.getObjectEditData(authorId)
        const userReqs = userData.reqs || {}

        // Extract name from requisite 33 (Name field)
        const nameValue = userReqs[33]?.value || ''
        if (nameValue) {
          authorNames[authorId] = nameValue
          console.log(`[ChatService] ✅ Name for user ${authorId}: ${nameValue}`)
        }

        // Extract photo URL from requisite 38 (Photo field)
        const photoValue = userReqs[38]?.value || ''
        if (photoValue) {
          // Photo field returns HTML: <a target="_blank" href="/download/...">filename</a>
          const hrefMatch = photoValue.match(/href="([^"]+)"/)
          if (hrefMatch) {
            // Store full URL to the file
            const baseUrl = process.env.INTEGRAM_URL || 'https://dronedoc.ru'
            authorPhotos[authorId] = `${baseUrl}${hrefMatch[1]}`
            debugLog(`✅ Photo URL for user ${authorId}: ${authorPhotos[authorId]}`)
            console.log(`[ChatService] ✅ Photo URL for user ${authorId}: ${authorPhotos[authorId]}`)
          }
        }
      } catch (error) {
        console.error(`[ChatService] Failed to load user data for ${authorId}:`, error)
      }
    }

    // Add authorAvatar and authorName to each message
    messages.forEach(msg => {
      msg.authorAvatar = authorPhotos[msg.authorId] || null
      msg.authorName = authorNames[msg.authorId] || msg.authorId || 'Unknown'
    })

    console.log(`[ChatService] Returning ${messages.length} messages with avatars:`, messages.map(m => ({ id: m.id, authorId: m.authorId, authorName: m.authorName, hasAvatar: !!m.authorAvatar })))

    // Sort by sentAt date (oldest first)
    messages.sort((a, b) => {
      // Parse DD.MM.YYYY HH:MM:SS format
      const parseDate = (dateStr) => {
        if (!dateStr) return new Date(0)
        const [datePart, timePart] = dateStr.split(' ')
        const [day, month, year] = datePart.split('.').map(Number)
        const [hours, minutes, seconds] = (timePart || '00:00:00').split(':').map(Number)
        return new Date(year, month - 1, day, hours, minutes, seconds)
      }
      return parseDate(a.sentAt) - parseDate(b.sentAt)
    })

    return messages
  }

  /**
   * Update message
   * @param {number} messageId - Message ID
   * @param {string} text - New text
   * @returns {Promise<Object>} Updated message
   */
  async updateMessage(messageId, text) {
    const requisites = {
      [CHAT_TABLES.MESSAGES.REQUISITES.TEXT]: text,
      [CHAT_TABLES.MESSAGES.REQUISITES.EDITED_AT]: new Date().toISOString()
    }

    await this.client.setObjectRequisites(messageId, requisites)

    return { id: messageId, text }
  }

  /**
   * Delete message (soft delete)
   * @param {number} messageId - Message ID
   * @returns {Promise<boolean>} Success
   */
  async deleteMessage(messageId) {
    const requisites = {
      [CHAT_TABLES.MESSAGES.REQUISITES.IS_DELETED]: '1'
    }

    await this.client.setObjectRequisites(messageId, requisites)
    return true
  }

  // ============================================================
  // Members Operations
  // ============================================================

  /**
   * Add member to chat room
   * @param {Object} data - Member data
   * @param {number} data.roomId - Chat room ID
   * @param {number} data.userId - User ID
   * @param {string} data.role - Member role (e.g., "member", "admin")
   * @returns {Promise<Object>} Created member
   */
  async addMember({ roomId, userId, role = 'member' }) {
    const requisites = {
      [CHAT_TABLES.MEMBERS.REQUISITES.USER_REF]: userId.toString(),
      [CHAT_TABLES.MEMBERS.REQUISITES.ROLE]: role,
      [CHAT_TABLES.MEMBERS.REQUISITES.JOINED_AT]: new Date().toISOString(),
      [CHAT_TABLES.MEMBERS.REQUISITES.IS_ACTIVE]: '1'
    }

    const result = await this.client.createObject(
      CHAT_TABLES.MEMBERS.TABLE_ID,
      `Member ${userId}`,
      { requisites, parentId: roomId }
    )

    return {
      id: result.id || result.ID,
      roomId,
      userId,
      role
    }
  }

  /**
   * Get members of chat room
   * @param {number} roomId - Chat room ID
   * @returns {Promise<Array>} List of members
   */
  async getMembers(roomId) {
    const result = await this.client.getObjectList(
      CHAT_TABLES.MEMBERS.TABLE_ID,
      { parent: roomId }
    )

    const members = result.object || []
    return members.map(member => ({
      id: member.id,
      userId: member[CHAT_TABLES.MEMBERS.REQUISITES.USER_REF],
      role: member[CHAT_TABLES.MEMBERS.REQUISITES.ROLE],
      joinedAt: member[CHAT_TABLES.MEMBERS.REQUISITES.JOINED_AT],
      lastReadAt: member[CHAT_TABLES.MEMBERS.REQUISITES.LAST_READ_AT],
      isActive: member[CHAT_TABLES.MEMBERS.REQUISITES.IS_ACTIVE] === '1'
    }))
  }

  /**
   * Update member's last read timestamp
   * @param {number} memberId - Member ID
   * @returns {Promise<boolean>} Success
   */
  async updateLastRead(memberId) {
    const requisites = {
      [CHAT_TABLES.MEMBERS.REQUISITES.LAST_READ_AT]: new Date().toISOString()
    }

    await this.client.setObjectRequisites(memberId, requisites)
    return true
  }

  /**
   * Remove member from chat room
   * @param {number} memberId - Member ID
   * @returns {Promise<boolean>} Success
   */
  async removeMember(memberId) {
    await this.client.deleteObject(memberId)
    return true
  }

  // ============================================================
  // Files Operations
  // ============================================================

  /**
   * Attach file to message
   * @param {Object} data - File data
   * @param {number} data.messageId - Message ID
   * @param {string} data.filename - File name
   * @param {string} data.url - File URL
   * @param {number} data.size - File size in bytes
   * @param {string} data.mimeType - MIME type
   * @returns {Promise<Object>} Created file record
   */
  async attachFile({ messageId, filename, url, size, mimeType }) {
    const requisites = {
      [CHAT_TABLES.FILES.REQUISITES.FILENAME]: filename,
      [CHAT_TABLES.FILES.REQUISITES.URL]: url,
      [CHAT_TABLES.FILES.REQUISITES.SIZE]: size.toString(),
      [CHAT_TABLES.FILES.REQUISITES.MIME_TYPE]: mimeType,
      [CHAT_TABLES.FILES.REQUISITES.UPLOADED_AT]: new Date().toISOString()
    }

    const result = await this.client.createObject(
      CHAT_TABLES.FILES.TABLE_ID,
      filename,
      { requisites, parentId: messageId }
    )

    return {
      id: result.id || result.ID,
      messageId,
      filename,
      url,
      size,
      mimeType
    }
  }

  /**
   * Get files attached to message
   * @param {number} messageId - Message ID
   * @returns {Promise<Array>} List of files
   */
  async getFiles(messageId) {
    const result = await this.client.getObjectList(
      CHAT_TABLES.FILES.TABLE_ID,
      { parent: messageId }
    )

    const files = result.object || []
    return files.map(file => ({
      id: file.id,
      filename: file.val,
      url: file[CHAT_TABLES.FILES.REQUISITES.URL],
      size: parseInt(file[CHAT_TABLES.FILES.REQUISITES.SIZE]) || 0,
      mimeType: file[CHAT_TABLES.FILES.REQUISITES.MIME_TYPE],
      uploadedAt: file[CHAT_TABLES.FILES.REQUISITES.UPLOADED_AT]
    }))
  }
}

export default ChatService
