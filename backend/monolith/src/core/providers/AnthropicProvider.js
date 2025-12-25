import Anthropic from '@anthropic-ai/sdk'
import { BaseProvider } from './BaseProvider.js'

/**
 * Anthropic Provider Adapter
 * Anthropic has its own API format (not OpenAI-compatible)
 */
export class AnthropicProvider extends BaseProvider {
  constructor(config) {
    super(config)
    this.client = new Anthropic({
      apiKey: config.apiKey
    })
  }

  async chat(request) {
    const providerRequest = this._transformRequest(request)

    try {
      if (request.options?.stream && request.options?.onStreamChunk) {
        const stream = await this.client.messages.create(providerRequest)
        return await this._handleStream(stream, request.options.onStreamChunk)
      } else {
        const response = await this.client.messages.create(providerRequest)
        return this._transformResponse(response)
      }
    } catch (error) {
      throw new Error(`Anthropic API error: ${error.message}. Status: ${error.status || 'unknown'}`)
    }
  }

  _transformRequest(request) {
    const { messages, model, options = {} } = request

    // Anthropic requires system message separate
    const systemMessage = messages.find(m => m.role === 'system')
    const conversationMessages = messages.filter(m => m.role !== 'system')

    const providerRequest = {
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      messages: conversationMessages
    }

    if (systemMessage) {
      providerRequest.system = systemMessage.content
    }

    if (options.tools && options.tools.length > 0) {
      // Convert OpenAI tool format to Anthropic format
      providerRequest.tools = options.tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters
      }))
    }

    if (options.stream) {
      providerRequest.stream = true
    }

    return providerRequest
  }

  _transformResponse(response) {
    const content = response.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('')

    const toolCalls = response.content
      .filter(c => c.type === 'tool_use')
      .map(c => ({
        id: c.id,
        name: c.name,
        arguments: JSON.stringify(c.input)
      }))

    return {
      content,
      toolCalls,
      usage: {
        promptTokens: response.usage?.input_tokens || 0,
        completionTokens: response.usage?.output_tokens || 0,
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
      },
      model: response.model,
      finishReason: response.stop_reason
    }
  }

  async _handleStream(stream, onChunk) {
    let fullContent = ''
    let toolCalls = []
    let usage = null
    let model = null

    for await (const chunk of stream) {
      if (chunk.type === 'message_start') {
        model = chunk.message.model
        usage = chunk.message.usage
      }

      if (chunk.type === 'content_block_delta') {
        if (chunk.delta.type === 'text_delta') {
          fullContent += chunk.delta.text
          onChunk({
            type: 'content',
            content: chunk.delta.text
          })
        }

        if (chunk.delta.type === 'input_json_delta') {
          // Handle tool call streaming
          // Anthropic streams tool call inputs as JSON deltas
        }
      }

      if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
        toolCalls.push({
          id: chunk.content_block.id,
          name: chunk.content_block.name,
          arguments: ''
        })
      }

      if (chunk.type === 'message_delta' && chunk.usage) {
        usage = chunk.usage
      }
    }

    onChunk({
      type: 'done',
      usage: usage ? {
        promptTokens: usage.input_tokens || 0,
        completionTokens: usage.output_tokens || 0,
        totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
      } : null
    })

    return {
      content: fullContent,
      toolCalls: toolCalls.filter(Boolean),
      usage: usage ? {
        promptTokens: usage.input_tokens || 0,
        completionTokens: usage.output_tokens || 0,
        totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
      } : null,
      model: model || 'unknown',
      finishReason: 'stop'
    }
  }

  async getModels() {
    return []
  }
}
