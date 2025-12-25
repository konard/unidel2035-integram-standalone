import { BaseProvider } from './BaseProvider.js'

/**
 * Polza.ai Provider Adapter
 * Uses direct fetch instead of OpenAI SDK to avoid compatibility issues (Issue #5112)
 */
export class PolzaProvider extends BaseProvider {
  constructor(config) {
    super(config)
    this.apiKey = config.apiKey
    this.baseURL = config.baseURL || 'https://api.polza.ai/api/v1'
  }

  async chat(request) {
    const providerRequest = this._transformRequest(request)

    // Log FULL request body for debugging
    const requestBody = JSON.stringify(providerRequest)
    console.log('[PolzaProvider] FULL REQUEST BODY:', requestBody)

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(providerRequest)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[PolzaProvider] API Error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        })
        throw new Error(`Polza API error: ${response.status} ${response.statusText}. Body: ${errorText}`)
      }

      const data = await response.json()
      return this._transformResponse(data)
    } catch (error) {
      console.error('[PolzaProvider] Error:', error.message)
      throw new Error(
        `Polza API error: ${error.message}. Model: ${request.model}`
      )
    }
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

  async getModels() {
    return []
  }
}
