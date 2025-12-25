import OpenAI from 'openai'
import { BaseProvider } from './BaseProvider.js'

/**
 * OpenAI Provider Adapter
 */
export class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config)
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://api.openai.com/v1'
    })
  }

  async chat(request) {
    const providerRequest = this._transformRequest(request)

    try {
      if (request.options?.stream && request.options?.onStreamChunk) {
        const stream = await this.client.chat.completions.create(providerRequest)
        return await this._handleStream(stream, request.options.onStreamChunk)
      } else {
        const response = await this.client.chat.completions.create(providerRequest)
        return this._transformResponse(response)
      }
    } catch (error) {
      throw new Error(`OpenAI API error: ${error.message}. Status: ${error.status || 'unknown'}`)
    }
  }

  _transformRequest(request) {
    const { messages, model, options = {} } = request

    const providerRequest = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP ?? 0.9
    }

    if (options.tools && options.tools.length > 0) {
      providerRequest.tools = options.tools
    }

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
        totalTokens: response.usage?.total_tokens || 0
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

      if (!model && chunk.model) {
        model = chunk.model
      }

      if (delta.content) {
        fullContent += delta.content
        onChunk({
          type: 'content',
          content: delta.content
        })
      }

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

      if (chunk.usage) {
        usage = chunk.usage
      }
    }

    onChunk({
      type: 'done',
      usage: usage ? {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0
      } : null
    })

    return {
      content: fullContent,
      toolCalls: toolCalls.filter(Boolean),
      usage: usage ? {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0
      } : null,
      model: model || 'unknown',
      finishReason: 'stop'
    }
  }

  async getModels() {
    const response = await this.client.models.list()
    return response.data
  }
}
