// LLMCoordinator.js - Centralized LLM management
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { LRUCache, limitArraySize } from '../utils/memoryOptimization.js'

export class LLMCoordinator {
  constructor(config = {}) {
    this.config = {
      provider: config.provider || 'anthropic',
      defaultModel: config.defaultModel || 'claude-3-5-sonnet-20241022',
      fallbackModel: config.fallbackModel || 'claude-3-haiku-20240307',
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 30000,
      cache: {
        enabled: config.cache?.enabled !== false,
        ttl: config.cache?.ttl || 3600
      },
      rateLimit: {
        requestsPerMinute: config.rateLimit?.requestsPerMinute || 50,
        tokensPerMinute: config.rateLimit?.tokensPerMinute || 100000
      },
      ...config
    }

    this.client = null
    // Issue #2157: Use LRUCache to prevent unbounded memory growth
    this.cache = new LRUCache(1000) // Cache up to 1,000 responses
    this.requestQueue = [] // Will be limited in _checkRateLimit
    this.maxRequestQueueSize = 1000 // Max pending requests
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      totalTokens: 0
    }
    this.rateLimitState = {
      requests: [],
      tokens: []
    }

    this._initializeClient()
    this._startCacheCleanup()
  }

  /**
   * Initialize LLM client (Anthropic or OpenAI)
   * @private
   */
  _initializeClient() {
    if (this.config.provider === 'anthropic') {
      this.client = new Anthropic({
        apiKey: this.config.apiKey || process.env.ANTHROPIC_API_KEY
      })
    } else if (this.config.provider === 'openai') {
      this.client = new OpenAI({
        apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
        baseURL: this.config.baseURL
      })
    } else {
      throw new Error(`Unknown provider: ${this.config.provider}`)
    }
  }

  /**
   * Chat completion
   */
  async chat(prompt, options = {}) {
    const model = options.model || this.config.defaultModel
    const temperature = options.temperature ?? 0.2
    const maxTokens = options.maxTokens || 4096

    // Check cache if enabled
    if (this.config.cache.enabled && !options.skipCache) {
      const cacheKey = this._getCacheKey(prompt, { model, temperature })
      const cached = this._getFromCache(cacheKey)
      if (cached) {
        this.metrics.cacheHits++
        return cached
      }
      this.metrics.cacheMisses++
    }

    // Check rate limits
    await this._checkRateLimit(maxTokens)

    this.metrics.totalRequests++

    try {
      const messages = Array.isArray(prompt)
        ? prompt
        : [{ role: 'user', content: prompt }]

      let result

      if (this.config.provider === 'anthropic') {
        const response = await this._executeWithRetry(async () => {
          return await this.client.messages.create({
            model,
            max_tokens: maxTokens,
            temperature,
            messages,
            ...options.additionalParams
          })
        })

        result = {
          content: response.content[0].text,
          usage: {
            prompt_tokens: response.usage.input_tokens,
            completion_tokens: response.usage.output_tokens,
            total_tokens: response.usage.input_tokens + response.usage.output_tokens
          },
          model: response.model
        }
      } else if (this.config.provider === 'openai') {
        const response = await this._executeWithRetry(async () => {
          return await this.client.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            ...options.additionalParams
          })
        })

        result = {
          content: response.choices[0].message.content,
          usage: response.usage,
          model: response.model
        }
      }

      // Update metrics
      if (result.usage) {
        this.metrics.totalTokens += result.usage.total_tokens
      }

      // Cache result
      if (this.config.cache.enabled && !options.skipCache) {
        const cacheKey = this._getCacheKey(prompt, { model, temperature })
        this._setCache(cacheKey, result)
      }

      return result
    } catch (error) {
      this.metrics.errors++
      throw error
    }
  }

  /**
   * Execute with retry logic
   * @private
   */
  async _executeWithRetry(fn) {
    let lastError
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await this._sleep(1000 * Math.pow(2, attempt))
        }
        return await fn()
      } catch (error) {
        lastError = error
        if (!this._isRetryableError(error)) {
          throw error
        }
      }
    }
    throw lastError
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isRetryableError(error) {
    const retryableCodes = [429, 500, 502, 503, 504]
    return retryableCodes.includes(error.status)
  }

  /**
   * Check rate limits
   * @private
   */
  async _checkRateLimit(estimatedTokens = 1000) {
    const now = Date.now()
    const oneMinuteAgo = now - 60000

    // Clean old entries
    this.rateLimitState.requests = this.rateLimitState.requests.filter(
      t => t > oneMinuteAgo
    )
    this.rateLimitState.tokens = this.rateLimitState.tokens.filter(
      t => t.timestamp > oneMinuteAgo
    )

    // Check request limit
    if (
      this.rateLimitState.requests.length >= this.config.rateLimit.requestsPerMinute
    ) {
      const waitTime =
        60000 - (now - this.rateLimitState.requests[0])
      await this._sleep(waitTime)
      return this._checkRateLimit(estimatedTokens)
    }

    // Check token limit
    const tokenSum = this.rateLimitState.tokens.reduce(
      (sum, entry) => sum + entry.tokens,
      0
    )
    if (tokenSum + estimatedTokens >= this.config.rateLimit.tokensPerMinute) {
      const waitTime =
        60000 - (now - this.rateLimitState.tokens[0].timestamp)
      await this._sleep(waitTime)
      return this._checkRateLimit(estimatedTokens)
    }

    // Record this request
    this.rateLimitState.requests.push(now)
    this.rateLimitState.tokens.push({ timestamp: now, tokens: estimatedTokens })
  }

  /**
   * Get cache key
   * @private
   */
  _getCacheKey(prompt, options) {
    const normalized = typeof prompt === 'string' ? prompt : JSON.stringify(prompt)
    return `${normalized}:${options.model}:${options.temperature}`
  }

  /**
   * Get from cache
   * Issue #2157: Now uses LRUCache with automatic size limits
   * @private
   */
  _getFromCache(key) {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.cache.ttl * 1000) {
      this.cache.delete(key)
      return null
    }

    return entry.value
  }

  /**
   * Set cache
   * @private
   */
  _setCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    })
  }

  /**
   * Start cache cleanup interval
   * @private
   */
  _startCacheCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      const ttl = this.config.cache.ttl * 1000

      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > ttl) {
          this.cache.delete(key)
        }
      }
    }, 60000) // Run every minute
  }

  /**
   * Get prompt template
   */
  getTemplate(templateName) {
    return promptTemplates[templateName] || null
  }

  /**
   * Render template with variables
   */
  renderTemplate(templateName, variables = {}) {
    const template = this.getTemplate(templateName)
    if (!template) {
      throw new Error(`Template not found: ${templateName}`)
    }

    let rendered = template
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`{${key}}`, 'g'), value)
    }
    return rendered
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheHitRate: this.metrics.totalRequests > 0
        ? (this.metrics.cacheHits / this.metrics.totalRequests) * 100
        : 0,
      cacheSize: this.cache.size
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear()
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Cleanup
   */
  async cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.cache.clear()
  }
}

// Prompt templates
export const promptTemplates = {
  tableAnalysis: `Analyze the following table data and provide insights:

Schema: {schema}
Sample Data: {sample}
Focus Areas: {focus}

Please provide:
1. Key observations about the data structure
2. Data quality issues (if any)
3. Patterns and trends
4. Recommendations for improvements`,

  transformation: `Suggest data transformations for the following table:

Goal: {goal}
Current Schema: {schema}
Sample Data: {sample}

Please provide:
1. Required transformations to achieve the goal
2. Step-by-step transformation logic
3. Expected output format
4. Potential issues to watch for`,

  validation: `Analyze data quality and suggest validation rules:

Table Schema: {schema}
Sample Data: {sample}
Context: {context}

Please provide:
1. Recommended validation rules
2. Common data quality issues to check
3. Business rules that should be enforced
4. Data integrity constraints`,

  report: `Generate a narrative report based on table data:

Table Name: {tableName}
Data Summary: {summary}
Key Metrics: {metrics}
Context: {context}

Please provide:
1. Executive summary
2. Key findings and insights
3. Trends and patterns
4. Recommendations and next steps`
}
