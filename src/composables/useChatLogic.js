/**
 * useChatLogic.js - Shared chat logic for Chat.vue and ChatPage.vue
 *
 * This composable extracts all shared business logic from both components,
 * following the DRY (Don't Repeat Yourself) principle.
 *
 * Both Chat.vue (sidebar) and ChatPage.vue (fullscreen) use the same core logic,
 * differing only in UI presentation (layout, styling, TabView vs sidebar).
 */

import { ref, reactive, computed, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { logger } from '@/utils/logger'
import { getApiUrl } from '@/utils/apiConfig'
import apiClient from '@/axios2.js'
import polzaService from '@/services/polzaService.js'
import { integramChatSessionService } from '@/services/integramChatSessionService.js'
import integramApiClient from '@/services/integramApiClient.js'
import {
  searchWeb,
  executeCode as executeCodeAPI,
  extractCodeBlocks,
  hasExecutableCode,
  formatSearchResults,
  getAgentSystemPrompt
} from '@/services/chatAgentService'
import {
  createWorkspace,
  getUserWorkspaces,
  deleteWorkspace,
  chatWithWorkspace
} from '@/services/workspaceService'
import integraMCPService from '@/services/integraMCPService'
import { innAnalyticsService } from '@/services/innAnalyticsService'
import { egrulService } from '@/services/egrulService'
import { vatCalculatorService } from '@/services/vatCalculatorService'
import { fsspService } from '@/services/fsspService'
import { parseHHRequest, processHHRequest as processHHRequestService } from '@/services/hhAgentService'
import { useAuthStore } from '@/stores/authStore'
import { useGeneralChat } from '@/composables/useGeneralChat'

export function useChatLogic() {
  const router = useRouter()
  const route = useRoute()

  // ==================== Authentication ====================
  let authStore
  try {
    authStore = useAuthStore()
  } catch (error) {
    console.warn('[useChatLogic] Pinia not ready, deferring authStore access:', error.message)
    authStore = null
  }

  const currentUserId = computed(() => {
    if (authStore?.unifiedSession?.userId) {
      const userId = authStore.unifiedSession.userId
      return typeof userId === 'string' ? parseInt(userId, 10) : userId
    }
    if (authStore?.primaryUserId) {
      const userId = authStore.primaryUserId
      return typeof userId === 'string' ? parseInt(userId, 10) : userId
    }
    const storedId = localStorage.getItem('id')
    if (storedId) {
      return parseInt(storedId, 10)
    }
    return null // fallback
  })

  // ==================== General Chat Integration ====================
  let generalChat
  try {
    const generalChatComposable = useGeneralChat(currentUserId)
    // Wrap in reactive() to auto-unwrap nested refs in templates
    generalChat = reactive(generalChatComposable)
  } catch (error) {
    console.error('[useChatLogic] Failed to initialize generalChat:', error)
    generalChat = null
  }

  // Fallback if generalChat is undefined or null
  if (!generalChat) {
    console.warn('[useChatLogic] generalChat is undefined, using fallback')
    generalChat = reactive({
      activeChat: { id: null, name: 'Загрузка...', messages: [] },
      newMessage: '',
      availableRooms: [],
      loadingRooms: false,
      loadingMessages: false,
      typingUsers: [],
      isConnected: false,
      typingIndicator: computed(() => ''),
      init: async () => { console.warn('[GeneralChat] Init skipped - using fallback') },
      loadRooms: async () => { console.warn('[GeneralChat] LoadRooms skipped'); return [] },
      createDefaultRoom: async () => { console.warn('[GeneralChat] CreateDefaultRoom skipped'); return null },
      joinRoom: async () => { console.warn('[GeneralChat] JoinRoom skipped') },
      sendMessage: async () => { console.warn('[GeneralChat] SendMessage skipped - general chat unavailable') },
      handleTyping: () => {}
    })
  }

  // ==================== State Management ====================

  // UI State
  const activeTabIndex = ref(0)
  const showHistory = ref(false)
  const showImageDialog = ref(false)
  const showSettings = ref(false)
  const showTools = ref(false)
  const showAgentsList = ref(false)
  const showDataSelector = ref(false)
  const showCreateWorkspaceDialog = ref(false)
  const showIntegraMCPAuth = ref(false)
  const showEditMessageDialog = ref(false)
  const showCodeExecutionWindow = ref(false)
  const isRecording = ref(false)
  const uploadProgress = ref(0)
  const currentImage = ref('')

  // Refs for file inputs and menus
  const fileInput = ref(null)
  const fileInputGeneral = ref(null)
  const modalFileInput = ref(null)
  const attachmentMenu = ref(null)
  const attachmentMenuGeneral = ref(null)
  const modalAttachmentMenu = ref(null)

  // Container refs (to be bound in components)
  const aiMessagesContainer = ref(null)
  const messagesContainer = ref(null)
  const modalMessagesContainer = ref(null)

  // Model selection - read from ModelSelector's preference format
  // First try app-specific key, then legacy key, then default to Polza Claude
  const loadInitialModelAndProvider = () => {
    // Try unified Chat preference (used by ModelSelector in both sidebar and page)
    const chatPref = localStorage.getItem('modelPreference_Chat')
    if (chatPref) {
      try {
        const parsed = JSON.parse(chatPref)
        if (parsed.preferredModelId && parsed.preferredProvider) {
          console.log('[useChatLogic] Loaded from Chat preference:', parsed)
          return {
            model: parsed.preferredModelId,
            provider: parsed.preferredProvider
          }
        }
      } catch (e) {
        console.warn('[useChatLogic] Failed to parse Chat preference:', e)
      }
    }

    // Fallback: try legacy ChatPage key
    const chatPagePref = localStorage.getItem('modelPreference_ChatPage')
    if (chatPagePref) {
      try {
        const parsed = JSON.parse(chatPagePref)
        if (parsed.preferredModelId && parsed.preferredProvider) {
          console.log('[useChatLogic] Loaded from legacy ChatPage preference:', parsed)
          // Migrate to new unified key
          localStorage.setItem('modelPreference_Chat', chatPagePref)
          return {
            model: parsed.preferredModelId,
            provider: parsed.preferredProvider
          }
        }
      } catch (e) {
        console.warn('[useChatLogic] Failed to parse ChatPage preference:', e)
      }
    }
    // Try legacy key
    const legacy = localStorage.getItem('selectedModel')
    if (legacy) {
      console.log('[useChatLogic] Loaded from legacy key:', legacy)
      // Try to determine provider from model ID
      const provider = legacy.includes('claude') ? 'polza' :
                       legacy.includes('deepseek') ? 'deepseek' :
                       legacy.includes('gpt') ? 'openai' : 'polza'
      return { model: legacy, provider }
    }
    // Default: Polza Claude Sonnet 4.5
    console.log('[useChatLogic] Using default: Polza + Claude Sonnet 4.5')
    return {
      model: 'anthropic/claude-sonnet-4.5',
      provider: 'polza'
    }
  }

  const initialSelection = loadInitialModelAndProvider()
  const selectedModel = ref(initialSelection.model)
  const selectedProvider = ref(initialSelection.provider)
  const userAccessToken = ref(localStorage.getItem('userAccessToken') || null)

  // LLM Settings
  const llmSettings = reactive({
    contextSize: parseInt(localStorage.getItem('llm_contextSize')) || 8192,
    gpuLayers: parseInt(localStorage.getItem('llm_gpuLayers')) || 100,
    temperature: parseFloat(localStorage.getItem('llm_temperature')) || 0.6,
    topK: parseInt(localStorage.getItem('llm_topK')) || 40,
    topP: parseFloat(localStorage.getItem('llm_topP')) || 0.9,
    minP: parseFloat(localStorage.getItem('llm_minP')) || 0.1,
    repeatLastN: parseInt(localStorage.getItem('llm_repeatLastN')) || 64,
    repeatPenalty: parseFloat(localStorage.getItem('llm_repeatPenalty')) || 1.0,
    presencePenalty: parseFloat(localStorage.getItem('llm_presencePenalty')) || 0.0,
    frequencyPenalty: parseFloat(localStorage.getItem('llm_frequencyPenalty')) || 0.0,
    customTemplate: localStorage.getItem('llm_customTemplate') || '',
    tensorBufferType: localStorage.getItem('llm_tensorBufferType') || '',
    disableKVOffload: localStorage.getItem('llm_disableKVOffload') === 'true',
    batchSize: parseInt(localStorage.getItem('llm_batchSize')) || 512,
    customSystemPrompt: localStorage.getItem('llm_customSystemPrompt') || '',
  })

  // Tools configuration
  const toolsConfig = reactive({
    mcpEnabled: localStorage.getItem('tools_mcpEnabled') !== 'false',
    agentsEnabled: localStorage.getItem('tools_agentsEnabled') !== 'false',
    searchEnabled: localStorage.getItem('tools_searchEnabled') !== 'false',
    webBrowsingEnabled: localStorage.getItem('tools_webBrowsingEnabled') === 'true',
    codeInterpreterEnabled: localStorage.getItem('tools_codeInterpreterEnabled') === 'true',
    integramDatabaseEnabled: localStorage.getItem('tools_integramDatabaseEnabled') !== 'false', // Integram MCP enabled by default
    innAgentEnabled: localStorage.getItem('tools_innAgentEnabled') !== 'false', // INN Agent enabled by default
    egrulAgentEnabled: localStorage.getItem('tools_egrulAgentEnabled') !== 'false', // EGRUL Agent enabled by default
    vatAgentEnabled: localStorage.getItem('tools_vatAgentEnabled') !== 'false', // VAT Calculator Agent enabled by default
    fsspAgentEnabled: localStorage.getItem('tools_fsspAgentEnabled') !== 'false', // FSSP Agent enabled by default
    hhAgentEnabled: localStorage.getItem('tools_hhAgentEnabled') !== 'false', // HeadHunter Agent enabled by default
    codeAnalyzerAgentEnabled: localStorage.getItem('tools_codeAnalyzerAgentEnabled') !== 'false', // Code Analyzer Agent enabled by default
    devHelperAgentEnabled: localStorage.getItem('tools_devHelperAgentEnabled') !== 'false', // Dev Helper Agent enabled by default
    supportAgentEnabled: localStorage.getItem('tools_supportAgentEnabled') !== 'false', // Customer Support Agent enabled by default
    onecAgentEnabled: localStorage.getItem('tools_onecAgentEnabled') !== 'false', // 1C Agent enabled by default
    salesAgentEnabled: localStorage.getItem('tools_salesAgentEnabled') !== 'false', // Sales Agent enabled by default
  })

  // Agent mode
  const agentMode = ref(localStorage.getItem('chat_agentMode') === 'true')
  const deepAgentEnabled = ref(localStorage.getItem('chat_deepAgent') === 'true')

  // Running agents tracking (for UI indication)
  const runningAgents = ref([]) // Array of { name, startTime, status }

  // Chat state
  const aiChat = reactive({
    messages: JSON.parse(localStorage.getItem('aiChat')) || [
      {
        text: 'Ты цифровой помощник. Отвечаешь кратко и по существу. Анализируешь JSON в которых таблицы в формате:Работаем с таблицей: headers (id,value,type,isMain) определяют колонки, rows (id,values) содержат ячейки с headerId для связи данных.',
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        isUser: true,
      },
      {
        text: 'Здравствуйте! Я цифровой помощник DronDoc.\nЯ могу анализировать таблицы и отчёты, отвечать на вопросы и т.д.\nЧем могу помочь?',
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        isUser: false,
        isSystemGreeting: true, // Skip in conversationHistory
      },
    ],
  })

  // Use general chat state from useGeneralChat composable
  const activeChat = generalChat.activeChat
  const newMessage = generalChat.newMessage

  const aiMessage = ref('')
  const aiLoading = ref(false)
  const aiError = ref(null)
  const assistantMessage = ref(null)
  const currentAttachments = ref([])

  // Session management
  const polzaSessionId = ref(null)
  const isApiAvailable = ref(false)
  // sessionHistory removed - using unified savedChats system for both Chat.vue and ChatPage.vue
  const loadingHistory = ref(false)

  // Message editing
  const editingMessageIndex = ref(null)
  const editingMessageText = ref('')

  // Voice recognition
  const recognition = ref(null)

  // Workspace management
  const workspaces = ref([])
  const selectedWorkspace = ref(null)
  const loadingWorkspaces = ref(false)
  const creatingWorkspace = ref(false)
  const createWorkspaceError = ref(null)
  const newWorkspace = reactive({
    name: '',
    repositoryUrl: '',
    branch: 'main'
  })

  // Integram MCP state
  const integraMCPState = reactive({
    isAuthenticated: false,
    serverURL: '',
    database: '',
    username: '',
    userId: null
  })

  const integramAuthForm = reactive({
    serverURL: 'https://dronedoc.ru',
    database: 'my',
    login: '',
    password: ''
  })

  const integramAuthLoading = ref(false)
  const integramAuthError = ref(null)

  // Code execution
  const codeExecutions = ref([])

  // Data selector
  const selectedDataType = ref(null)
  const selectedDataItem = ref(null)
  const dataComment = ref('')
  const loadingDataItems = ref(false)
  const dataItems = ref([])
  const dataTypes = ref([
    { label: 'Таблица Integram', value: 'integram_table' },
    { label: 'Отчёт Integram', value: 'integram_report' }
  ])

  // Chat management
  const savedChats = ref(JSON.parse(localStorage.getItem('savedChats') || '[]'))
  const newChatName = ref('')

  // API configuration - UNIFIED CHAT ENDPOINT
  const CHAT_API_URL = '/api/chat' // Single entry point, routes to all providers via coordinator
  const SYSTEM_PROMPT = 'Ты - полезный ассистент DronDoc. Отвечаешь кратко и по существу. Анализируешь JSON в которых таблицы в формате: Работаем с таблицей: headers (id,value,type,isMain) определяют колонки, rows (id,values) содержат ячейки с headerId для связи данных.'

  // ==================== Computed Properties ====================

  const isEditorPage = computed(() => route.path.startsWith('/editor'))

  // ==================== Watchers ====================

  // Note: Model/provider preferences are saved by ModelSelector component
  // useChatLogic only reads from localStorage on init, ModelSelector handles saving
  watch(selectedModel, (newVal) => {
    // Only save to legacy key for backward compatibility
    localStorage.setItem('selectedModel', newVal)
  })

  watch(llmSettings, (newVal) => {
    Object.keys(newVal).forEach(key => {
      localStorage.setItem(`llm_${key}`, String(newVal[key]))
    })
  }, { deep: true })

  watch(toolsConfig, (newVal) => {
    Object.keys(newVal).forEach(key => {
      localStorage.setItem(`tools_${key}`, String(newVal[key]))
    })
  }, { deep: true })

  watch(agentMode, (newVal) => {
    localStorage.setItem('chat_agentMode', String(newVal))
    if (newVal) {
      loadWorkspaces()
    }
  })

  watch(deepAgentEnabled, (newVal) => {
    localStorage.setItem('chat_deepAgent', String(newVal))
  })

  watch(aiChat, () => {
    localStorage.setItem('aiChat', JSON.stringify(aiChat.messages))
  }, { deep: true })

  // ==================== Helper Functions ====================

  const isSystemMessage = (msg) => {
    return msg.text && msg.text.includes('Ты цифровой помощник') && msg.isUser
  }

  const getCombinedSystemPrompt = () => {
    let combined = SYSTEM_PROMPT

    // Add information about enabled agents/tools
    const enabledAgents = []
    if (toolsConfig.innAgentEnabled) {
      enabledAgents.push('INN Analytics Agent (автоматический поиск данных по ИНН компаний)')
    }
    if (toolsConfig.egrulAgentEnabled) {
      enabledAgents.push('EGRUL Parser Agent (официальные данные из ЕГРЮЛ ФНС по ИНН/ОГРН/названию)')
    }
    if (toolsConfig.codeInterpreterEnabled) {
      enabledAgents.push('Code Interpreter (выполнение Python кода)')
    }
    if (toolsConfig.webBrowsingEnabled) {
      enabledAgents.push('Web Browsing (получение актуальной информации из интернета)')
    }
    if (toolsConfig.integramDatabaseEnabled) {
      enabledAgents.push('Integram Database (работа с таблицами Integram через MCP)')
    }
    if (toolsConfig.mcpEnabled) {
      enabledAgents.push('MCP Tools (Model Context Protocol серверы)')
    }
    if (toolsConfig.searchEnabled) {
      enabledAgents.push('Search Tools (поиск в интернете)')
    }
    if (toolsConfig.agentsEnabled) {
      enabledAgents.push('General Agents (агентная система)')
    }

    if (enabledAgents.length > 0) {
      combined += '\n\nПодключённые агенты и инструменты:\n' + enabledAgents.map(a => `- ${a}`).join('\n')
      combined += '\n\nКогда пользователь спрашивает про агентов или инструменты, сообщи какие агенты сейчас подключены из этого списка.'

      // Add specific usage instructions for Integram Database
      if (toolsConfig.integramDatabaseEnabled) {
        combined += '\n\nВАЖНО: Когда пользователь спрашивает про таблицы, базу данных, данные в Integram - ОБЯЗАТЕЛЬНО используй MCP инструменты:'
        combined += '\n- integram_get_dictionary - получить список всех таблиц'
        combined += '\n- integram_get_type_metadata - получить структуру таблицы (колонки, типы)'
        combined += '\n- integram_get_object_list - получить данные из таблицы'
        combined += '\n- integram_get_all_objects - получить ВСЕ объекты из таблицы'
        combined += '\nНИКОГДА не выдумывай данные о таблицах - всегда используй реальные данные через MCP!'
      }
    }

    if (llmSettings.customSystemPrompt && llmSettings.customSystemPrompt.trim()) {
      combined += '\n\n' + llmSettings.customSystemPrompt.trim()
    }

    // Debug logging
    console.log('[getCombinedSystemPrompt] toolsConfig:', { ...toolsConfig })
    console.log('[getCombinedSystemPrompt] enabledAgents:', enabledAgents)
    console.log('[getCombinedSystemPrompt] Final prompt length:', combined.length)

    // Save to window for debugging
    if (typeof window !== 'undefined') {
      window.__lastSystemPrompt = combined
    }

    return combined
  }

  const scrollToBottom = (container) => {
    nextTick(() => {
      if (container?.value) {
        container.value.scrollTop = container.value.scrollHeight
      }
    })
  }

  const isImage = (attachment) => {
    if (!attachment) return false
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
    const name = attachment.name || attachment.url || ''
    return imageExts.some(ext => name.toLowerCase().endsWith(ext))
  }

  const getAttachmentIcon = (attachment) => {
    if (!attachment) return 'pi pi-file'
    const name = attachment.name || attachment.url || ''
    if (name.endsWith('.pdf')) return 'pi pi-file-pdf'
    if (name.endsWith('.doc') || name.endsWith('.docx')) return 'pi pi-file-word'
    if (name.endsWith('.xls') || name.endsWith('.xlsx')) return 'pi pi-file-excel'
    return 'pi pi-file'
  }

  const getAttachmentDisplayName = (attachment) => {
    if (!attachment) return 'Файл'
    return attachment.name || attachment.id || 'Файл'
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const getWorkspaceName = (id) => {
    const ws = workspaces.value.find(w => w.id === id)
    return ws ? ws.name : id
  }

  const getWorkspaceRepo = (id) => {
    const ws = workspaces.value.find(w => w.id === id)
    return ws ? (ws.repositoryUrl || 'Не указан') : 'Не указан'
  }

  // ==================== Model Selection ====================

  const handleModelChange = ({ modelId, model }) => {
    logger.debug('Model changed:', { modelId, model })
    selectedModel.value = modelId

    // Update provider when model changes
    if (model && model.provider_name) {
      selectedProvider.value = model.provider_name
      logger.debug('Provider updated to:', model.provider_name)
    }

    localStorage.setItem('selectedModel', modelId)
  }

  const handleDeepAgentToggle = () => {
    logger.debug('Deep Agent toggled:', deepAgentEnabled.value)
  }

  // ==================== API Health Check ====================

  const checkPolzaHealth = async () => {
    // NOTE: Unified /api/chat is stateless and always available
    // No need for health check - just assume API is ready
    logger.info('[checkPolzaHealth] Unified API always available (stateless)')
    isApiAvailable.value = true
    return true
  }

  // ==================== Demo Response Generator ====================

  const generateDemoResponse = (userMessage, model) => {
    const message = userMessage.toLowerCase()

    if (message.includes('привет') || message.includes('hello') || message.includes('добр')) {
      return `Привет! Я работаю в демо-режиме на базе ${model}. В полной версии я смогу помочь вам с анализом данных, таблиц и отчётов. Пока что это просто демонстрация интерфейса!`
    }

    if (message.includes('помощь') || message.includes('help') || message.includes('что умеешь')) {
      return `Я - демо-версия ИИ-ассистента DronDoc на базе ${model}. В полной версии я умею:
• Анализировать таблицы и JSON данные
• Создавать отчёты и документацию
• Отвечать на вопросы по бизнес-процессам
• Помогать с интеграцией систем
• Работать с дронными данными

Пока это демо-режим, но интерфейс уже полностью готов!`
    }

    if (message.includes('таблиц') || message.includes('json') || message.includes('данные')) {
      return `Отлично! Я вижу, что вас интересует работа с данными. В полной версии на базе ${model} я смогу:
• Анализировать структуру таблиц (headers: id,value,type,isMain)
• Обрабатывать строки данных (rows: id,values с headerId)
• Создавать сводки и отчёты
• Находить паттерны в данных

Сейчас это демо, но функциональность уже интегрирована!`
    }

    if (message.includes('отчёт') || message.includes('report') || message.includes('анализ')) {
      return `Готов помочь с отчётами! В полной версии ${model} я создам для вас:
• Аналитические отчёты по данным дронов
• Сводки по бизнес-метрикам
• Документацию по процессам
• Презентации результатов

Пока это демонстрация возможностей. API интеграция готова!`
    }

    if (message.includes('спасиб') || message.includes('thanks')) {
      return `Пожалуйста! Рад, что демо-интерфейс работает. Когда Polza.ai API будет доступен, ${model} сможет полноценно отвечать на ваши запросы. Следите за обновлениями!`
    }

    const responses = [
      `Интересный вопрос! В полной версии на базе ${model} я дам вам подробный ответ. Пока это демо-режим - API интеграция готова, но сервис временно недоступен.`,
      `Понял ваш запрос. Когда ${model} будет доступен, я смогу предоставить детальную информацию. Сейчас демонстрирую возможности интерфейса.`,
      `Хороший вопрос! В рабочей версии я помогу с анализом. Сейчас показываю, как будет выглядеть общение с ИИ-ассистентом.`,
      `Спасибо за сообщение! ${model} в полной версии сможет помочь с такими задачами. Пока это демо готовой системы.`
    ]

    return responses[Math.floor(Math.random() * responses.length)]
  }

  // ==================== Main Chat Functions ====================

  // Use sendMessage from generalChat composable
  const sendMessage = async () => {
    await generalChat.sendMessage()
    scrollToBottom(messagesContainer)
  }

  // ========== INN Agent Integration ==========

  /**
   * Call INN Agent to fetch company data by INN
   * @param {string} inn - INN number (10 or 12 digits)
   * @returns {Promise<Object>} Company data or error
   */
  const callINNAgent = async (inn) => {
    const agentName = 'INN Analytics Agent'

    try {
      // Track agent start
      runningAgents.value.push({
        name: agentName,
        startTime: Date.now(),
        status: 'running'
      })

      logger.debug(`[INN Agent] Starting search for INN: ${inn}`)

      // Call the agent service
      const result = await innAnalyticsService.getCompanyByINN(inn)

      // Update agent status
      const agentIndex = runningAgents.value.findIndex(a => a.name === agentName && a.status === 'running')
      if (agentIndex !== -1) {
        runningAgents.value[agentIndex].status = result.success ? 'completed' : 'failed'
        runningAgents.value[agentIndex].endTime = Date.now()

        // Auto-remove completed/failed agents after 5 seconds
        setTimeout(() => {
          const idx = runningAgents.value.findIndex(a => a.name === agentName && a.endTime === runningAgents.value[agentIndex].endTime)
          if (idx !== -1) {
            runningAgents.value.splice(idx, 1)
          }
        }, 5000)
      }

      return result
    } catch (error) {
      logger.error('[INN Agent] Error:', error)

      // Update agent status to failed
      const agentIndex = runningAgents.value.findIndex(a => a.name === agentName && a.status === 'running')
      if (agentIndex !== -1) {
        runningAgents.value[agentIndex].status = 'failed'
        runningAgents.value[agentIndex].endTime = Date.now()
        runningAgents.value[agentIndex].error = error.message

        // Auto-remove failed agents after 5 seconds
        setTimeout(() => {
          const idx = runningAgents.value.findIndex(a => a.name === agentName && a.endTime === runningAgents.value[agentIndex].endTime)
          if (idx !== -1) {
            runningAgents.value.splice(idx, 1)
          }
        }, 5000)
      }

      return {
        success: false,
        error: error.message || 'Ошибка при получении данных по ИНН',
        data: null
      }
    }
  }

  /**
   * Check if message contains INN request and process it
   * @param {string} message - User message
   * @returns {Promise<string|null>} Agent response or null if no INN found
   */
  const processINNRequest = async (message) => {
    // INN Agent works independently of agentMode (utility agent)
    if (!toolsConfig.innAgentEnabled) {
      return null
    }

    // Extract INN from message (10 or 12 digits)
    const innMatch = message.match(/\b(\d{10}|\d{12})\b/)

    if (!innMatch) {
      return null
    }

    const inn = innMatch[1]
    logger.debug(`[INN Agent] Found INN in message: ${inn}`)

    // Call agent
    const result = await callINNAgent(inn)

    if (!result.success) {
      return `❌ Ошибка поиска по ИНН ${inn}: ${result.error}`
    }

    // Format company data for display
    const company = result.data.company
    let response = `🔍 **Данные по ИНН ${inn}:**\n\n`
    response += `📋 **Название:** ${company.name || 'Н/Д'}\n`
    response += `🏢 **Тип:** ${company.entityType || 'Н/Д'}\n`
    response += `📝 **ОГРН:** ${company.ogrn || 'Н/Д'}\n`

    if (company.kpp) {
      response += `🔢 **КПП:** ${company.kpp}\n`
    }

    response += `📅 **Дата регистрации:** ${company.registrationDate || 'Н/Д'}\n`
    response += `📍 **Адрес:** ${company.address || 'Н/Д'}\n`

    if (company.okved) {
      response += `💼 **ОКВЭД:** ${company.okved}\n`
    }

    response += `\n✅ *Источник: ${company.source}*`

    return response
  }

  // ========== Web Search Agent Integration ==========

  /**
   * Call Web Search Agent to search the internet
   * @param {string} query - Search query
   * @returns {Promise<Object>} Search results or error
   */
  const callSearchAgent = async (query) => {
    const agentName = 'Web Search Agent'

    try {
      // Track agent start
      runningAgents.value.push({
        name: agentName,
        startTime: Date.now(),
        status: 'running'
      })

      logger.debug(`[Search Agent] Starting search for: ${query}`)

      // Call the search service
      const result = await searchWeb(query)

      // Update agent status
      const agentIndex = runningAgents.value.findIndex(a => a.name === agentName && a.status === 'running')
      if (agentIndex !== -1) {
        runningAgents.value[agentIndex].status = 'completed'
        runningAgents.value[agentIndex].endTime = Date.now()

        // Auto-remove completed agents after 5 seconds
        setTimeout(() => {
          const idx = runningAgents.value.findIndex(a => a.name === agentName && a.endTime === runningAgents.value[agentIndex].endTime)
          if (idx !== -1) {
            runningAgents.value.splice(idx, 1)
          }
        }, 5000)
      }

      return {
        success: true,
        data: result
      }
    } catch (error) {
      logger.error('[Search Agent] Error:', error)

      // Update agent status to failed
      const agentIndex = runningAgents.value.findIndex(a => a.name === agentName && a.status === 'running')
      if (agentIndex !== -1) {
        runningAgents.value[agentIndex].status = 'failed'
        runningAgents.value[agentIndex].endTime = Date.now()
        runningAgents.value[agentIndex].error = error.message

        // Auto-remove failed agents after 5 seconds
        setTimeout(() => {
          const idx = runningAgents.value.findIndex(a => a.name === agentName && a.endTime === runningAgents.value[agentIndex].endTime)
          if (idx !== -1) {
            runningAgents.value.splice(idx, 1)
          }
        }, 5000)
      }

      return {
        success: false,
        error: error.message || 'Ошибка при поиске в интернете',
        data: null
      }
    }
  }

  /**
   * Check if message contains web search request and process it
   * Triggers: "найди в интернете <query>", "поиск <query>", "search <query>", "загугли <query>"
   * @param {string} message - User message
   * @returns {Promise<string|null>} Agent response or null if no search request found
   */
  const processSearchRequest = async (message) => {
    if (!toolsConfig.searchEnabled) {
      return null
    }

    // Check for search trigger keywords (case-insensitive)
    const searchTriggers = /(найди в интернете|поиск в интернете|загугли|search|веб.?поиск|искать в сети)\s+(.+)/i
    const match = message.match(searchTriggers)

    if (!match) {
      return null
    }

    const query = match[2].trim()
    logger.debug(`[Search Agent] Found search request: ${query}`)

    // Call agent
    const result = await callSearchAgent(query)

    if (!result.success) {
      return `❌ Ошибка поиска: ${result.error}`
    }

    // Format search results
    return formatSearchResults(result.data)
  }

  // ========== VAT Calculator Agent Integration ==========

  /**
   * Call VAT Calculator Agent to calculate Russian VAT
   * @param {Object} request - Parsed VAT request from vatCalculatorService
   * @returns {Promise<Object>} Calculation result
   */
  const callVatAgent = async (request) => {
    const agentName = 'VAT Calculator Agent'

    try {
      // Track agent start
      runningAgents.value.push({
        name: agentName,
        startTime: Date.now(),
        status: 'running'
      })

      logger.debug(`[VAT Agent] Calculating VAT:`, request)

      // Calculate VAT using service
      const result = vatCalculatorService.calculateVat(request)

      // Update agent status
      const agentIndex = runningAgents.value.findIndex(a => a.name === agentName && a.status === 'running')
      if (agentIndex !== -1) {
        runningAgents.value[agentIndex].status = result.success ? 'completed' : 'failed'
        runningAgents.value[agentIndex].endTime = Date.now()

        // Auto-remove completed/failed agents after 5 seconds
        setTimeout(() => {
          const idx = runningAgents.value.findIndex(a => a.name === agentName && a.endTime === runningAgents.value[agentIndex].endTime)
          if (idx !== -1) {
            runningAgents.value.splice(idx, 1)
          }
        }, 5000)
      }

      return result
    } catch (error) {
      logger.error('[VAT Agent] Error:', error)

      // Update agent status to failed
      const agentIndex = runningAgents.value.findIndex(a => a.name === agentName && a.status === 'running')
      if (agentIndex !== -1) {
        runningAgents.value[agentIndex].status = 'failed'
        runningAgents.value[agentIndex].endTime = Date.now()
        runningAgents.value[agentIndex].error = error.message

        // Auto-remove failed agents after 5 seconds
        setTimeout(() => {
          const idx = runningAgents.value.findIndex(a => a.name === agentName && a.endTime === runningAgents.value[agentIndex].endTime)
          if (idx !== -1) {
            runningAgents.value.splice(idx, 1)
          }
        }, 5000)
      }

      return {
        success: false,
        error: error.message || 'Ошибка при расчёте НДС'
      }
    }
  }

  /**
   * Check if message contains VAT request and process it
   * Triggers: "ндс 100000", "ндс из 120000", "выделить ндс"
   * @param {string} message - User message
   * @returns {Promise<string|null>} Agent response or null if no VAT request found
   */
  const processVatRequest = async (message) => {
    if (!toolsConfig.vatAgentEnabled) {
      return null
    }

    // Parse VAT request from message
    const request = vatCalculatorService.parseVatRequest(message)

    if (!request) {
      return null
    }

    logger.debug(`[VAT Agent] Found VAT request:`, request)

    // Call agent
    const result = await callVatAgent(request)

    // Format and return result
    return vatCalculatorService.formatVatResult(result)
  }

  // ========== FSSP Agent Integration ==========

  /**
   * Call FSSP Agent to check debts by INN
   * @param {string} inn - INN to check
   * @returns {Promise<Object>} Debt check result
   */
  const callFsspAgent = async (inn) => {
    const agentName = 'FSSP Agent'

    try {
      // Track agent start
      runningAgents.value.push({
        name: agentName,
        startTime: Date.now(),
        status: 'running'
      })

      logger.debug(`[FSSP Agent] Checking debts for INN: ${inn}`)

      // Call FSSP service
      const result = await fsspService.searchByINN(inn)

      // Update agent status
      const agentIndex = runningAgents.value.findIndex(a => a.name === agentName && a.status === 'running')
      if (agentIndex !== -1) {
        runningAgents.value[agentIndex].status = result.success ? 'completed' : 'failed'
        runningAgents.value[agentIndex].endTime = Date.now()

        // Auto-remove completed/failed agents after 5 seconds
        setTimeout(() => {
          const idx = runningAgents.value.findIndex(a => a.name === agentName && a.endTime === runningAgents.value[agentIndex].endTime)
          if (idx !== -1) {
            runningAgents.value.splice(idx, 1)
          }
        }, 5000)
      }

      return result
    } catch (error) {
      logger.error('[FSSP Agent] Error:', error)

      // Update agent status to failed
      const agentIndex = runningAgents.value.findIndex(a => a.name === agentName && a.status === 'running')
      if (agentIndex !== -1) {
        runningAgents.value[agentIndex].status = 'failed'
        runningAgents.value[agentIndex].endTime = Date.now()
        runningAgents.value[agentIndex].error = error.message

        // Auto-remove failed agents after 5 seconds
        setTimeout(() => {
          const idx = runningAgents.value.findIndex(a => a.name === agentName && a.endTime === runningAgents.value[agentIndex].endTime)
          if (idx !== -1) {
            runningAgents.value.splice(idx, 1)
          }
        }, 5000)
      }

      return {
        success: false,
        error: error.message || 'Ошибка при проверке долгов в ФССП',
        data: null
      }
    }
  }

  /**
   * Check if message contains FSSP debt check request and process it
   * Triggers: "долги ИНН", "фссп 1234567890", "проверить долги"
   * @param {string} message - User message
   * @returns {Promise<string|null>} Agent response or null if no FSSP request found
   */
  const processFsspRequest = async (message) => {
    if (!toolsConfig.fsspAgentEnabled) {
      return null
    }

    // Parse debt request from message
    const request = fsspService.parseDebtRequest(message)

    if (!request) {
      return null
    }

    logger.debug(`[FSSP Agent] Found debt request:`, request)

    // Call agent
    const result = await callFsspAgent(request.inn)

    // Format and return result
    return fsspService.formatDebtResult(result, request.inn)
  }

  // ========== HeadHunter Agent Integration ==========

  /**
   * Call HH Agent to search vacancies, estimate salaries, or find employers
   * @param {Object} request - Parsed HH request
   * @returns {Promise<string>} Formatted response
   */
  const callHHAgent = async (request) => {
    const agentName = 'HeadHunter Agent'

    try {
      // Track agent start
      runningAgents.value.push({
        name: agentName,
        startTime: Date.now(),
        status: 'running'
      })

      logger.debug(`[HH Agent] Processing request:`, request)

      // Call HH service
      const result = await processHHRequestService(request)

      // Update agent status
      const agentIndex = runningAgents.value.findIndex(a => a.name === agentName && a.status === 'running')
      if (agentIndex !== -1) {
        runningAgents.value[agentIndex].status = 'completed'
        runningAgents.value[agentIndex].endTime = Date.now()

        // Auto-remove completed agents after 5 seconds
        setTimeout(() => {
          const idx = runningAgents.value.findIndex(a => a.name === agentName && a.endTime === runningAgents.value[agentIndex].endTime)
          if (idx !== -1) {
            runningAgents.value.splice(idx, 1)
          }
        }, 5000)
      }

      return result
    } catch (error) {
      logger.error('[HH Agent] Error:', error)

      // Update agent status to failed
      const agentIndex = runningAgents.value.findIndex(a => a.name === agentName && a.status === 'running')
      if (agentIndex !== -1) {
        runningAgents.value[agentIndex].status = 'failed'
        runningAgents.value[agentIndex].endTime = Date.now()
        runningAgents.value[agentIndex].error = error.message

        // Auto-remove failed agents after 5 seconds
        setTimeout(() => {
          const idx = runningAgents.value.findIndex(a => a.name === agentName && a.endTime === runningAgents.value[agentIndex].endTime)
          if (idx !== -1) {
            runningAgents.value.splice(idx, 1)
          }
        }, 5000)
      }

      return `❌ Ошибка HeadHunter Agent: ${error.message}`
    }
  }

  /**
   * Check if message contains HH request and process it
   * Triggers: "вакансии {должность}", "зарплата {должность}", "работодатель {компания}"
   * @param {string} message - User message
   * @returns {Promise<string|null>} Agent response or null if no HH request found
   */
  const processHHAgentRequest = async (message) => {
    if (!toolsConfig.hhAgentEnabled) {
      return null
    }

    // Parse HH request from message
    const request = parseHHRequest(message)

    if (!request) {
      return null
    }

    logger.debug(`[HH Agent] Found HH request:`, request)

    // Call agent
    return await callHHAgent(request)
  }

  // ========== EGRUL Agent Integration ==========

  /**
   * Call EGRUL Agent to fetch official company data from FNS registry
   * @param {string} query - INN, OGRN, or company name
   * @returns {Promise<Object>} Company data or error
   */
  const callEGRULAgent = async (query) => {
    const agentName = 'EGRUL Parser Agent'

    try {
      // Track agent start
      runningAgents.value.push({
        name: agentName,
        startTime: Date.now(),
        status: 'running'
      })

      logger.debug(`[EGRUL Agent] Starting search for: ${query}`)

      // Call the agent service
      const result = await egrulService.getCompanyData(query)

      // Update agent status
      const agentIndex = runningAgents.value.findIndex(a => a.name === agentName && a.status === 'running')
      if (agentIndex !== -1) {
        runningAgents.value[agentIndex].status = result.success ? 'completed' : 'failed'
        runningAgents.value[agentIndex].endTime = Date.now()

        // Auto-remove completed/failed agents after 5 seconds
        setTimeout(() => {
          const idx = runningAgents.value.findIndex(a => a.name === agentName && a.endTime === runningAgents.value[agentIndex].endTime)
          if (idx !== -1) {
            runningAgents.value.splice(idx, 1)
          }
        }, 5000)
      }

      return result
    } catch (error) {
      logger.error('[EGRUL Agent] Error:', error)

      // Update agent status to failed
      const agentIndex = runningAgents.value.findIndex(a => a.name === agentName && a.status === 'running')
      if (agentIndex !== -1) {
        runningAgents.value[agentIndex].status = 'failed'
        runningAgents.value[agentIndex].endTime = Date.now()
        runningAgents.value[agentIndex].error = error.message

        // Auto-remove failed agents after 5 seconds
        setTimeout(() => {
          const idx = runningAgents.value.findIndex(a => a.name === agentName && a.endTime === runningAgents.value[agentIndex].endTime)
          if (idx !== -1) {
            runningAgents.value.splice(idx, 1)
          }
        }, 5000)
      }

      return {
        success: false,
        error: error.message || 'Ошибка при получении данных из ЕГРЮЛ',
        data: null
      }
    }
  }

  /**
   * Check if message contains EGRUL request and process it
   * Triggers: "егрюл <query>", "егрул <ИНН>", "egrul <query>"
   * @param {string} message - User message
   * @returns {Promise<string|null>} Agent response or null if no EGRUL request found
   */
  const processEGRULRequest = async (message) => {
    // EGRUL Agent works independently of agentMode (utility agent)
    if (!toolsConfig.egrulAgentEnabled) {
      return null
    }

    // Check for EGRUL trigger keywords (case-insensitive)
    // Note: \b doesn't work with Cyrillic, so we use simpler pattern
    const egrulTriggers = /(егрюл|egrul|егрул)\s+(.+)/i
    const match = message.match(egrulTriggers)

    if (!match) {
      return null
    }

    const query = match[2].trim()
    logger.debug(`[EGRUL Agent] Found EGRUL request: ${query}`)

    // Call agent
    const result = await callEGRULAgent(query)

    if (!result.success) {
      return `❌ Ошибка поиска в ЕГРЮЛ: ${result.error}`
    }

    // Return formatted response
    return result.formatted
  }

  // ========== Code Analyzer Agent Integration ==========

  /**
   * Check if message contains code analysis request
   * Triggers: "анализ кода", "проверить код", "код ревью"
   * @param {string} message - User message
   * @returns {Promise<string|null>} Agent response or null
   */
  const processCodeAnalyzerRequest = async (message) => {
    if (!toolsConfig.codeAnalyzerAgentEnabled) {
      return null
    }

    const triggers = /(анализ кода|проверить код|код ревью|code review|analyze code)/i
    if (!triggers.test(message)) {
      return null
    }

    logger.debug('[Code Analyzer Agent] Triggered')

    return `💻 **Code Analyzer Agent**

Я могу помочь с анализом кода! Для полного функционала перейдите на страницу [Code Analyzer](/code-analyzer).

**Возможности:**
• Статический анализ кода
• Поиск уязвимостей
• Проверка стиля кода
• Рекомендации по улучшению

Чтобы использовать агента здесь в чате, просто вставьте код и я его проанализирую.`
  }

  // ========== Dev Helper Agent Integration ==========

  /**
   * Check if message contains dev helper request
   * Triggers: "помощь разработчику", "помощь с кодом"
   * @param {string} message - User message
   * @returns {Promise<string|null>} Agent response or null
   */
  const processDevHelperRequest = async (message) => {
    if (!toolsConfig.devHelperAgentEnabled) {
      return null
    }

    const triggers = /(помощь разработчику|помощь с кодом|dev help|developer help)/i
    if (!triggers.test(message)) {
      return null
    }

    logger.debug('[Dev Helper Agent] Triggered')

    return `🛠️ **Dev Helper Agent**

Готов помочь с разработкой! Подробнее на странице [Dev Helper](/dev-helper).

**Могу помочь с:**
• Генерация кода
• Отладка ошибок
• Рефакторинг
• Написание тестов
• Документация

Задайте ваш вопрос и я помогу!`
  }

  // ========== Customer Support Agent Integration ==========

  /**
   * Check if message contains support request
   * Triggers: "поддержка", "тикет", "жалоба"
   * @param {string} message - User message
   * @returns {Promise<string|null>} Agent response or null
   */
  const processSupportAgentRequest = async (message) => {
    if (!toolsConfig.supportAgentEnabled) {
      return null
    }

    const triggers = /(поддержка клиент|создать тикет|жалоба клиента|customer support|support ticket)/i
    if (!triggers.test(message)) {
      return null
    }

    logger.debug('[Support Agent] Triggered')

    return `🎧 **Customer Support Agent**

Система поддержки клиентов готова! Полный функционал на [Customer Support](/customer-support).

**Возможности:**
• Создание тикетов
• Автоматические ответы
• Приоритизация обращений
• Интеграция с Telegram
• Аналитика обращений

Опишите проблему клиента, и я помогу создать тикет.`
  }

  // ========== 1C Agent Integration ==========

  /**
   * Check if message contains 1C integration request
   * Triggers: "1с", "1c"
   * @param {string} message - User message
   * @returns {Promise<string|null>} Agent response or null
   */
  const processOneCAgentRequest = async (message) => {
    if (!toolsConfig.onecAgentEnabled) {
      return null
    }

    const triggers = /(^|\s)(1с|1c)\s/i
    if (!triggers.test(message)) {
      return null
    }

    logger.debug('[1C Agent] Triggered')

    return `📊 **1C Integration Agent**

Интеграция с 1С:Предприятие готова! Подробнее на [1C Agent](/onec-agent).

**Возможности:**
• Подключение к 1С через OData/HTTP
• Получение данных из справочников
• Синхронизация документов
• Выполнение запросов
• Двусторонняя интеграция

Укажите параметры подключения к вашей базе 1С.`
  }

  // ========== Sales Agent Integration ==========

  /**
   * Check if message contains sales request
   * Triggers: "лиды", "воронка", "скоринг лида", "квалификация лида"
   * @param {string} message - User message
   * @returns {Promise<string|null>} Agent response or null
   */
  const processSalesAgentRequest = async (message) => {
    if (!toolsConfig.salesAgentEnabled) {
      return null
    }

    const triggers = /(лид|воронка продаж|скоринг|квалификац|продажи помощь|sales help|leads|sales funnel)/i
    if (!triggers.test(message)) {
      return null
    }

    logger.debug('[Sales Agent] Triggered')

    return `💼 **Sales Agent**

AI-помощник по продажам активирован! Полный функционал на [Sales Agent](/sales-agent).

**Возможности:**
• Генерация лидов из Telegram групп
• Скоринг лидов
• Управление воронкой продаж
• AI-коммуникация с клиентами
• Аналитика кампаний

Подробнее о задаче, и я помогу!`
  }

  const sendAiMessage = async () => {
    if (!aiMessage.value.trim() && currentAttachments.value.length === 0) return

    const userMessage = aiMessage.value
    const attachments = [...currentAttachments.value]

    aiChat.messages.push({
      text: userMessage,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      isUser: true,
      attachments: attachments.length > 0 ? attachments : undefined
    })

    aiMessage.value = ''
    currentAttachments.value = []
    aiLoading.value = true
    aiError.value = null
    assistantMessage.value = null
    let lastUsage = null

    scrollToBottom(aiMessagesContainer)

    try {
      // Check for FSSP agent request FIRST (долги ИНН should not trigger INN agent)
      const fsspAgentResponse = await processFsspRequest(userMessage)

      if (fsspAgentResponse) {
        // FSSP agent handled the request, show result
        aiLoading.value = false
        aiChat.messages.push({
          text: fsspAgentResponse,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: false,
          agentUsed: 'FSSP Agent'
        })
        scrollToBottom(aiMessagesContainer)
        return
      }

      // Check for VAT Calculator agent request (before INN to avoid conflicts)
      const vatAgentResponse = await processVatRequest(userMessage)

      if (vatAgentResponse) {
        // VAT agent handled the request, show result
        aiLoading.value = false
        aiChat.messages.push({
          text: vatAgentResponse,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: false,
          agentUsed: 'VAT Calculator Agent'
        })
        scrollToBottom(aiMessagesContainer)
        return
      }

      // Check for Sales agent request (BEFORE HH Agent to avoid conflicts)
      const salesResponse = await processSalesAgentRequest(userMessage)

      if (salesResponse) {
        aiLoading.value = false
        aiChat.messages.push({
          text: salesResponse,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: false,
          agentUsed: 'Sales Agent'
        })
        scrollToBottom(aiMessagesContainer)
        return
      }

      // Check for HeadHunter agent request (вакансии, зарплата, работодатель)
      const hhAgentResponse = await processHHAgentRequest(userMessage)

      if (hhAgentResponse) {
        // HH agent handled the request, show result
        aiLoading.value = false
        aiChat.messages.push({
          text: hhAgentResponse,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: false,
          agentUsed: 'HeadHunter Agent'
        })
        scrollToBottom(aiMessagesContainer)
        return
      }

      // Check for EGRUL agent request (before INN - more specific trigger)
      const egrulAgentResponse = await processEGRULRequest(userMessage)

      if (egrulAgentResponse) {
        // EGRUL agent handled the request, show result
        aiLoading.value = false
        aiChat.messages.push({
          text: egrulAgentResponse,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: false,
          agentUsed: 'EGRUL Parser Agent'
        })
        scrollToBottom(aiMessagesContainer)
        return
      }

      // Check for INN agent request (generic INN lookup)
      const innAgentResponse = await processINNRequest(userMessage)

      if (innAgentResponse) {
        // INN agent handled the request, show result
        aiLoading.value = false
        aiChat.messages.push({
          text: innAgentResponse,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: false,
          agentUsed: 'INN Analytics Agent'
        })
        scrollToBottom(aiMessagesContainer)
        return
      }

      // Check for Web Search agent request
      const searchAgentResponse = await processSearchRequest(userMessage)

      if (searchAgentResponse) {
        // Search agent handled the request, show result
        aiLoading.value = false
        aiChat.messages.push({
          text: searchAgentResponse,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: false,
          agentUsed: 'Web Search Agent'
        })
        scrollToBottom(aiMessagesContainer)
        return
      }

      // Check for Code Analyzer agent request
      const codeAnalyzerResponse = await processCodeAnalyzerRequest(userMessage)

      if (codeAnalyzerResponse) {
        aiLoading.value = false
        aiChat.messages.push({
          text: codeAnalyzerResponse,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: false,
          agentUsed: 'Code Analyzer Agent'
        })
        scrollToBottom(aiMessagesContainer)
        return
      }

      // Check for Dev Helper agent request
      const devHelperResponse = await processDevHelperRequest(userMessage)

      if (devHelperResponse) {
        aiLoading.value = false
        aiChat.messages.push({
          text: devHelperResponse,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: false,
          agentUsed: 'Dev Helper Agent'
        })
        scrollToBottom(aiMessagesContainer)
        return
      }

      // Check for Customer Support agent request
      const supportResponse = await processSupportAgentRequest(userMessage)

      if (supportResponse) {
        aiLoading.value = false
        aiChat.messages.push({
          text: supportResponse,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: false,
          agentUsed: 'Customer Support Agent'
        })
        scrollToBottom(aiMessagesContainer)
        return
      }

      // Check for 1C agent request
      const onecResponse = await processOneCAgentRequest(userMessage)

      if (onecResponse) {
        aiLoading.value = false
        aiChat.messages.push({
          text: onecResponse,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: false,
          agentUsed: '1C Agent'
        })
        scrollToBottom(aiMessagesContainer)
        return
      }

      // Create assistant message placeholder
      assistantMessage.value = {
        text: '',
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        isUser: false
      }
      aiChat.messages.push(assistantMessage.value)

      // Check if workspace chat should be used
      const useWorkspaceChat = agentMode.value && selectedWorkspace.value
      console.log('[sendAiMessage] ROUTE CHECK - agentMode:', agentMode.value, 'selectedWorkspace:', selectedWorkspace.value, 'useWorkspaceChat:', useWorkspaceChat)

      if (useWorkspaceChat) {
        // Use workspace chat endpoint
        const workspaceSessionId = `workspace_${selectedWorkspace.value}_${Date.now()}`

        // Save workspace session to Integram
        try {
          const tokenId = localStorage.getItem('current_ai_token_id') || '206099'
          integramChatSessionService.setCurrentToken(tokenId)
          await integramChatSessionService.createSession({
            sessionId: workspaceSessionId,
            model: selectedModel.value,
            systemPrompt: `Workspace: ${selectedWorkspace.value}`
          })
          logger.debug('[useChatLogic] Workspace session saved to Integram:', workspaceSessionId)
        } catch (integramError) {
          logger.warn('[useChatLogic] Failed to save workspace session to Integram:', integramError)
        }

        // Call workspace chat
        const response = await chatWithWorkspace(
          selectedWorkspace.value,
          userMessage,
          [],
          { model: selectedModel.value },
          null
        )

        const assistantText = response.response || response.reply || 'Ответ получен'
        assistantMessage.value.text = assistantText

        // Save transaction to Integram
        try {
          const usage = response.metadata?.usage || {}
          await integramChatSessionService.saveMessageExchange({
            sessionId: workspaceSessionId,
            userMessage: userMessage,
            assistantMessage: assistantText,
            model: selectedModel.value,
            inputTokens: usage.prompt_tokens || 0,
            outputTokens: usage.completion_tokens || 0,
            cost: usage.cost || 0,
            systemPrompt: `Workspace: ${selectedWorkspace.value}`
          })
          logger.debug('[useChatLogic] Workspace transaction saved to Integram')
        } catch (integramError) {
          logger.warn('[useChatLogic] Failed to save workspace transaction:', integramError)
        }
      } else {
        // NOTE: Unified API is stateless - no session management needed
        console.log('[sendAiMessage] Using unified /api/chat endpoint')

        // Use unified chat API with streaming
        const response = await fetch(`${CHAT_API_URL}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: userMessage,
            userId: currentUserId.value,
            model: selectedModel.value,
            provider: selectedProvider.value, // IMPORTANT: Send provider to backend
            conversationHistory: aiChat.messages
              .filter(msg => !isSystemMessage(msg)) // Skip system messages
              .filter(msg => !msg.isSystemGreeting) // Skip system greeting
              .filter(msg => msg.text && msg.text.trim() !== '') // Skip empty messages
              .filter(msg => !msg.isDemo) // Skip demo fallback responses
              .map(msg => ({
                role: msg.isUser ? 'user' : 'assistant',
                content: msg.text
              })),
            maxTokens: llmSettings.contextSize,
            temperature: llmSettings.temperature,
            topP: llmSettings.topP,
            // IMPORTANT: Do NOT pass systemPrompt - let Coordinator use base MCP prompt
            // Frontend systemPrompt overrides Coordinator's MCP instructions
            // systemPrompt: getCombinedSystemPrompt(),
            enableTools: true, // Enable MCP tools for Integram database access
            stream: false // IMPORTANT: Disable streaming when tools enabled (Issue #5112)
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        // Handle SSE streaming response
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('text/event-stream')) {
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.substring(6)
                if (data === '[DONE]') continue

                try {
                  const parsed = JSON.parse(data)

                  if (parsed.sessionId) {
                    polzaSessionId.value = parsed.sessionId
                  }

                  // Handle different streaming formats
                  if (parsed.type === 'content') {
                    assistantMessage.value.text += parsed.content
                    scrollToBottom(aiMessagesContainer)
                  } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                    // Format from TokenBasedLLMCoordinator
                    assistantMessage.value.text += parsed.delta.text
                    scrollToBottom(aiMessagesContainer)
                  } else if (parsed.chunk) {
                    assistantMessage.value.text += parsed.chunk
                    scrollToBottom(aiMessagesContainer)
                  } else if (parsed.type === 'done' || parsed.done) {
                    logger.debug('Streaming completed. Usage:', parsed.usage)
                    lastUsage = parsed.usage
                  } else if (parsed.error) {
                    throw new Error(parsed.error)
                  }
                } catch (e) {
                  if (e.message && !e.message.includes('JSON')) {
                    throw e
                  }
                }
              }
            }
          }
        } else if (contentType && contentType.includes('application/json')) {
          const data = await response.json()
          if (!data.success) {
            throw new Error(data.error || 'Неизвестная ошибка API')
          }
          assistantMessage.value.text = data.response
        }
      }

      // Finalize the assistant message
      if (assistantMessage.value) {
        const finalMessageObj = { ...assistantMessage.value }
        aiChat.messages.splice(aiChat.messages.indexOf(assistantMessage.value), 1, finalMessageObj)
        assistantMessage.value = null
      }
    } catch (error) {
      console.error('❌ [sendAiMessage] CRITICAL ERROR:', error)
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      })
      aiError.value = error.message || 'Произошла ошибка при отправке сообщения'

      // Fallback to demo response
      const modelName = selectedModel.value || 'AI Model'
      const demoResponse = generateDemoResponse(userMessage, modelName)

      if (assistantMessage.value) {
        assistantMessage.value.text = demoResponse
        assistantMessage.value.isDemo = true // Mark as demo for filtering
        const finalMessageObj = { ...assistantMessage.value }
        aiChat.messages.splice(aiChat.messages.indexOf(assistantMessage.value), 1, finalMessageObj)
        assistantMessage.value = null
      } else {
        const newMessage = {
          text: demoResponse,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: false,
          isDemo: true // Mark as demo for filtering
        }
        aiChat.messages.push(newMessage)
      }
    } finally {
      aiLoading.value = false
      scrollToBottom(aiMessagesContainer)

      // Save message exchange to Integram
      const lastAssistantText = aiChat.messages
        .filter(msg => !msg.isUser && msg.text)
        .pop()?.text || ''

      if (polzaSessionId.value && lastAssistantText) {
        try {
          await integramChatSessionService.saveMessageExchange({
            sessionId: polzaSessionId.value,
            userMessage: userMessage,
            assistantMessage: lastAssistantText,
            model: selectedModel.value,
            inputTokens: lastUsage?.prompt_tokens || 0,
            outputTokens: lastUsage?.completion_tokens || 0,
            cost: lastUsage?.cost || 0,
            systemPrompt: getCombinedSystemPrompt()
          })
          logger.debug('[useChatLogic] Message exchange saved to Integram')
        } catch (integramError) {
          logger.warn('[useChatLogic] Failed to save transactions to Integram:', integramError)
        }
      }
    }
  }

  // ==================== Message Actions ====================

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  const editMessage = (index) => {
    const message = aiChat.messages[index]
    if (!message) return

    aiMessage.value = message.text

    if (message.attachments && message.attachments.length > 0) {
      currentAttachments.value = [...message.attachments]
    }

    aiChat.messages.splice(index, 1)
    console.log('[useChatLogic] Message edited')
  }

  const deleteMessage = (index) => {
    try {
      aiChat.messages.splice(index, 1)
      const messagesToSave = aiChat.messages.filter(msg => msg !== assistantMessage.value)
      localStorage.setItem('aiChat', JSON.stringify(messagesToSave))
      console.log('[useChatLogic] Message deleted')
    } catch (error) {
      console.error('[useChatLogic] Failed to delete message:', error)
    }
  }

  const resendMessage = async (index) => {
    try {
      const message = aiChat.messages[index]
      if (!message) return

      aiMessage.value = message.text

      if (message.attachments && message.attachments.length > 0) {
        currentAttachments.value = [...message.attachments]
      }

      await sendAiMessage()
      console.log('[useChatLogic] Message resent')
    } catch (error) {
      console.error('[useChatLogic] Failed to resend message:', error)
    }
  }

  // ==================== Chat Management ====================

  const saveCurrentChat = () => {
    if (!newChatName.value.trim()) return

    savedChats.value.push({
      name: newChatName.value,
      date: new Date().toLocaleDateString('ru-RU'),
      messages: [...aiChat.messages]
    })

    localStorage.setItem('savedChats', JSON.stringify(savedChats.value))
    newChatName.value = ''
  }

  const loadChat = (chat) => {
    aiChat.messages = [...chat.messages]
    showHistory.value = false
    // Прокрутить к последним сообщениям после загрузки истории
    nextTick(() => {
      scrollToBottom(aiMessagesContainer)
    })
  }

  const deleteChat = (index) => {
    savedChats.value.splice(index, 1)
    localStorage.setItem('savedChats', JSON.stringify(savedChats.value))
  }

  /**
   * Quick save current chat with auto-generated name
   */
  const quickSaveChat = () => {
    console.log('[useChatLogic] quickSaveChat called, messages:', aiChat.messages.length)
    if (aiChat.messages.length <= 2) {
      console.log('[useChatLogic] Not enough messages to save')
      return
    }

    // Find first user message for the name
    const firstUserMsg = aiChat.messages.find(m => m.isUser)
    const autoName = firstUserMsg?.text?.substring(0, 50) || `Чат ${new Date().toLocaleTimeString('ru-RU')}`

    savedChats.value.unshift({
      name: autoName,
      date: new Date().toLocaleDateString('ru-RU'),
      time: new Date().toLocaleTimeString('ru-RU'),
      messages: [...aiChat.messages],
      model: selectedModel.value,
      provider: selectedProvider.value
    })

    // Keep max 50 chats
    if (savedChats.value.length > 50) {
      savedChats.value = savedChats.value.slice(0, 50)
    }

    localStorage.setItem('savedChats', JSON.stringify(savedChats.value))
    logger.info('[useChatLogic] Chat quick-saved:', autoName)
  }

  /**
   * Start a new chat (clear current messages)
   */
  const startNewChat = () => {
    // Save current if has content
    if (aiChat.messages.length > 2) {
      quickSaveChat()
    }

    // Reset to initial state
    aiChat.messages = [
      {
        text: 'Здравствуйте! Я цифровой помощник DronDoc. Я могу анализировать таблицы и отчёты, отвечать на вопросы и т.д. Чем могу помочь?',
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        isUser: false,
        isSystemGreeting: true // Skip in conversationHistory
      }
    ]

    showHistory.value = false
    logger.info('[useChatLogic] Started new chat')
  }

  /**
   * Clear all saved chats
   */
  const clearAllChats = () => {
    savedChats.value = []
    localStorage.setItem('savedChats', JSON.stringify([]))
    logger.info('[useChatLogic] All chats cleared')
  }

  // ==================== Session History Management ====================
  // Session history now uses unified savedChats system (no separate sessionHistory)

  /**
   * Save current session to history (now uses only savedChats for both Chat.vue and ChatPage.vue)
   */
  const saveSessionToHistory = () => {
    // Check if there are any user messages (excluding initial system messages)
    const userMessages = aiChat.messages.filter((msg, index) => index > 1 && msg.isUser)

    if (userMessages.length === 0) {
      logger.info('[useChatLogic] Not saving empty session to history (no user messages)')
      return
    }

    // Use quickSaveChat to save to unified savedChats system
    quickSaveChat()
  }

  /**
   * Detect provider from model ID
   * Used to update stale provider info from saved sessions
   */
  const detectProviderFromModel = (modelId) => {
    if (!modelId) return null

    const model = modelId.toLowerCase()

    // Check for explicit provider prefix (e.g., "kodacode/KodaAgent")
    if (model.includes('/')) {
      const prefix = model.split('/')[0]
      return prefix
    }

    // Detect from model name patterns
    if (model.includes('koda')) return 'kodacode'
    if (model.includes('claude')) return 'anthropic'
    if (model.includes('gpt') || model.includes('o1') || model.includes('o3')) return 'openai'
    if (model.includes('deepseek')) return 'deepseek'
    if (model.includes('gemini')) return 'google'
    if (model.includes('polza')) return 'polza'

    return null
  }

  // Removed loadSession and deleteSession - now using unified loadChat/deleteChat from savedChats system

  // ==================== Attachments ====================

  const showImagePreview = (url) => {
    currentImage.value = url
    showImageDialog.value = true
  }

  const toggleVoiceInput = () => {
    isRecording.value = !isRecording.value
    // Voice input implementation would go here
  }

  const triggerFileUpload = () => {
    fileInput.value?.click()
  }

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files)
    if (files.length === 0) return

    uploadProgress.value = 10

    try {
      for (const file of files) {
        const attachment = {
          name: file.name,
          size: file.size,
          type: file.type,
          source: 'file',
          url: URL.createObjectURL(file)
        }
        currentAttachments.value.push(attachment)
      }
      uploadProgress.value = 100
    } catch (error) {
      console.error('File upload error:', error)
    } finally {
      setTimeout(() => {
        uploadProgress.value = 0
      }, 1000)
      event.target.value = ''
    }
  }

  const removeCurrentAttachment = (index) => {
    currentAttachments.value.splice(index, 1)
  }

  const downloadAttachment = (attachment) => {
    const link = document.createElement('a')
    link.href = attachment.url
    link.download = attachment.name
    link.click()
  }

  // ==================== Data Selector ====================

  const loadDataItems = async () => {
    if (!selectedDataType.value) return

    loadingDataItems.value = true
    try {
      if (selectedDataType.value === 'integram_table') {
        dataItems.value = [
          { id: 1, name: 'Таблица пользователей' },
          { id: 2, name: 'Таблица заказов' },
          { id: 3, name: 'Таблица продуктов' }
        ]
      } else {
        dataItems.value = [
          { id: 1, name: 'Отчёт по продажам' },
          { id: 2, name: 'Отчёт по клиентам' },
          { id: 3, name: 'Финансовый отчёт' }
        ]
      }
    } catch (error) {
      console.error('Failed to load data items:', error)
      dataItems.value = []
    } finally {
      loadingDataItems.value = false
    }
  }

  const attachDataSource = () => {
    if (!selectedDataItem.value) return

    const item = dataItems.value.find(i => i.id === selectedDataItem.value)
    if (!item) return

    const attachment = {
      id: `${selectedDataType.value}_${selectedDataItem.value}`,
      name: item.name,
      type: selectedDataType.value,
      source: 'data',
      comment: dataComment.value
    }

    currentAttachments.value.push(attachment)

    selectedDataType.value = null
    selectedDataItem.value = null
    dataComment.value = ''
    showDataSelector.value = false
  }

  // ==================== Workspace Management ====================

  const loadWorkspaces = async () => {
    loadingWorkspaces.value = true
    try {
      const userId = currentUserId.value
      const result = await getUserWorkspaces(userId)
      workspaces.value = result || []
    } catch (error) {
      console.error('Failed to load workspaces:', error)
      workspaces.value = []
    } finally {
      loadingWorkspaces.value = false
    }
  }

  const handleCreateWorkspace = async () => {
    createWorkspaceError.value = null

    if (!newWorkspace.name.trim()) {
      createWorkspaceError.value = 'Название workspace обязательно'
      return
    }

    creatingWorkspace.value = true
    try {
      const userId = currentUserId.value
      const workspaceData = {
        name: newWorkspace.name.trim(),
        repositoryUrl: newWorkspace.repositoryUrl.trim() || null,
        branch: newWorkspace.branch.trim() || 'main'
      }

      const result = await createWorkspace(userId, workspaceData)

      workspaces.value.push(result)
      selectedWorkspace.value = result.id

      newWorkspace.name = ''
      newWorkspace.repositoryUrl = ''
      newWorkspace.branch = 'main'
      showCreateWorkspaceDialog.value = false
    } catch (error) {
      console.error('Failed to create workspace:', error)
      createWorkspaceError.value = error.message || 'Ошибка создания workspace'
    } finally {
      creatingWorkspace.value = false
    }
  }

  const navigateToWorkspaces = () => {
    router.push('/workspaces')
  }

  // ==================== Chat Session Management ====================

  const createNewChatSession = async () => {
    try {
      // Save current session to history before creating new one
      saveSessionToHistory()

      // Clear current chat
      aiChat.messages = [
        {
          text: 'Ты цифровой помощник. Отвечаешь кратко и по существу. Анализируешь JSON в которых таблицы в формате:Работаем с таблицей: headers (id,value,type,isMain) определяют колонки, rows (id,values) содержат ячейки с headerId для связи данных.',
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: true,
        },
        {
          text: 'Здравствуйте! Я цифровой помощник DronDoc.\nЯ могу анализировать таблицы и отчёты, отвечать на вопросы и т.д.\nЧем могу помочь?',
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          isUser: false,
        },
      ]

      // Reset session
      polzaSessionId.value = null
      localStorage.removeItem('polza_session_id')

      // Clear attachments
      currentAttachments.value = []

      logger.info('[useChatLogic] New chat session created')
    } catch (error) {
      console.error('[useChatLogic] Failed to create new chat session:', error)
    }
  }

  const clearCurrentChat = async () => {
    if (activeTabIndex.value === 0) {
      if (confirm('Очистить историю чата?')) {
        // NOTE: No need to terminate session - unified API is stateless
        // Just clear local storage
        const sessionId = localStorage.getItem('polza_session_id')
        if (sessionId) {
          try {
            // DEPRECATED: Session termination not needed with unified API
            // await fetch(`${CHAT_API_URL}/terminate`, ...)
            logger.info('[useChatLogic] Clearing session (stateless API):', sessionId)
          } catch (error) {
            console.error('[useChatLogic] Failed to terminate session:', error)
          }
        }

        // Clear chat
        aiChat.messages = [
          {
            text: 'Ты цифровой помощник. Отвечаешь кратко и по существу. Анализируешь JSON в которых таблицы в формате:Работаем с таблицей: headers (id,value,type,isMain) определяют колонки, rows (id,values) содержат ячейки с headerId для связи данных.',
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            isUser: true,
          },
          {
            text: 'Здравствуйте! Я цифровой помощник DronDoc.\nЯ могу анализировать таблицы и отчёты, отвечать на вопросы и т.д.\nЧем могу помочь?',
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            isUser: false,
          },
        ]

        // Reset session
        polzaSessionId.value = null
        localStorage.removeItem('polza_session_id')
        localStorage.setItem('aiChat', JSON.stringify(aiChat.messages))

        logger.info('[useChatLogic] Chat cleared')
      }
    } else {
      if (confirm('Очистить общий чат?')) {
        activeChat.messages = [
          {
            text: 'Добро пожаловать в общий чат! Здесь вы можете общаться с коллегами.',
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            isUser: false,
          },
        ]
        logger.info('[useChatLogic] General chat cleared')
      }
    }
  }

  // ==================== Lifecycle ====================

  const init = async () => {
    await checkPolzaHealth()

    if (agentMode.value) {
      loadWorkspaces()
    }

    // Initialize general chat
    await generalChat.init()
  }

  // ==================== Return Public API ====================

  return {
    // State
    activeTabIndex,
    showHistory,
    showImageDialog,
    showSettings,
    showTools,
    showAgentsList,
    showDataSelector,
    showCreateWorkspaceDialog,
    showIntegraMCPAuth,
    showEditMessageDialog,
    showCodeExecutionWindow,
    isRecording,
    uploadProgress,
    currentImage,
    selectedModel,
    selectedProvider,
    userAccessToken,
    llmSettings,
    toolsConfig,
    agentMode,
    deepAgentEnabled,
    runningAgents,
    aiChat,
    activeChat,
    aiMessage,
    newMessage,
    aiLoading,
    aiError,
    assistantMessage,
    currentAttachments,
    polzaSessionId,
    isApiAvailable,
    loadingHistory,
    editingMessageIndex,
    editingMessageText,
    workspaces,
    selectedWorkspace,
    loadingWorkspaces,
    creatingWorkspace,
    createWorkspaceError,
    newWorkspace,
    integraMCPState,
    integramAuthForm,
    integramAuthLoading,
    integramAuthError,
    codeExecutions,
    selectedDataType,
    selectedDataItem,
    dataComment,
    loadingDataItems,
    dataItems,
    dataTypes,
    savedChats,
    newChatName,

    // General Chat (entire composable for template access)
    generalChat,

    // Refs (for binding in components)
    fileInput,
    fileInputGeneral,
    modalFileInput,
    attachmentMenu,
    attachmentMenuGeneral,
    modalAttachmentMenu,
    aiMessagesContainer,
    messagesContainer,
    modalMessagesContainer,

    // Computed
    isEditorPage,
    currentUserId,

    // Methods
    isSystemMessage,
    getCombinedSystemPrompt,
    scrollToBottom,
    isImage,
    getAttachmentIcon,
    getAttachmentDisplayName,
    formatFileSize,
    getWorkspaceName,
    getWorkspaceRepo,
    handleModelChange,
    handleDeepAgentToggle,
    checkPolzaHealth,
    generateDemoResponse,
    sendMessage,
    sendAiMessage,
    copyToClipboard,
    editMessage,
    deleteMessage,
    resendMessage,
    saveCurrentChat,
    loadChat,
    deleteChat,
    quickSaveChat,
    startNewChat,
    clearAllChats,
    saveSessionToHistory,
    showImagePreview,
    toggleVoiceInput,
    triggerFileUpload,
    handleFileUpload,
    removeCurrentAttachment,
    downloadAttachment,
    loadDataItems,
    attachDataSource,
    loadWorkspaces,
    handleCreateWorkspace,
    navigateToWorkspaces,
    createNewChatSession,
    clearCurrentChat,
    init,

    // General Chat methods (from useGeneralChat)
    loadRooms: generalChat.loadRooms,
    createDefaultRoom: generalChat.createDefaultRoom,
    joinRoom: generalChat.joinRoom,
    handleTyping: generalChat.handleTyping,
  }
}
