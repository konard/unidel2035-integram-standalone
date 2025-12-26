/**
 * Integram Chat Session Service
 *
 * Сохраняет сессии AI чата напрямую в базу данных Integram
 * Issue: Автоматическое сохранение сессий и транзакций
 *
 * Структура данных в Integram:
 * - ai_token (198016) - Токены
 *   └── Токен (например 206099)
 *       └── Сессия (205909) - сессии чата
 *           ├── session_id (205921)
 *           ├── Последняя активность (205928)
 *           └── Транзакции (198038) - каждое сообщение
 *               ├── Модель (198040) - ссылка на модель
 *               ├── Входящих токенов (198041)
 *               ├── Исходящих токенов (198042)
 *               ├── Сумма (198043) - стоимость в копейках
 *               ├── Контент (205916) - текст сообщения
 *               ├── Сообщения JSON (205931)
 *               └── Системный промпт (205933)
 *
 * Цены моделей (за 1M токенов, в рублях):
 * - deepseek-chat: input=1.4₽, output=5.5₽
 * - gpt-4o: input=25₽, output=100₽
 */

import integramApiClient from './integramApiClient.js'

// Type IDs для таблиц в Integram (база 'my')
const TYPE_IDS = {
  SESSION: 205909,      // Таблица сессий чата
  TRANSACTION: 198038,  // Таблица транзакций
  AI_TOKEN: 198016,     // Таблица токенов
  MODEL: 195686         // Таблица моделей
}

// Цены моделей за 1M токенов (в копейках для точности)
// 1 рубль = 100 копеек
// Источник: https://polza.ai/models (актуальные цены Polza.ai)
const MODEL_PRICES = {
  // DeepSeek (Polza.ai актуальные цены)
  'deepseek-chat': { input: 2606, output: 10423 },      // 26.06₽ / 104.23₽ за 1M (V3)
  'deepseek-r1': { input: 2606, output: 10423 },        // 26.06₽ / 104.23₽ за 1M (R1)
  'deepseek-reasoner': { input: 2606, output: 10423 },  // 26.06₽ / 104.23₽ за 1M (alias)
  // Amazon Nova (Polza.ai актуальные цены)
  'nova-premier': { input: 21716, output: 108578 },     // 217.16₽ / 1085.78₽ за 1M
  'nova-pro': { input: 6949, output: 27796 },           // 69.49₽ / 277.96₽ за 1M
  'nova-lite': { input: 521, output: 2085 },            // 5.21₽ / 20.85₽ за 1M
  'nova-micro': { input: 304, output: 1216 },           // 3.04₽ / 12.16₽ за 1M
  'nova-2-lite': { input: 2606, output: 21716 },        // 26.06₽ / 217.16₽ за 1M
  // Anthropic Claude (Polza.ai актуальные цены)
  'claude-3-haiku': { input: 2172, output: 10858 },     // 21.72₽ / 108.58₽ за 1M
  'claude-3.5-haiku': { input: 6949, output: 34745 },   // 69.49₽ / 347.45₽ за 1M
  'claude-3-sonnet': { input: 26418, output: 132092 },  // 264.18₽ / 1320.92₽ за 1M
  'claude-3.5-sonnet': { input: 26225, output: 131127 },// 262.25₽ / 1311.27₽ за 1M
  'claude-3.7-sonnet': { input: 26059, output: 130293 },// 260.59₽ / 1302.93₽ за 1M
  'claude-3-opus': { input: 130293, output: 651466 },   // 1302.93₽ / 6514.66₽ за 1M
  'claude-haiku-4.5': { input: 8686, output: 43431 },   // 86.86₽ / 434.31₽ за 1M
  'claude-sonnet-4': { input: 26059, output: 130293 },  // 260.59₽ / 1302.93₽ за 1M
  'claude-sonnet-4.5': { input: 26059, output: 130293 },// 260.59₽ / 1302.93₽ за 1M (как Sonnet 4)
  'claude-opus-4': { input: 130293, output: 651466 },   // 1302.93₽ / 6514.66₽ за 1M
  'claude-opus-4.5': { input: 43431, output: 217155 },  // 434.31₽ / 2171.55₽ за 1M
  // OpenAI GPT (примерные, нужно уточнить)
  'gpt-4o': { input: 2500, output: 10000 },             // 25₽ / 100₽ за 1M
  'gpt-4o-mini': { input: 150, output: 600 },           // 1.5₽ / 6₽ за 1M
  'gpt-3.5-turbo': { input: 50, output: 150 },          // 0.5₽ / 1.5₽ за 1M
  // Google Gemini (примерные)
  'gemini-2.5-flash': { input: 75, output: 300 },       // 0.75₽ / 3₽ за 1M
  'gemini-2.0-flash': { input: 75, output: 300 },       // 0.75₽ / 3₽ за 1M
  // Default (как deepseek-chat)
  'default': { input: 2606, output: 10423 }             // По умолчанию как deepseek-chat
}

/**
 * Рассчитывает общую стоимость запроса в рублях
 * @param {string} model - Название модели
 * @param {number} inputTokens - Количество токенов вопроса
 * @param {number} outputTokens - Количество токенов ответа
 * @returns {number} Общая стоимость в рублях (десятичное число)
 */
function calculateCost(model, inputTokens, outputTokens) {
  const modelKey = Object.keys(MODEL_PRICES).find(key =>
    model?.toLowerCase().includes(key.toLowerCase())
  ) || 'default'

  const prices = MODEL_PRICES[modelKey]

  // Цена в копейках за 1M токенов → конвертируем в рубли
  // inputTokens/1M * prices(копейки) / 100 = рубли
  const inputCostRubles = (inputTokens / 1_000_000) * prices.input / 100
  const outputCostRubles = (outputTokens / 1_000_000) * prices.output / 100

  // Возвращаем рубли с 4 знаками после запятой для точности
  return Number((inputCostRubles + outputCostRubles).toFixed(4))
}

// Requisite IDs для таблицы Сессия (205909)
const SESSION_REQUISITES = {
  DATE: 205911,              // Дата создания
  TRANSACTION: 205913,       // Ссылка на транзакцию (устаревшее)
  SESSION_ID: 205921,        // Уникальный ID сессии
  SYSTEM_PROMPT: 205924,     // Системный промпт
  MESSAGES_JSON: 205926,     // Сообщения в JSON формате (backup)
  LAST_ACTIVITY: 205928      // Последняя активность
}

// Requisite IDs для таблицы Транзакция (198038) - ОБНОВЛЕННЫЕ
const TRANSACTION_REQUISITES = {
  MODEL: 198040,             // Модель (ссылка на 195686)
  INPUT_TOKENS: 198041,      // Токенов вопроса
  OUTPUT_TOKENS: 198042,     // Токенов ответа
  COST: 198043,              // Цена (локальный расчёт)
  POLZA_COST: 206459,        // Цена Polza (из ответа API)
  QUESTION: 205916,          // Вопрос LMM
  ANSWER: 205931,            // Ответ LMM
  SYSTEM_PROMPT: 205933      // Системный промпт
}

// ID дефолтной модели (deepseek-chat)
const DEFAULT_MODEL_ID = '195845'

class IntegramChatSessionService {
  constructor() {
    this.initialized = false
    this.currentTokenId = null
    this.sessionsCache = new Map() // sessionId -> integramObjectId
    this.modelsMap = new Map() // modelName (lowercase) -> modelId
    this.modelsLoaded = false // флаг загрузки моделей

    // Restore sessionsCache from localStorage on construction
    this.loadCacheFromStorage()
  }

  /**
   * Load sessionsCache from localStorage for persistence across page reloads
   */
  loadCacheFromStorage() {
    try {
      const cached = localStorage.getItem('integram_sessions_cache')
      if (cached) {
        const data = JSON.parse(cached)
        for (const [key, value] of Object.entries(data)) {
          this.sessionsCache.set(key, value)
        }
        console.log('[IntegramChatSession] Restored', this.sessionsCache.size, 'sessions from cache')
      }
    } catch (error) {
      console.warn('[IntegramChatSession] Failed to load cache from storage:', error)
    }
  }

  /**
   * Save sessionsCache to localStorage for persistence
   */
  saveCacheToStorage() {
    try {
      const data = Object.fromEntries(this.sessionsCache)
      localStorage.setItem('integram_sessions_cache', JSON.stringify(data))
    } catch (error) {
      console.warn('[IntegramChatSession] Failed to save cache to storage:', error)
    }
  }

  /**
   * Загружает все модели из таблицы Модели (195686) и создает маппинг
   * Вызывается автоматически при инициализации сервиса
   */
  async loadModelsMap() {
    if (this.modelsLoaded) {
      return // Модели уже загружены
    }

    try {
      console.log('[IntegramChatSession] Loading models from database...')

      // Загружаем все модели через backend API (который использует отчет ai_model)
      // Это гарантирует загрузку всех 166 моделей из Integram + модели из других источников
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8082'
      // Добавляем timestamp для обхода кэша браузера (Issue #5112)
      const response = await fetch(`${apiUrl}/ai-tokens/external-models?_t=${Date.now()}`)

      if (!response.ok) {
        console.warn('[IntegramChatSession] Failed to fetch models from API:', response.status)
        // Fallback: пробуем загрузить напрямую из Integram (ограничено 20 моделями из-за пагинации)
        const integramResponse = await integramApiClient.getObjectList(TYPE_IDS.MODEL, {
          offset: 0,
          limit: 500
        })

        if (integramResponse && integramResponse.object) {
          this.modelsMap.clear()
          for (const model of integramResponse.object) {
            this.modelsMap.set(model.val.toLowerCase(), model.id)
          }
          this.modelsLoaded = true
          console.log('[IntegramChatSession] Loaded', this.modelsMap.size, 'models from Integram (fallback)')
        }
        return
      }

      const data = await response.json()

      if (data.success && data.data) {
        this.modelsMap.clear()

        // Обрабатываем модели из API
        // API может возвращать модели в разных форматах, обрабатываем оба
        for (const model of data.data) {
          const modelName = model.name || model.val || model.value
          const modelId = model.id || model.value  // Для моделей из API может не быть ID из Integram

          if (modelName) {
            // Убираем префикс провайдера для единообразия
            const cleanName = modelName.includes('/')
              ? modelName.split('/').pop()
              : modelName

            // Если есть ID из Integram - используем его, иначе используем modelName как ID
            this.modelsMap.set(cleanName.toLowerCase(), modelId || cleanName)
          }
        }

        this.modelsLoaded = true
        console.log('[IntegramChatSession] Loaded', this.modelsMap.size, 'models from API')
      } else {
        console.warn('[IntegramChatSession] No models found in API response')
      }
    } catch (error) {
      console.error('[IntegramChatSession] Failed to load models:', error)
      // Не бросаем ошибку - сервис продолжит работать с дефолтной моделью
    }
  }

  /**
   * Получает ID модели в Integram по имени модели
   * Использует динамический маппинг из базы данных
   * @param {string} modelName - Название модели (может быть с префиксом провайдера)
   * @returns {string} ID объекта модели в Integram
   */
  getModelId(modelName) {
    if (!modelName) {
      console.log('[IntegramChatSession] No model name provided, using default:', DEFAULT_MODEL_ID)
      return DEFAULT_MODEL_ID
    }

    // Убираем префикс провайдера (anthropic/, amazon/, moonshotai/, etc.)
    // Polza API возвращает "anthropic/claude-sonnet-4.5", но в БД хранится "claude-sonnet-4.5"
    const cleanModelName = modelName.includes('/')
      ? modelName.split('/').pop()  // берем часть после последнего /
      : modelName

    console.log('[IntegramChatSession] getModelId:', {
      original: modelName,
      clean: cleanModelName,
      modelsLoaded: this.modelsLoaded
    })

    // Если модели еще не загружены - возвращаем дефолт
    if (!this.modelsLoaded) {
      console.warn('[IntegramChatSession] Models not loaded yet, using default:', DEFAULT_MODEL_ID)
      return DEFAULT_MODEL_ID
    }

    // Ищем точное совпадение в маппинге (case-insensitive)
    const exactMatch = this.modelsMap.get(cleanModelName.toLowerCase())
    if (exactMatch) {
      console.log('[IntegramChatSession] Model found (exact):', cleanModelName, '→', exactMatch)
      return exactMatch
    }

    // Ищем частичное совпадение
    for (const [dbModelName, dbModelId] of this.modelsMap.entries()) {
      if (cleanModelName.toLowerCase().includes(dbModelName) ||
          dbModelName.includes(cleanModelName.toLowerCase())) {
        console.log('[IntegramChatSession] Model found (partial):', cleanModelName, '→', dbModelName, '→', dbModelId)
        return dbModelId
      }
    }

    // Если не найдено - используем дефолт
    console.warn('[IntegramChatSession] Model not found:', cleanModelName, ', using default:', DEFAULT_MODEL_ID)
    return DEFAULT_MODEL_ID
  }

  /**
   * Инициализация сервиса
   * @param {string} tokenId - ID токена в Integram (например '206099')
   */
  async initialize(tokenId = null) {
    try {
      // Убедимся что integramApiClient настроен на 'my' базу
      if (!integramApiClient.isAuthenticated()) {
        // Попробуем загрузить сессию из localStorage
        integramApiClient.loadSession()

        if (!integramApiClient.isAuthenticated()) {
          console.warn('[IntegramChatSession] No authentication available')
          return false
        }
      }

      // Устанавливаем базу 'my' для сессий
      integramApiClient.setDatabase('my')

      // Получаем ID токена из localStorage или параметра
      // Default token 206099 = Polza AI Token для пользователя d
      const DEFAULT_TOKEN_ID = '206099'
      let candidateTokenId = tokenId || localStorage.getItem('current_ai_token_id') || DEFAULT_TOKEN_ID
      console.log('[IntegramChatSession] Candidate token ID:', candidateTokenId)

      // Проверяем существование токена - если не существует, используем дефолтный
      if (candidateTokenId !== DEFAULT_TOKEN_ID) {
        try {
          const tokenCheck = await integramApiClient.get(`object/${candidateTokenId}`)
          if (!tokenCheck || tokenCheck.error || !tokenCheck['&main.a.&object']?.id?.[0]) {
            console.warn('[IntegramChatSession] Token', candidateTokenId, 'not found, using default:', DEFAULT_TOKEN_ID)
            candidateTokenId = DEFAULT_TOKEN_ID
            localStorage.setItem('current_ai_token_id', DEFAULT_TOKEN_ID)
          }
        } catch (err) {
          console.warn('[IntegramChatSession] Error checking token', candidateTokenId, ':', err.message)
          candidateTokenId = DEFAULT_TOKEN_ID
          localStorage.setItem('current_ai_token_id', DEFAULT_TOKEN_ID)
        }
      }

      this.currentTokenId = candidateTokenId
      console.log('[IntegramChatSession] Using token ID:', this.currentTokenId)

      // Загружаем модели из базы данных
      await this.loadModelsMap()

      this.initialized = true
      console.log('[IntegramChatSession] Initialized with tokenId:', this.currentTokenId)

      return true
    } catch (error) {
      console.error('[IntegramChatSession] Initialization failed:', error)
      return false
    }
  }

  /**
   * Создает новую сессию в Integram
   * @param {Object} options - Параметры сессии
   * @param {string} options.sessionId - Уникальный ID сессии (из Polza)
   * @param {string} options.model - Название модели
   * @param {string} options.systemPrompt - Системный промпт
   * @returns {Promise<Object>} Созданный объект сессии
   */
  async createSession(options = {}) {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult) {
        return { success: false, error: 'Failed to initialize' }
      }
    }

    try {
      const sessionName = `Сессия ${new Date().toLocaleString('ru-RU')}`
      const now = new Date().toISOString()
      const sessionId = options.sessionId || `session_${Date.now()}`

      // Создаем объект сессии через прямой API
      console.log('[IntegramChatSession] Creating session with parentId:', this.currentTokenId, 'typeId:', TYPE_IDS.SESSION)

      const result = await integramApiClient.createObject(
        TYPE_IDS.SESSION,
        sessionName,
        {
          [SESSION_REQUISITES.SESSION_ID]: sessionId,
          [SESSION_REQUISITES.SYSTEM_PROMPT]: options.systemPrompt || '',
          [SESSION_REQUISITES.LAST_ACTIVITY]: now
        },
        this.currentTokenId // parentId - привязка к токену
      )

      console.log('[IntegramChatSession] createObject response:', JSON.stringify(result))

      // API может вернуть id или obj
      const objectId = result?.id || result?.obj

      if (result && objectId) {
        // Кэшируем связь sessionId -> integramObjectId
        this.sessionsCache.set(sessionId, objectId)
        // Persist cache to localStorage
        this.saveCacheToStorage()

        console.log('[IntegramChatSession] Session created in Integram:', objectId, 'for sessionId:', sessionId)

        return {
          success: true,
          integramId: objectId,
          sessionId: sessionId
        }
      } else {
        console.error('[IntegramChatSession] createObject returned:', result)
        throw new Error(result?.error || 'Failed to create session - no ID returned')
      }
    } catch (error) {
      console.error('[IntegramChatSession] Failed to create session:', error)
      console.error('[IntegramChatSession] Auth status:', integramApiClient.isAuthenticated())
      console.error('[IntegramChatSession] Database:', integramApiClient.getDatabase())
      return { success: false, error: error.message }
    }
  }

  /**
   * Создает транзакцию для пары вопрос-ответ (одна запись)
   * Транзакция создается как дочерний объект сессии
   *
   * @param {Object} data - Данные транзакции
   * @param {string} data.sessionId - ID сессии (из Polza)
   * @param {string} data.userMessage - Вопрос пользователя
   * @param {string} data.assistantMessage - Ответ ассистента
   * @param {string} data.model - Название модели
   * @param {number} data.inputTokens - Входящих токенов
   * @param {number} data.outputTokens - Исходящих токенов
   * @param {number} [data.cost] - Стоимость из API ответа (если не передана, рассчитывается локально)
   * @param {string} data.systemPrompt - Системный промпт
   * @returns {Promise<Object>} Созданная транзакция
   */
  async createMessageTransaction(data) {
    if (!this.initialized) {
      console.log('[IntegramChatSession] Service not initialized, initializing now...')
      const initResult = await this.initialize()
      if (!initResult) {
        console.error('[IntegramChatSession] Failed to initialize service')
        return { success: false, error: 'Failed to initialize' }
      }
    }

    try {
      let sessionIntegramId = this.sessionsCache.get(data.sessionId)

      if (!sessionIntegramId) {
        console.warn('[IntegramChatSession] Session not found in cache for transaction:', data.sessionId)
        console.warn('[IntegramChatSession] Available sessions in cache:', Array.from(this.sessionsCache.keys()))
        // Try to reload cache from storage
        this.loadCacheFromStorage()
        sessionIntegramId = this.sessionsCache.get(data.sessionId)
        if (!sessionIntegramId) {
          console.error('[IntegramChatSession] Session still not found after cache reload')
          return { success: false, error: 'Session not found in cache' }
        }
        console.log('[IntegramChatSession] Found session after reload:', sessionIntegramId)
      }

      // Используем ISO формат для DATETIME типа таблицы
      const now = new Date()
      const transactionName = now.toISOString()

      // Всегда рассчитываем стоимость локально в копейках по ценам Polza.ai
      // Токены и стоимость
      const inputTokens = data.inputTokens || 0
      const outputTokens = data.outputTokens || 0
      const totalCost = calculateCost(data.model, inputTokens, outputTokens)
      const polzaCost = data.polzaCost || data.cost || 0  // Цена из ответа Polza API (usage.cost)

      // ВАЖНО: Убедимся, что модели загружены перед получением ID
      if (!this.modelsLoaded) {
        console.log('[IntegramChatSession] Models not loaded yet, loading now...')
        await this.loadModelsMap()
      }

      // Получаем ID модели в Integram (из динамического маппинга)
      const modelId = this.getModelId(data.model)

      // Формируем реквизиты транзакции
      const requisites = {
        [TRANSACTION_REQUISITES.MODEL]: modelId,
        [TRANSACTION_REQUISITES.QUESTION]: data.userMessage || '',
        [TRANSACTION_REQUISITES.ANSWER]: data.assistantMessage || '',
        [TRANSACTION_REQUISITES.INPUT_TOKENS]: String(inputTokens),
        [TRANSACTION_REQUISITES.OUTPUT_TOKENS]: String(outputTokens),
        [TRANSACTION_REQUISITES.COST]: String(totalCost),
        [TRANSACTION_REQUISITES.POLZA_COST]: String(polzaCost),  // Цена из Polza API
        [TRANSACTION_REQUISITES.SYSTEM_PROMPT]: data.systemPrompt || ''
      }

      console.log('[IntegramChatSession] Creating transaction with:', {
        model: data.model,
        modelId,
        inputTokens,
        outputTokens,
        costInRubles: totalCost,
        polzaCost
      })

      // Создаем транзакцию как дочерний объект сессии
      console.log('[IntegramChatSession] Creating transaction with parentId:', sessionIntegramId)

      const result = await integramApiClient.createObject(
        TYPE_IDS.TRANSACTION,
        transactionName,
        requisites,
        sessionIntegramId // parentId - привязка к сессии
      )

      console.log('[IntegramChatSession] Transaction createObject response:', JSON.stringify(result))

      // API может вернуть id или obj
      const transactionId = result?.id || result?.obj

      if (result && transactionId) {
        console.log(`[IntegramChatSession] Transaction created:`, transactionId)

        // Обновляем время последней активности сессии
        await integramApiClient.setObjectRequisites(sessionIntegramId, {
          [SESSION_REQUISITES.LAST_ACTIVITY]: new Date().toISOString()
        })

        return { success: true, transactionId: transactionId }
      } else {
        throw new Error(result?.error || 'Failed to create transaction')
      }
    } catch (error) {
      console.error('[IntegramChatSession] Failed to create transaction:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Сохраняет пару вопрос-ответ как ОДНУ транзакцию
   *
   * @param {Object} data - Данные обмена сообщениями
   * @param {string} data.sessionId - ID сессии
   * @param {string} data.userMessage - Сообщение пользователя
   * @param {string} data.assistantMessage - Ответ ассистента
   * @param {string} data.model - Название модели
   * @param {number} data.inputTokens - Входящих токенов
   * @param {number} data.outputTokens - Исходящих токенов
   * @param {number} [data.cost] - Стоимость из API ответа (если не передана, рассчитывается локально)
   * @param {string} data.systemPrompt - Системный промпт
   * @returns {Promise<Object>} Результат с ID транзакции
   */
  async saveMessageExchange(data) {
    try {
      // Создаем одну транзакцию с вопросом и ответом
      const result = await this.createMessageTransaction({
        sessionId: data.sessionId,
        userMessage: data.userMessage,
        assistantMessage: data.assistantMessage,
        model: data.model,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        cost: data.cost, // Pass cost from API response
        systemPrompt: data.systemPrompt
      })

      return result
    } catch (error) {
      console.error('[IntegramChatSession] Failed to save message exchange:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Обновляет сообщения в сессии (legacy - для обратной совместимости)
   * @param {string} sessionId - ID сессии (из Polza)
   * @param {Array} messages - Массив сообщений
   * @returns {Promise<Object>} Результат обновления
   */
  async updateMessages(sessionId, messages) {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult) {
        return { success: false, error: 'Failed to initialize' }
      }
    }

    try {
      const integramId = this.sessionsCache.get(sessionId)

      if (!integramId) {
        console.warn('[IntegramChatSession] Session not found in cache:', sessionId)
        return { success: false, error: 'Session not found in cache' }
      }

      const now = new Date().toISOString()

      // Обновляем объект сессии через прямой API
      const result = await integramApiClient.setObjectRequisites(integramId, {
        [SESSION_REQUISITES.MESSAGES_JSON]: JSON.stringify(messages),
        [SESSION_REQUISITES.LAST_ACTIVITY]: now
      })

      console.log('[IntegramChatSession] Messages updated for session:', sessionId)
      return { success: true }
    } catch (error) {
      console.error('[IntegramChatSession] Failed to update messages:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Получает данные сессии из Integram
   * @param {string} sessionId - ID сессии
   * @returns {Promise<Object>} Данные сессии
   */
  async getSession(sessionId) {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult) {
        return { success: false, messages: [] }
      }
    }

    try {
      const integramId = this.sessionsCache.get(sessionId)

      if (!integramId) {
        return { success: false, messages: [] }
      }

      const result = await integramApiClient.getObjectEditData(integramId)

      if (result && result.reqs) {
        const messagesJson = result.reqs?.[SESSION_REQUISITES.MESSAGES_JSON]?.value
        return {
          success: true,
          integramId,
          sessionId,
          messages: messagesJson ? JSON.parse(messagesJson) : [],
          systemPrompt: result.reqs?.[SESSION_REQUISITES.SYSTEM_PROMPT]?.value,
          lastActivity: result.reqs?.[SESSION_REQUISITES.LAST_ACTIVITY]?.value
        }
      } else {
        return { success: false, messages: [] }
      }
    } catch (error) {
      console.error('[IntegramChatSession] Failed to get session:', error)
      return { success: false, messages: [], error: error.message }
    }
  }

  /**
   * Загружает транзакции сессии из Integram
   * @param {string} sessionId - ID сессии
   * @returns {Promise<Array>} Список транзакций
   */
  async getSessionTransactions(sessionId) {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult) {
        return []
      }
    }

    try {
      const integramId = this.sessionsCache.get(sessionId)

      if (!integramId) {
        return []
      }

      const result = await integramApiClient.getObjectList(TYPE_IDS.TRANSACTION, {
        offset: 0,
        limit: 100,
        F_U: integramId  // Фильтр по родителю (сессии)
      })

      if (result && result.object) {
        return result.object || []
      } else {
        return []
      }
    } catch (error) {
      console.error('[IntegramChatSession] Failed to get session transactions:', error)
      return []
    }
  }

  /**
   * Загружает историю сессий из Integram
   * @param {number} limit - Количество сессий
   * @returns {Promise<Array>} Список сессий
   */
  async loadSessionHistory(limit = 50) {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult) {
        return []
      }
    }

    try {
      const result = await integramApiClient.getObjectList(TYPE_IDS.SESSION, {
        offset: 0,
        limit,
        F_U: this.currentTokenId
      })

      if (result && result.object) {
        return result.object || []
      } else {
        return []
      }
    } catch (error) {
      console.error('[IntegramChatSession] Failed to load session history:', error)
      return []
    }
  }

  /**
   * Устанавливает текущий токен
   * @param {string} tokenId - ID токена в Integram
   */
  setCurrentToken(tokenId) {
    this.currentTokenId = tokenId
    localStorage.setItem('current_ai_token_id', tokenId)
  }

  /**
   * Очищает кэш сессий
   */
  clearCache() {
    this.sessionsCache.clear()
    localStorage.removeItem('integram_sessions_cache')
    console.log('[IntegramChatSession] Cache cleared')
  }
}

// Singleton instance
export const integramChatSessionService = new IntegramChatSessionService()

export default integramChatSessionService
