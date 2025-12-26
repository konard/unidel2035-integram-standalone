/**
 * useGeneralChat.js - Composable for General Chat functionality
 * Handles real-time messaging (NOT AI chat)
 */

import { ref, reactive, onUnmounted, computed, watch } from 'vue'
import generalChatService from '@/services/generalChatService'
import { logger } from '@/utils/logger'

export function useGeneralChat(currentUserId) {
  // Toast removed to avoid initialization errors - use logger instead
  const toast = null

  // ==================== State ====================

  const activeChat = reactive({
    id: null,
    name: 'Загрузка...',
    messages: []
  })

  const newMessage = ref('')
  const availableRooms = ref([])
  const loadingRooms = ref(false)
  const loadingMessages = ref(false)
  const typingUsers = ref([])
  const isConnected = ref(false)

  // DEBUG: Watch loadingMessages changes
  watch(loadingMessages, (newVal, oldVal) => {
    logger.debug(`[GeneralChat] loadingMessages changed: ${oldVal} -> ${newVal}`)
    // Log stack trace to see where it's being set
    if (newVal === true) {
      logger.debug('[GeneralChat] loadingMessages set to TRUE - stack:', new Error().stack)
    }
  })

  // ==================== Helper Functions ====================

  /**
   * Parse Integram date format (DD.MM.YYYY HH:MM:SS) to Date object
   */
  const parseIntegramDate = (dateStr) => {
    if (!dateStr) return null
    const [datePart, timePart] = dateStr.split(' ')
    const [day, month, year] = datePart.split('.').map(Number)
    const [hours, minutes, seconds] = (timePart || '00:00:00').split(':').map(Number)
    return new Date(year, month - 1, day, hours, minutes, seconds)
  }

  /**
   * Sort messages by sentAt timestamp (oldest first)
   * If timestamps are equal, sort by message ID
   */
  const sortMessages = () => {
    activeChat.messages.sort((a, b) => {
      const timeA = a.sentAtDate || new Date(0)
      const timeB = b.sentAtDate || new Date(0)
      const timeDiff = timeA - timeB

      // If times are equal (or within 1 second), sort by ID
      if (Math.abs(timeDiff) < 1000) {
        const idA = parseInt(a.id) || 0
        const idB = parseInt(b.id) || 0
        return idA - idB
      }

      return timeDiff
    })
  }

  /**
   * Format message from API response
   */
  const formatMessage = (msg) => {
    const sentDate = parseIntegramDate(msg.sentAt)

    return {
      id: msg.id,
      text: msg.text,
      time: sentDate ? sentDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '',
      sentAtDate: sentDate, // Store Date object for sorting
      isUser: msg.authorId?.toString() === currentUserId.value?.toString(),
      authorId: msg.authorId,
      authorName: msg.authorName || 'Unknown',
      authorAvatar: msg.authorAvatar || null, // Avatar URL from Integram Table 18
      editedAt: msg.editedAt,
      isDeleted: msg.isDeleted,
      replyToId: msg.replyToId
    }
  }

  // ==================== API Methods ====================

  /**
   * Load available chat rooms
   */
  async function loadRooms() {
    loadingRooms.value = true
    try {
      const response = await generalChatService.getRooms({ limit: 100 })
      availableRooms.value = response.data || []
      logger.info('[GeneralChat] Loaded rooms:', availableRooms.value.length)

      return availableRooms.value
    } catch (error) {
      logger.error('[GeneralChat] Failed to load rooms:', error)
      if (toast) {
        toast.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось загрузить список комнат',
          life: 3000
        })
      }
      return []
    } finally {
      loadingRooms.value = false
    }
  }

  /**
   * Create default chat room
   */
  async function createDefaultRoom() {
    try {
      const response = await generalChatService.createRoom({
        name: 'Общий чат',
        description: 'Общий чат для команды',
        typeId: 217733 // Group chat type
      })

      // response is { success: true, data: { id, name, ... } }
      const room = response.data
      logger.info('[GeneralChat] Created default room:', room)
      if (toast) {
        toast.add({
          severity: 'success',
          summary: 'Успех',
          detail: 'Создана комната "Общий чат"',
          life: 3000
        })
      }

      return room
    } catch (error) {
      logger.error('[GeneralChat] Failed to create default room:', error)
      if (toast) {
        toast.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось создать комнату',
          life: 3000
        })
      }
      return null
    }
  }

  /**
   * Load messages for a room
   */
  async function loadMessages(roomId) {
    if (!roomId) {
      loadingMessages.value = false // Reset if no roomId
      return
    }

    // Set loading state
    loadingMessages.value = true
    logger.info(`[GeneralChat] Loading messages for room ${roomId}...`)

    try {
      const response = await generalChatService.getMessages(roomId, { limit: 100 })
      const messages = response.data || []

      // Map and sort messages
      activeChat.messages = messages.map(formatMessage)
      sortMessages() // Ensure correct chronological order

      logger.info(`[GeneralChat] Loaded ${messages.length} messages for room ${roomId}`)
    } catch (error) {
      logger.error('[GeneralChat] Failed to load messages:', error)
      if (toast) {
        toast.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось загрузить сообщения',
          life: 3000
        })
      }
    } finally {
      // ALWAYS reset loading state
      loadingMessages.value = false
      logger.debug('[GeneralChat] loadingMessages set to false')
    }
  }

  /**
   * Join a chat room
   */
  async function joinRoom(room) {
    if (!room || !room.id) return

    activeChat.id = room.id
    activeChat.name = room.name || 'Чат'
    activeChat.creatorId = room.creatorId || null
    activeChat.typeId = room.typeId || null

    // Load messages
    await loadMessages(room.id)

    // Join WebSocket room
    if (isConnected.value) {
      generalChatService.joinRoom(room.id, currentUserId.value, 'User')
    }

    logger.info('[GeneralChat] Joined room:', room.name, 'creatorId:', room.creatorId)
  }

  /**
   * Switch to a room by ID
   */
  async function switchRoom(roomId) {
    if (!roomId) return

    // Find room in available rooms
    let room = availableRooms.value.find(r => r.id === roomId)

    // If room not in list, try to load it from API
    if (!room) {
      logger.info('[GeneralChat] Room not in cache, refreshing room list')
      await loadRooms()
      room = availableRooms.value.find(r => r.id === roomId)
    }

    // If still not found, create a placeholder
    if (!room) {
      logger.warn('[GeneralChat] Room not found, creating placeholder')
      room = { id: roomId, name: 'Чат' }
    }

    await joinRoom(room)
  }

  /**
   * Refresh room list and optionally switch to a specific room
   */
  async function refreshRooms(roomIdToJoin = null) {
    await loadRooms()

    if (roomIdToJoin) {
      await switchRoom(roomIdToJoin)
    }
  }

  /**
   * Send message
   */
  async function sendMessage() {
    if (!newMessage.value.trim() || !activeChat.id) return

    const messageText = newMessage.value.trim()
    newMessage.value = ''

    try {
      // Send to API (authorId will be extracted from Integram token by backend)
      const response = await generalChatService.sendMessage(activeChat.id, {
        text: messageText
      })

      const sentMessage = response.data

      // Message will be added via WebSocket broadcast from backend
      // Don't add locally to avoid duplicates

      logger.info('[GeneralChat] Message sent:', sentMessage.id)
    } catch (error) {
      logger.error('[GeneralChat] Failed to send message:', error)

      // Show error toast
      if (toast) {
        toast.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: error.response?.data?.error || 'Не удалось отправить сообщение',
          life: 3000
        })
      }

      // Restore message to input
      newMessage.value = messageText
    }
  }

  /**
   * Delete message
   */
  async function deleteMessage(messageId) {
    if (!activeChat.id) return

    try {
      await generalChatService.deleteMessage(activeChat.id, messageId)

      // Message will be removed via WebSocket broadcast from backend
      logger.info('[GeneralChat] Message deleted:', messageId)
    } catch (error) {
      logger.error('[GeneralChat] Failed to delete message:', error)

      // Show error (if toast available)
      if (toast) {
        toast.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: error.response?.data?.error || 'Не удалось удалить сообщение',
          life: 3000
        })
      }
    }
  }

  // ==================== WebSocket Methods ====================

  /**
   * Initialize WebSocket connection
   */
  function initWebSocket() {
    generalChatService.connectWebSocket()

    // Handle connection events
    generalChatService.on('connected', () => {
      isConnected.value = true
      logger.info('[GeneralChat] WebSocket connected')

      // Rejoin current room if any
      if (activeChat.id) {
        generalChatService.joinRoom(activeChat.id, currentUserId.value, 'User')
      }
    })

    // Handle new messages
    generalChatService.on('generalchat:new-message', (data) => {
      const message = data.message

      // Add message to chat (including our own messages from WebSocket)
      const formattedMessage = formatMessage(message)
      activeChat.messages.push(formattedMessage)

      // Sort messages by timestamp to maintain correct order
      sortMessages()

      logger.debug('[GeneralChat] New message received:', message.id)
    })

    // Handle user joined
    generalChatService.on('generalchat:user-joined', (data) => {
      logger.info('[GeneralChat] User joined:', data.userName)

      // Show notification (optional)
      if (toast && data.userId !== currentUserId.value) {
        toast.add({
          severity: 'info',
          summary: 'Пользователь присоединился',
          detail: data.userName || 'Новый пользователь',
          life: 2000
        })
      }
    })

    // Handle user left
    generalChatService.on('generalchat:user-left', (data) => {
      logger.info('[GeneralChat] User left:', data.userName)
    })

    // Handle typing indicator
    generalChatService.on('generalchat:typing', (data) => {
      if (data.userId === currentUserId.value) return

      if (data.isTyping) {
        if (!typingUsers.value.includes(data.userName)) {
          typingUsers.value.push(data.userName)
        }
      } else {
        typingUsers.value = typingUsers.value.filter(u => u !== data.userName)
      }
    })

    // Handle message updated
    generalChatService.on('generalchat:message-updated', (data) => {
      const message = data.message
      // Convert both IDs to strings for comparison (type-safe)
      const messageIdStr = String(message.id)
      const index = activeChat.messages.findIndex(m => String(m.id) === messageIdStr)
      if (index !== -1) {
        activeChat.messages[index] = formatMessage(message)
        logger.debug('[GeneralChat] Message updated:', message.id)
      }
    })

    // Handle message deleted
    generalChatService.on('generalchat:message-deleted', (data) => {
      // Convert both IDs to strings for comparison (type-safe)
      const messageIdStr = String(data.messageId)
      const index = activeChat.messages.findIndex(m => String(m.id) === messageIdStr)
      if (index !== -1) {
        activeChat.messages.splice(index, 1)
        logger.debug('[GeneralChat] Message deleted:', data.messageId)
      }
    })
  }

  /**
   * Send typing indicator
   */
  let typingTimeout = null
  function handleTyping() {
    generalChatService.sendTyping(true)

    // Clear existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout)
    }

    // Stop typing after 3 seconds
    typingTimeout = setTimeout(() => {
      generalChatService.sendTyping(false)
    }, 3000)
  }

  // ==================== Lifecycle ====================

  /**
   * Initialize general chat
   */
  async function init() {
    logger.info('[GeneralChat] Initializing...')

    // Load rooms
    const rooms = await loadRooms()

    // If no rooms, create default room
    let defaultRoom = null
    if (rooms.length === 0) {
      logger.info('[GeneralChat] No rooms found, creating default room')
      defaultRoom = await createDefaultRoom()
      if (defaultRoom) {
        availableRooms.value.push(defaultRoom)
      }
    } else {
      // Use first room
      defaultRoom = rooms[0]
    }

    // Join default room
    if (defaultRoom) {
      await joinRoom(defaultRoom)
    }

    // Initialize WebSocket
    initWebSocket()

    logger.info('[GeneralChat] Initialized successfully')
  }

  /**
   * Cleanup on unmount
   */
  onUnmounted(() => {
    generalChatService.disconnect()
    if (typingTimeout) {
      clearTimeout(typingTimeout)
    }
  })

  // ==================== Return Public API ====================

  return {
    // State
    activeChat,
    newMessage,
    availableRooms,
    loadingRooms,
    loadingMessages,
    typingUsers,
    isConnected,

    // Computed
    typingIndicator: computed(() => {
      if (typingUsers.value.length === 0) return ''
      if (typingUsers.value.length === 1) return `${typingUsers.value[0]} печатает...`
      return `${typingUsers.value.length} пользователей печатают...`
    }),

    // Methods
    init,
    loadRooms,
    createDefaultRoom,
    joinRoom,
    switchRoom,
    refreshRooms,
    sendMessage,
    deleteMessage,
    handleTyping
  }
}
