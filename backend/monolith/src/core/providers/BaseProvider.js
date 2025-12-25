/**
 * Base Provider Interface
 * All AI provider adapters must implement this interface
 */
export class BaseProvider {
  constructor(config) {
    this.config = config
    this.name = config.name || 'unknown'
    this.baseURL = config.baseURL
    this.apiKey = config.apiKey
  }

  /**
   * Format base system prompt with provider-specific headers/format
   * Providers override this to add their formatting (e.g., Koda adds CLI headers)
   * @param {string} baseMcpPrompt - Base MCP prompt content (same for all providers)
   * @returns {string} Formatted system prompt
   */
  _formatSystemPrompt(baseMcpPrompt) {
    // Default: return base prompt as-is (no special formatting)
    return baseMcpPrompt;
  }

  /**
   * Send chat completion request in unified format
   * @param {Object} request - Unified request format
   * @param {Array} request.messages - Array of {role, content}
   * @param {string} request.model - Model ID
   * @param {Object} request.options - Additional options
   * @param {number} request.options.temperature
   * @param {number} request.options.maxTokens
   * @param {boolean} request.options.stream
   * @param {Array} request.options.tools - Function calling tools
   * @param {Function} request.options.onStreamChunk - Streaming callback
   * @returns {Promise<Object>} Unified response format
   */
  async chat(request) {
    throw new Error('chat() must be implemented by provider')
  }

  /**
   * Get supported models
   * @returns {Promise<Array>} List of supported models
   */
  async getModels() {
    throw new Error('getModels() must be implemented by provider')
  }

  /**
   * Transform unified request to provider-specific format
   * @param {Object} request - Unified request
   * @returns {Object} Provider-specific request
   */
  _transformRequest(request) {
    throw new Error('_transformRequest() must be implemented by provider')
  }

  /**
   * Transform provider response to unified format
   * @param {Object} response - Provider response
   * @returns {Object} Unified response format:
   * {
   *   content: string,
   *   toolCalls: Array<{id, name, arguments}>,
   *   usage: {promptTokens, completionTokens, totalTokens},
   *   model: string,
   *   finishReason: string
   * }
   */
  _transformResponse(response) {
    throw new Error('_transformResponse() must be implemented by provider')
  }

  /**
   * Handle streaming response
   * @param {AsyncIterator} stream - Provider stream
   * @param {Function} onChunk - Callback(chunk in unified format)
   * @returns {Promise<Object>} Final unified response
   */
  async _handleStream(stream, onChunk) {
    throw new Error('_handleStream() must be implemented by provider')
  }
}
