import OpenAI from 'openai'
import { BaseProvider } from './BaseProvider.js'

/**
 * Kodacode Provider Adapter
 * Kodacode is an OpenAI-compatible gateway to multiple AI models
 * Supports token rotation on rate limit (429) errors
 */
export class KodacodeProvider extends BaseProvider {
  constructor(config) {
    super(config)

    // Parse multiple tokens from KODACODE_TOKENS env var
    const tokensEnv = process.env.KODACODE_TOKENS || ''
    this.tokens = tokensEnv.split(',').map(t => t.trim()).filter(Boolean)

    // Add primary token if provided
    if (config.apiKey && !this.tokens.includes(config.apiKey)) {
      this.tokens.unshift(config.apiKey)
    }

    // Fallback to GITHUB_TOKEN if no tokens
    if (this.tokens.length === 0 && process.env.GITHUB_TOKEN) {
      this.tokens.push(process.env.GITHUB_TOKEN)
    }

    this.currentTokenIndex = 0
    this.baseURL = config.baseURL || 'https://api.kodacode.ru/v1'

    // Create initial client
    this._createClient()
  }

  _createClient() {
    const token = this.tokens[this.currentTokenIndex]
    this.client = new OpenAI({
      apiKey: token,
      baseURL: this.baseURL,
      defaultHeaders: {
        'HTTP-Referer': 'https://dev.drondoc.ru',
        'X-Title': 'DronDoc AI Platform'
      }
    })
  }

  _rotateToken() {
    if (this.tokens.length <= 1) {
      return false // No tokens to rotate to
    }

    const oldIndex = this.currentTokenIndex
    this.currentTokenIndex = (this.currentTokenIndex + 1) % this.tokens.length
    this._createClient()

    console.log(`[KodacodeProvider] Rotated token: ${oldIndex} -> ${this.currentTokenIndex}`)
    return true
  }

  /**
   * Format base MCP prompt with Koda-specific CLI headers
   * Koda requires: concise responses, Russian language, no small talk
   * @param {string} baseMcpPrompt - Base MCP instructions (same for all providers)
   * @returns {string} Formatted prompt with Koda CLI headers
   */
  _formatSystemPrompt(baseMcpPrompt) {
    return `Всегда отвечай на русском языке.

Краткость и прямота: максимум 3 строки текста на ответ (кроме вывода инструментов/кода). Без вводных "Хорошо, сейчас..." или "Я завершил...". Сразу к делу.

${baseMcpPrompt}

Безопасность: НЕ добавляй код с секретами, API ключами, чувствительными данными.`;
  }

  /**
   * Ensure system prompt is present in messages
   * Formats base MCP prompt with Koda CLI headers if no system message exists
   */
  _ensureSystemPrompt(request) {
    const { messages, options } = request;

    // Check if system message already exists
    const hasSystemMessage = messages.some(msg => msg.role === 'system');

    // If no system message and base MCP prompt is provided, format and add it
    if (!hasSystemMessage && options?.baseMcpPrompt) {
      const formattedPrompt = this._formatSystemPrompt(options.baseMcpPrompt);
      return {
        ...request,
        messages: [
          { role: 'system', content: formattedPrompt },
          ...messages
        ]
      };
    }

    return request;
  }

  async chat(request) {
    const maxRetries = this.tokens.length
    let lastError = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Add default system prompt if not provided and tools are available
        const requestWithPrompt = this._ensureSystemPrompt(request);
        const providerRequest = this._transformRequest(requestWithPrompt)

        if (request.options?.stream && request.options?.onStreamChunk) {
          // Streaming mode
          const stream = await this.client.chat.completions.create(providerRequest)
          return await this._handleStream(stream, request.options.onStreamChunk)
        } else {
          // Non-streaming mode
          const response = await this.client.chat.completions.create(providerRequest)
          return this._transformResponse(response)
        }
      } catch (error) {
        lastError = error

        // Log the actual error for debugging
        console.log(`[KodacodeProvider] Error on attempt ${attempt + 1}: status=${error.status}, message=${error.message}`)

        // Check for rate limit error - Kodacode returns 500 with "429" in body/message
        const errorStr = JSON.stringify(error)
        const isRateLimit = error.status === 429 ||
                           error.status === 500 ||  // Kodacode returns 500 for rate limits
                           error.message?.includes('429') ||
                           error.message?.includes('Rate limit') ||
                           errorStr.includes('429') ||
                           errorStr.includes('Rate limit')

        if (isRateLimit && this._rotateToken()) {
          console.log(`[KodacodeProvider] Rate limit hit (status ${error.status}), trying next token (attempt ${attempt + 1}/${maxRetries})`)
          continue
        }

        // Not a rate limit error or no more tokens
        console.log(`[KodacodeProvider] No more tokens to try or not a rate limit error`)
        break
      }
    }

    throw new Error(
      `Kodacode API error: ${lastError.message}. ` +
      `Status: ${lastError.status || 'unknown'}. ` +
      `Model: ${request.model}`
    )
  }

  _transformRequest(request) {
    const { messages, model, options = {} } = request

    const providerRequest = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096
    }

    // Add tools if provided (OpenAI format)
    if (options.tools && options.tools.length > 0) {
      providerRequest.tools = options.tools
    }

    // Add streaming
    if (options.stream) {
      providerRequest.stream = true
    }

    return providerRequest
  }

  _transformResponse(response) {
    const choice = response.choices[0]
    const message = choice.message

    return {
      content: message.content || '',
      toolCalls: message.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function?.name,
        arguments: tc.function?.arguments
      })) || [],
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
        cost: response.usage?.cost || 0
      },
      model: response.model,
      finishReason: choice.finish_reason
    }
  }

  async _handleStream(stream, onChunk) {
    let fullContent = ''
    let toolCalls = []
    let usage = null
    let model = null

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta
      if (!delta) continue

      // Extract model name from first chunk
      if (!model && chunk.model) {
        model = chunk.model
      }

      // Handle content streaming
      if (delta.content) {
        fullContent += delta.content
        // Send unified streaming chunk format
        onChunk({
          type: 'content',
          content: delta.content
        })
      }

      // Handle tool calls
      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          if (!toolCalls[toolCall.index]) {
            toolCalls[toolCall.index] = {
              id: toolCall.id,
              name: toolCall.function?.name || '',
              arguments: ''
            }
          }
          if (toolCall.function?.arguments) {
            toolCalls[toolCall.index].arguments += toolCall.function.arguments
          }
        }
      }

      // Extract usage from chunk
      if (chunk.usage) {
        usage = chunk.usage
      }
    }

    // Send completion signal
    onChunk({
      type: 'done',
      usage: usage ? {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        cost: usage.cost || 0
      } : null
    })

    // Return unified response
    return {
      content: fullContent,
      toolCalls: toolCalls.filter(Boolean),
      usage: usage ? {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        cost: usage.cost || 0
      } : null,
      model: model || 'unknown',
      finishReason: 'stop'
    }
  }

  async getModels() {
    // Kodacode provides access to multiple models
    // This would typically call /v1/models endpoint
    return []
  }
}
