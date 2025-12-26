/**
 * Сервис для работы с Polza.ai через оркестратор ДронДок
 * Предоставляет интерфейс для чата с моделями Polza.ai
 *
 * Автоматически сохраняет сессии и транзакции в Integram (Issue: Session Tracking)
 */

import apiClient from '../axios2.js'
import { integramChatSessionService } from './integramChatSessionService.js'

class PolzaService {
  constructor() {
    this.baseUrl = '/api/polza'
    this.sessionId = null
    this.messages = [] // Локальный кэш сообщений для сохранения в Integram
    this.currentModel = null
    this.systemPrompt = null
    this.availableModels = [
      { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
      { name: 'GPT-4', value: 'gpt-4' },
      { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
      { name: 'Claude 3 Sonnet', value: 'claude-3-sonnet' },
      { name: 'Claude 3 Opus', value: 'claude-3-opus' }
    ]
    // Cache for connection status and models
    this._connectionCache = { status: null, timestamp: null, ttl: 30000 } // 30 seconds
    this._modelsCache = { data: null, timestamp: null, ttl: 300000 } // 5 minutes
    this._pendingRequests = new Map()
  }

  /**
   * Создает новую сессию чата с Polza.ai
   * @param {Object} options - Опции сессии
   * @param {string} options.systemPrompt - Системный промпт
   * @param {string} options.model - Модель для использования
   * @param {string} options.userId - ID пользователя
   * @param {string} options.tokenId - ID токена в Integram для привязки сессии
   * @returns {Promise<Object>} Данные сессии
   */
  async createSession(options = {}) {
    try {
      const systemPrompt = options.systemPrompt || 'Ты полезный AI-помощник. Отвечай на русском языке кратко и по делу.'
      const model = options.model || 'gpt-3.5-turbo'

      const response = await apiClient.post(`${this.baseUrl}/session`, {
        systemPrompt,
        model,
        userId: options.userId || `user_${Date.now()}`
      })

      if (response.data.success) {
        this.sessionId = response.data.sessionId
        this.currentModel = model
        this.systemPrompt = systemPrompt
        this.messages = [] // Сброс сообщений для новой сессии

        // Сохраняем сессию в Integram
        try {
          if (options.tokenId) {
            integramChatSessionService.setCurrentToken(options.tokenId)
          }
          await integramChatSessionService.createSession({
            sessionId: this.sessionId,
            model: model,
            systemPrompt: systemPrompt
          })
          console.log('[PolzaService] Session saved to Integram:', this.sessionId)
        } catch (integramError) {
          console.warn('[PolzaService] Failed to save session to Integram:', integramError)
          // Не прерываем работу если Integram недоступен
        }

        return response.data
      } else {
        throw new Error(response.data.error || 'Не удалось создать сессию')
      }
    } catch (error) {
      console.error('Ошибка создания сессии Polza.ai:', error)
      throw error
    }
  }

  /**
   * Отправляет сообщение в чат и получает ответ
   * @param {string} message - Сообщение пользователя
   * @param {Object} options - Дополнительные опции
   * @returns {Promise<Object>} Ответ от AI
   */
  async sendMessage(message, options = {}) {
    try {
      if (!this.sessionId) {
        await this.createSession(options)
      }

      const model = options.model || this.currentModel || 'gpt-3.5-turbo'

      const response = await apiClient.post(`${this.baseUrl}/chat`, {
        sessionId: this.sessionId,
        message: message,
        model: model,
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 2048,
        attachments: options.attachments || []
      })

      if (response.data.success) {
        // Сохраняем сообщения в Integram
        try {
          // Добавляем сообщение пользователя
          this.messages.push({
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
          })

          // Добавляем ответ ассистента
          if (response.data.message) {
            this.messages.push({
              role: 'assistant',
              content: response.data.message,
              timestamp: new Date().toISOString()
            })
          }

          // Обновляем сообщения в Integram
          await integramChatSessionService.updateMessages(this.sessionId, this.messages)

          // Создаем транзакцию если есть данные об использовании токенов
          if (response.data.usage) {
            await integramChatSessionService.createTransaction({
              sessionId: this.sessionId,
              tokensUsed: response.data.usage.total_tokens || 0,
              promptTokens: response.data.usage.prompt_tokens || 0,
              completionTokens: response.data.usage.completion_tokens || 0,
              model: model,
              type: 'chat'
            })
          }

          console.log('[PolzaService] Messages and transaction saved to Integram')
        } catch (integramError) {
          console.warn('[PolzaService] Failed to save to Integram:', integramError)
          // Не прерываем работу если Integram недоступен
        }

        return response.data
      } else {
        throw new Error(response.data.error || 'Ошибка отправки сообщения')
      }
    } catch (error) {
      console.error('Ошибка отправки сообщения в Polza.ai:', error)
      throw error
    }
  }

  /**
   * Проверяет соединение с Polza.ai (с кэшированием)
   * @returns {Promise<boolean>} Статус соединения
   */
  async checkConnection() {
    try {
      // Check cache first
      const now = Date.now()
      if (this._connectionCache.status !== null && this._connectionCache.timestamp) {
        const age = now - this._connectionCache.timestamp
        if (age < this._connectionCache.ttl) {
          console.log('[PolzaService] Returning cached connection status', { age: age + 'ms' })
          return this._connectionCache.status
        }
      }

      // Check for pending request
      const pendingKey = 'connection-check'
      if (this._pendingRequests.has(pendingKey)) {
        console.log('[PolzaService] Waiting for pending connection check')
        return await this._pendingRequests.get(pendingKey)
      }

      // Create new request
      const requestPromise = (async () => {
        try {
          const response = await apiClient.get(`${this.baseUrl}/health`)
          const status = response.data.success === true

          // Update cache
          this._connectionCache.status = status
          this._connectionCache.timestamp = Date.now()

          return status
        } catch (error) {
          console.error('Ошибка проверки соединения Polza.ai:', error)
          // Cache the failure too, but for shorter time
          this._connectionCache.status = false
          this._connectionCache.timestamp = Date.now()
          this._connectionCache.ttl = 10000 // 10 seconds for failures
          return false
        } finally {
          this._pendingRequests.delete(pendingKey)
        }
      })()

      this._pendingRequests.set(pendingKey, requestPromise)
      return await requestPromise
    } catch (error) {
      this._pendingRequests.delete('connection-check')
      console.error('Ошибка проверки соединения Polza.ai:', error)
      return false
    }
  }

  /**
   * Получает список доступных моделей (с кэшированием)
   * @returns {Promise<Array>} Список моделей
   */
  async getAvailableModels() {
    try {
      // Check cache first
      const now = Date.now()
      if (this._modelsCache.data && this._modelsCache.timestamp) {
        const age = now - this._modelsCache.timestamp
        if (age < this._modelsCache.ttl) {
          console.log('[PolzaService] Returning cached models', { age: age + 'ms' })
          return this._modelsCache.data
        }
      }

      // Check for pending request
      const pendingKey = 'models-fetch'
      if (this._pendingRequests.has(pendingKey)) {
        console.log('[PolzaService] Waiting for pending models request')
        return await this._pendingRequests.get(pendingKey)
      }

      // Create new request
      const requestPromise = (async () => {
        try {
          const response = await apiClient.get(`${this.baseUrl}/models`)
          const models = response.data.success ? (response.data.models || this.availableModels) : this.availableModels

          // Update cache
          this._modelsCache.data = models
          this._modelsCache.timestamp = Date.now()

          return models
        } catch (error) {
          console.error('Ошибка получения моделей Polza.ai:', error)
          // Return default models and cache them
          this._modelsCache.data = this.availableModels
          this._modelsCache.timestamp = Date.now()
          return this.availableModels
        } finally {
          this._pendingRequests.delete(pendingKey)
        }
      })()

      this._pendingRequests.set(pendingKey, requestPromise)
      return await requestPromise
    } catch (error) {
      this._pendingRequests.delete('models-fetch')
      console.error('Ошибка получения моделей Polza.ai:', error)
      return this.availableModels
    }
  }

  /**
   * Завершает текущую сессию
   * @returns {Promise<boolean>} Результат завершения
   */
  async terminateSession() {
    try {
      if (!this.sessionId) return true

      const response = await apiClient.post(`${this.baseUrl}/terminate`, {
        sessionId: this.sessionId
      })

      this.sessionId = null
      return response.data.success === true
    } catch (error) {
      console.error('Ошибка завершения сессии Polza.ai:', error)
      this.sessionId = null
      return false
    }
  }

  /**
   * Создает агента для специализированных задач
   * @param {Object} agentConfig - Конфигурация агента
   * @returns {Promise<Object>} Данные агента
   */
  async createAgent(agentConfig) {
    try {
      const response = await apiClient.post(`${this.baseUrl}/agent`, {
        agentId: agentConfig.agentId || `agent_${Date.now()}`,
        agentType: agentConfig.type || 'general',
        capabilities: agentConfig.capabilities || ['chat'],
        model: agentConfig.model || 'gpt-3.5-turbo',
        systemPrompt: agentConfig.systemPrompt
      })

      if (response.data.success) {
        return response.data
      } else {
        throw new Error(response.data.error || 'Не удалось создать агента')
      }
    } catch (error) {
      console.error('Ошибка создания агента Polza.ai:', error)
      throw error
    }
  }

  /**
   * Отправляет задачу агенту
   * @param {string} agentId - ID агента
   * @param {string} task - Описание задачи
   * @param {Object} context - Контекст задачи
   * @returns {Promise<Object>} Результат выполнения задачи
   */
  async sendTaskToAgent(agentId, task, context = {}) {
    try {
      const response = await apiClient.post(`${this.baseUrl}/agent-task`, {
        agentId: agentId,
        task: task,
        context: context
      })

      if (response.data.success) {
        return response.data
      } else {
        throw new Error(response.data.error || 'Ошибка выполнения задачи')
      }
    } catch (error) {
      console.error('Ошибка отправки задачи агенту Polza.ai:', error)
      throw error
    }
  }

  /**
   * Получает статус агента
   * @param {string} agentId - ID агента
   * @returns {Promise<Object>} Статус агента
   */
  async getAgentStatus(agentId) {
    try {
      const response = await apiClient.get(`${this.baseUrl}/agent-status/${agentId}`)
      return response.data
    } catch (error) {
      console.error('Ошибка получения статуса агента Polza.ai:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Завершает работу агента
   * @param {string} agentId - ID агента
   * @returns {Promise<boolean>} Результат завершения
   */
  async terminateAgent(agentId) {
    try {
      const response = await apiClient.post(`${this.baseUrl}/agent-terminate`, {
        agentId: agentId
      })

      return response.data.success === true
    } catch (error) {
      console.error('Ошибка завершения агента Polza.ai:', error)
      return false
    }
  }

  /**
   * Получает информацию о провайдере
   * @returns {Promise<Object>} Информация о провайдере
   */
  async getProviderInfo() {
    try {
      const response = await apiClient.get(`${this.baseUrl}/provider-info`)
      return response.data
    } catch (error) {
      console.error('Ошибка получения информации о провайдере:', error)
      return {
        provider: 'polza_ai',
        name: 'Polza.ai',
        status: 'unknown'
      }
    }
  }

  /**
   * Валидирует модель
   * @param {string} model - Название модели
   * @returns {boolean} Валидность модели
   */
  validateModel(model) {
    return this.availableModels.some(m => m.value === model)
  }

  /**
   * Получает информацию о модели
   * @param {string} model - Название модели
   * @returns {Object} Информация о модели
   */
  getModelInfo(model) {
    const modelInfo = this.availableModels.find(m => m.value === model)
    return modelInfo || {
      name: model,
      description: 'Неизвестная модель',
      value: model
    }
  }

  /**
   * Сбрасывает сессию (для нового чата)
   */
  resetSession() {
    this.sessionId = null
    this.messages = []
    this.currentModel = null
    this.systemPrompt = null
    integramChatSessionService.clearCache()
  }

  /**
   * Очистить кэш (для отладки)
   */
  clearCache() {
    this._connectionCache = { status: null, timestamp: null, ttl: 30000 }
    this._modelsCache = { data: null, timestamp: null, ttl: 300000 }
    this._pendingRequests.clear()
    console.log('[PolzaService] Cache cleared')
  }

  /**
   * Проверяет, активна ли сессия
   * @returns {boolean} Статус сессии
   */
  hasActiveSession() {
    return this.sessionId !== null
  }
}

// Экспортируем singleton instance
export default new PolzaService()