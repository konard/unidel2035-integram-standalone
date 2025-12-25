// TokenBasedLLMCoordinator.js - Extended LLM management with token-based auth
// Extends LLMCoordinator to support dynamic model selection via access tokens
// Issue #1121 - Token-based AI model selection system
// Issue #4873 - AI usage statistics logging to Integram

import { LLMCoordinator } from './LLMCoordinator.js'
import crypto from 'crypto'
import { LRUCache } from '../utils/memoryOptimization.js'
import tokenConsumptionLogger from '../services/ai/tokenConsumptionLogger.js'
import { convertToolsForProvider } from '../services/mcp-tools/tool-format-converter.js'

// Provider adapters
import { PolzaProvider } from './providers/PolzaProvider.js'
import { OpenAIProvider } from './providers/OpenAIProvider.js'
import { DeepSeekProvider } from './providers/DeepSeekProvider.js'
import { AnthropicProvider } from './providers/AnthropicProvider.js'
import { KodacodeProvider } from './providers/KodacodeProvider.js'

export class TokenBasedLLMCoordinator extends LLMCoordinator {
  constructor(config = {}) {
    super(config)

    this.db = config.db // PostgreSQL connection
    // Issue #2157: Use LRUCache to prevent unbounded memory growth
    this.tokenCache = new LRUCache(5000) // Cache up to 5,000 validated tokens
    this.modelCache = new LRUCache(500) // Cache up to 500 model configurations
    this.providerClients = new Map() // Provider clients are limited (few providers)
  }

  /**
   * Get base MCP system prompt (content, not format)
   * Same for all providers - providers wrap it in their own format
   * @param {Array} tools - MCP tools available
   * @returns {string|null} Base system prompt content
   */
  _getBaseMcpPrompt(tools) {
    if (!tools || tools.length === 0) {
      return null;
    }

    return `ВАЖНО: Когда пользователь спрашивает про таблицы, данные, или работу с базой данных Integram, используй MCP инструменты:

1. СНАЧАЛА ОБЯЗАТЕЛЬНО аутентифицируйся: integram_authenticate с параметрами:

   ДЕФОЛТНЫЕ ЗНАЧЕНИЯ (используй если пользователь НЕ указал свои):
   - serverURL: "https://example.integram.io"
   - database: "my"
   - login: "d"
   - password: "d"

   ЕСЛИ пользователь в своих сообщениях УКАЗАЛ другие значения (например другой URL, базу данных, логин или пароль),
   ОБЯЗАТЕЛЬНО используй ИХ вместо дефолтных! Извлекай параметры из контекста разговора.

2. Затем можешь использовать другие инструменты:
   - integram_get_dictionary - получить список всех таблиц (БЕЗ параметров)
   - integram_get_type_metadata - получить структуру таблицы
   - integram_smart_query - SQL-подобные запросы с WHERE, ORDER BY, LIMIT
   - integram_natural_query - запросы на естественном языке
   - integram_get_object_list - получить страницу объектов (с пагинацией!)
   - integram_get_object_edit_data - получить конкретный объект по ID
   - и другие...

КРИТИЧЕСКИ ВАЖНО - АВТОМАТИЧЕСКИЙ ПОИСК:
   Когда пользователь просит "найди X" или "ищи X" - ЭТО ЗНАЧИТ ИСКАТЬ ВО ВСЕЙ ТАБЛИЦЕ!

   ПРАВИЛЬНО (автоматический поиск по всей таблице):
   ✅ integram_smart_query с WHERE - ищет по ВСЕЙ таблице автоматически
   ✅ integram_natural_query - ищет по ВСЕЙ таблице автоматически

   НЕПРАВИЛЬНО (только первая страница):
   ❌ integram_get_object_list без итерации - покажет только первые 20 объектов
   ❌ НЕ спрашивай "хотите поискать дальше?" - АВТОМАТИЧЕСКИ ищи везде!

ПОИСК по ВСЕЙ таблице (используй ВСЕГДА для поиска конкретного объекта):

   1. integram_smart_query (РЕКОМЕНДУЕТСЯ - ищет по ВСЕМ объектам):
   {
     "tables": [{"id": 18, "alias": "u"}],
     "columns": [{"field": 18, "name": "Username"}, {"field": 33, "name": "Name"}],
     "where": "u.18 LIKE '%dmi%'",
     "limit": 100
   }

   2. integram_natural_query (для простых запросов - ищет по ВСЕМ объектам):
   {
     "question": "Найди пользователя dmi",
     "targetTable": 18,
     "limit": 100
   }

ПРОСМОТР списка (только когда пользователь явно просит "покажи список"):
   integram_get_object_list - показывает одну страницу (20 объектов)
   - НЕ используй для поиска конкретного объекта!
   - Используй только для просмотра списков: "покажи пользователей", "список таблиц"

Всегда СНАЧАЛА аутентифицируйся, иначе получишь ошибку "Не аутентифицирован".`;
  }

  /**
   * Validate access token and get permissions
   * @param {string} accessToken - The user's access token
   * @returns {Promise<Object>} Token validation result
   */
  async validateToken(accessToken) {
    // Check if database is available
    if (!this.db) {
      throw new Error('Database not configured. AI token features require database connection.')
    }

    // Check cache first
    const cacheKey = this._getTokenCacheKey(accessToken)
    const cached = this.tokenCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < 300000) { // 5 min cache
      return cached.data
    }

    // Hash the token
    const hash = crypto.createHash('sha256').update(accessToken).digest('hex')

    // Query database
    const result = await this.db.query(`
      SELECT
        id,
        user_id,
        name,
        scopes,
        allowed_models,
        allowed_applications,
        rate_limit_rpm,
        rate_limit_tpm,
        token_balance,
        daily_limit,
        monthly_limit,
        expires_at,
        is_active
      FROM ai_access_tokens
      WHERE token_hash = $1
    `, [hash])

    if (result.rows.length === 0) {
      throw new Error('Invalid access token')
    }

    const tokenData = result.rows[0]

    // Validate token status
    if (!tokenData.is_active) {
      throw new Error('Token is inactive')
    }

    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      throw new Error('Token has expired')
    }

    if (tokenData.token_balance <= 0) {
      throw new Error('Insufficient token balance')
    }

    // Get daily and monthly usage
    const usageResult = await this.db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN total_tokens ELSE 0 END), 0) as daily_usage,
        COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN total_tokens ELSE 0 END), 0) as monthly_usage
      FROM ai_token_usage
      WHERE access_token_id = $1
    `, [tokenData.id])

    const usage = usageResult.rows[0]

    // Check limits
    if (tokenData.daily_limit && usage.daily_usage >= tokenData.daily_limit) {
      throw new Error('Daily token limit exceeded')
    }

    if (tokenData.monthly_limit && usage.monthly_usage >= tokenData.monthly_limit) {
      throw new Error('Monthly token limit exceeded')
    }

    const validationResult = {
      tokenId: tokenData.id,
      userId: tokenData.user_id,
      name: tokenData.name,
      scopes: tokenData.scopes,
      allowedModels: tokenData.allowed_models,
      allowedApplications: tokenData.allowed_applications,
      rateLimitRpm: tokenData.rate_limit_rpm,
      rateLimitTpm: tokenData.rate_limit_tpm,
      tokenBalance: tokenData.token_balance,
      dailyUsage: parseInt(usage.daily_usage),
      monthlyUsage: parseInt(usage.monthly_usage),
      dailyLimit: tokenData.daily_limit,
      monthlyLimit: tokenData.monthly_limit
    }

    // Cache result
    this.tokenCache.set(cacheKey, {
      data: validationResult,
      timestamp: Date.now()
    })

    // Update last_used_at
    await this.db.query(`
      UPDATE ai_access_tokens
      SET last_used_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [tokenData.id])

    return validationResult
  }

  /**
   * Get default token for user
   * Issue #4566 - Fix 500 error in workspace-ai-agent chat endpoint
   * Issue #4722 - Fallback to DeepSeek if Polza API key is not configured
   *
   * Since the project uses mocked database (pool = null), this method returns
   * a virtual default token without database queries.
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Result with token and default model
   */
  async getDefaultToken(userId) {
    // If database is not configured, return a virtual default token
    if (!this.db) {
      // Create a virtual default token (no database storage needed)
      const defaultToken = {
        id: `default_${userId}`,
        token_prefix: 'dd_api_...',
        name: 'Integram API Access',
        user_id: userId,
        scopes: ['model:read', 'model:use'],
        allowed_models: ['*'],
        allowed_applications: ['*'],
        rate_limit_rpm: 60,
        rate_limit_tpm: 100000,
        token_balance: 999999999, // Effectively unlimited via Integram API
        daily_limit: 100000,
        monthly_limit: 1000000,
        expires_at: null,
        last_used_at: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      // Check which provider has an API key available (same logic as getModelConfig)
      const hasPolzaKey = !!process.env.POLZA_AI_API_KEY
      const hasDeepSeekKey = !!process.env.DEEPSEEK_API_KEY
      const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY

      // Determine default model based on available API keys
      let defaultModel

      if (hasPolzaKey) {
        defaultModel = {
          id: 'system_default',
          model_id: process.env.DEFAULT_AI_MODEL || 'anthropic/claude-sonnet-4.5',
          display_name: 'Claude Sonnet 4.5',
          description: 'Default AI model via Polza.ai',
          context_window: '200K',
          max_output_tokens: '8192',
          cost_per_1k_input: '3.00',
          cost_per_1k_output: '15.00',
          provider_name: 'polza',
          provider_display_name: 'Polza.ai',
          provider_base_url: process.env.POLZA_BASE_URL || 'https://api.polza.ai/api/v1'
        }
      } else if (hasDeepSeekKey) {
        defaultModel = {
          id: 'system_default',
          model_id: 'deepseek-chat',
          display_name: 'DeepSeek Chat',
          description: 'Fallback AI model via DeepSeek (Polza.ai not configured)',
          context_window: '200K',
          max_output_tokens: '8192',
          cost_per_1k_input: '0.14',
          cost_per_1k_output: '0.28',
          provider_name: 'deepseek',
          provider_display_name: 'DeepSeek',
          provider_base_url: 'https://api.deepseek.com'
        }
      } else if (hasAnthropicKey) {
        defaultModel = {
          id: 'system_default',
          model_id: 'claude-sonnet-4-20250514',
          display_name: 'Claude Sonnet 4',
          description: 'Fallback AI model via Anthropic (Polza.ai not configured)',
          context_window: '200K',
          max_output_tokens: '8192',
          cost_per_1k_input: '3.00',
          cost_per_1k_output: '15.00',
          provider_name: 'anthropic',
          provider_display_name: 'Anthropic',
          provider_base_url: 'https://api.anthropic.com'
        }
      } else if (hasOpenAIKey) {
        defaultModel = {
          id: 'system_default',
          model_id: 'gpt-4',
          display_name: 'GPT-4',
          description: 'Fallback AI model via OpenAI (Polza.ai not configured)',
          context_window: '200K',
          max_output_tokens: '8192',
          cost_per_1k_input: '30.00',
          cost_per_1k_output: '60.00',
          provider_name: 'openai',
          provider_display_name: 'OpenAI',
          provider_base_url: 'https://api.openai.com/v1'
        }
      } else {
        throw new Error(
          'No AI provider API keys configured. Please set at least one of: ' +
          'POLZA_AI_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY'
        )
      }

      return {
        success: true,
        data: {
          token: defaultToken,
          defaultModel: defaultModel
        }
      }
    }

    // If database is available (not currently the case), query for actual default token
    // This code path is not executed with current mock database setup
    try {
      const result = await this.db.query(`
        SELECT * FROM ai_access_tokens
        WHERE user_id = $1
          AND name = 'Default Token'
          AND is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      `, [userId])

      if (result.rows.length > 0) {
        const token = result.rows[0]

        // Get default model
        const modelResult = await this.db.query(`
          SELECT * FROM v_active_ai_models
          WHERE provider_name = 'deepseek'
          LIMIT 1
        `)

        const defaultModel = modelResult.rows[0] || null

        return {
          success: true,
          data: {
            token,
            defaultModel
          }
        }
      }

      // No default token found, return error
      return {
        success: false,
        error: 'No default token found for user'
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Get model configuration by ID
   * @param {string} modelId - UUID of the model
   * @returns {Promise<Object>} Model configuration
   */
  async getModelConfig(modelId) {
    // Check if database is available
    if (!this.db) {
      // Parse modelId to determine provider and model
      // Format: "provider/model" (e.g., "openai/gpt-4o", "anthropic/claude-sonnet-4.5")
      const parts = modelId.split('/');
      const requestedProvider = parts.length > 1 ? parts[0].toLowerCase() : null;
      const requestedModel = parts.length > 1 ? parts.slice(1).join('/') : modelId;

      // Check which provider has an API key available
      const hasPolzaKey = !!process.env.POLZA_AI_API_KEY;
      const hasDeepSeekKey = !!process.env.DEEPSEEK_API_KEY;
      const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      const hasKodacodeKey = !!process.env.GITHUB_TOKEN; // Kodacode accepts GitHub token

      // Model name mapping for common models without provider prefix
      const MODEL_MAPPINGS = {
        'claude-sonnet-4.5': 'anthropic/claude-sonnet-4.5',
        'claude-sonnet-3.5': 'anthropic/claude-3.5-sonnet',
        'claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet',
        'claude-opus': 'anthropic/claude-opus',
        'gpt-4o': 'openai/gpt-4o',
        'gpt-4': 'openai/gpt-4',
        'gpt-4-turbo': 'openai/gpt-4-turbo',
        'gpt-3.5-turbo': 'openai/gpt-3.5-turbo',
        'deepseek-chat': 'deepseek/deepseek-chat',
        'deepseek-code': 'deepseek/deepseek-code'
      };

      // If modelId has no provider prefix, check mappings
      if (!requestedProvider && MODEL_MAPPINGS[modelId]) {
        const mappedModel = MODEL_MAPPINGS[modelId];
        const parts = mappedModel.split('/');
        // Recursively call with mapped model
        return this.getModelConfig(mappedModel);
      }

      let providerName, providerDisplayName, providerBaseUrl, finalModelId, displayName, description;

      // If modelId specifies a provider, try to use it
      if (requestedProvider === 'openai' && hasOpenAIKey) {
        providerName = 'openai';
        providerDisplayName = 'OpenAI';
        providerBaseUrl = 'https://api.openai.com/v1';
        finalModelId = requestedModel;
        displayName = requestedModel;
        description = `OpenAI model: ${requestedModel}`;
      } else if (requestedProvider === 'anthropic' && hasAnthropicKey) {
        providerName = 'anthropic';
        providerDisplayName = 'Anthropic';
        providerBaseUrl = 'https://api.anthropic.com';
        finalModelId = requestedModel;
        displayName = requestedModel;
        description = `Anthropic model: ${requestedModel}`;
      } else if (requestedProvider === 'deepseek' && hasDeepSeekKey) {
        providerName = 'deepseek';
        providerDisplayName = 'DeepSeek';
        providerBaseUrl = 'https://api.deepseek.com';
        finalModelId = requestedModel;
        displayName = requestedModel;
        description = `DeepSeek model: ${requestedModel}`;
      } else if (requestedProvider === 'polza' && hasPolzaKey) {
        // Polza is a gateway, keep full modelId
        providerName = 'polza';
        providerDisplayName = 'Polza.ai';
        providerBaseUrl = process.env.POLZA_BASE_URL || 'https://api.polza.ai/api/v1';
        finalModelId = modelId; // Keep full format for Polza
        displayName = requestedModel;
        description = `Polza.ai model: ${modelId}`;
      } else if (requestedProvider === 'kodacode' && hasKodacodeKey) {
        // Kodacode provider - OpenAI-compatible gateway
        providerName = 'kodacode';
        providerDisplayName = 'Kodacode';
        providerBaseUrl = process.env.KODACODE_BASE_URL || 'https://api.kodacode.ru/v1';
        finalModelId = requestedModel;
        displayName = requestedModel;
        description = `Kodacode model: ${requestedModel}`;
      } else if (hasPolzaKey) {
        // Fallback to Polza if available
        providerName = 'polza';
        providerDisplayName = 'Polza.ai';
        providerBaseUrl = process.env.POLZA_BASE_URL || 'https://api.polza.ai/api/v1';
        finalModelId = modelId; // Use requested model
        displayName = modelId;
        description = `Default AI model via Polza.ai: ${modelId}`;
      } else if (hasDeepSeekKey) {
        providerName = 'deepseek';
        providerDisplayName = 'DeepSeek';
        providerBaseUrl = 'https://api.deepseek.com';
        finalModelId = 'deepseek-chat';
        displayName = 'DeepSeek Chat';
        description = 'Fallback AI model via DeepSeek (requested model not available)';
      } else if (hasAnthropicKey) {
        providerName = 'anthropic';
        providerDisplayName = 'Anthropic';
        providerBaseUrl = 'https://api.anthropic.com';
        finalModelId = 'claude-sonnet-4-20250514';
        displayName = 'Claude Sonnet 4';
        description = 'Fallback AI model via Anthropic (requested model not available)';
      } else if (hasOpenAIKey) {
        providerName = 'openai';
        providerDisplayName = 'OpenAI';
        providerBaseUrl = 'https://api.openai.com/v1';
        finalModelId = 'gpt-4';
        displayName = 'GPT-4';
        description = 'Fallback AI model via OpenAI (requested model not available)';
      } else {
        throw new Error(
          'No AI provider API keys configured. Please set at least one of: ' +
          'POLZA_AI_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY'
        );
      }

      modelId = finalModelId; // Update modelId for return value

      return {
        id: modelId,
        model_id: modelId,
        display_name: displayName,
        description,
        context_window: '200K',
        max_output_tokens: '8192',
        cost_per_1k_input: '3.00',
        cost_per_1k_output: '15.00',
        provider_name: providerName,
        provider_display_name: providerDisplayName,
        provider_base_url: providerBaseUrl
      }
    }

    // Check cache
    const cached = this.modelCache.get(modelId)
    if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
      return cached.data
    }

    const result = await this.db.query(`
      SELECT * FROM v_active_ai_models
      WHERE id = $1
    `, [modelId])

    if (result.rows.length === 0) {
      throw new Error(`Model not found: ${modelId}`)
    }

    const modelConfig = result.rows[0]

    // Cache result
    this.modelCache.set(modelId, {
      data: modelConfig,
      timestamp: Date.now()
    })

    return modelConfig
  }

  /**
   * Get or create a client for a specific provider
   * @param {Object} modelConfig - Model configuration
   * @param {string} apiKey - API key for the provider
   * @returns {Object} Provider client
   */
  /**
   * Get provider adapter instance
   * Returns a unified provider adapter that handles API-specific details
   * @param {Object} modelConfig - Model configuration from database
   * @param {string} apiKey - API key for the provider
   * @returns {BaseProvider} Provider adapter instance
   */
  _getProviderClient(modelConfig, apiKey) {
    const cacheKey = `${modelConfig.provider_name}:${apiKey.substring(0, 10)}`

    if (this.providerClients.has(cacheKey)) {
      return this.providerClients.get(cacheKey)
    }

    let provider

    const providerConfig = {
      name: modelConfig.provider_name,
      apiKey,
      baseURL: modelConfig.provider_base_url
    }

    switch (modelConfig.provider_name.toLowerCase()) {
      case 'anthropic':
        provider = new AnthropicProvider(providerConfig)
        break

      case 'openai':
        provider = new OpenAIProvider(providerConfig)
        break

      case 'deepseek':
        provider = new DeepSeekProvider(providerConfig)
        break

      case 'polza':
        provider = new PolzaProvider(providerConfig)
        break

      case 'kodacode':
        provider = new KodacodeProvider(providerConfig)
        break

      case 'google':
        // For Google, you'd integrate Google AI SDK here
        throw new Error('Google AI provider not yet implemented')

      default:
        throw new Error(`Unsupported provider: ${modelConfig.provider_name}`)
    }

    this.providerClients.set(cacheKey, provider)
    return provider
  }

  /**
   * Chat completion with token-based authentication
   * @param {string} accessToken - User's access token
   * @param {string} modelId - UUID of the model to use
   * @param {string} prompt - The prompt or messages
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Chat completion result
   */
  async chatWithToken(accessToken, modelId, prompt, options = {}) {
    const {
      application = 'Unknown',
      operation = 'chat',
      temperature = 0.2,
      maxTokens = 4096,
      topP = 0.9,
      apiKey = null, // User can provide their own API key
      stream = false, // Streaming support (Issue #4892)
      onStreamChunk = null, // Callback for streaming chunks (Issue #4892)
      tools = null, // Tools for function calling
      systemPrompt = null, // System prompt for AI
      ...additionalParams
    } = options

    // Validate token (skip if database is not configured)
    let tokenValidation = null
    if (this.db) {
      tokenValidation = await this.validateToken(accessToken)

      // Check if application is allowed
      if (!tokenValidation.allowedApplications.includes('*') &&
          !tokenValidation.allowedApplications.includes(application)) {
        throw new Error(`Application '${application}' is not allowed for this token`)
      }

      // Check if model is allowed
      if (!tokenValidation.allowedModels.includes('*') &&
          !tokenValidation.allowedModels.includes(modelId)) {
        throw new Error(`Model is not allowed for this token`)
      }
    } else {
      // When database is not configured, create a virtual token validation
      // This allows the system to work without database dependency
      tokenValidation = {
        tokenId: accessToken, // Use accessToken as tokenId
        userId: 'system',
        name: 'Virtual Token',
        scopes: ['*'],
        allowedModels: ['*'],
        allowedApplications: ['*'],
        rateLimitRpm: 60,
        rateLimitTpm: 100000,
        tokenBalance: 999999999,
        dailyUsage: 0,
        monthlyUsage: 0,
        dailyLimit: 100000,
        monthlyLimit: 1000000
      }
    }

    // Get model configuration
    const modelConfig = await this.getModelConfig(modelId)

    // Determine API key (user-provided or from environment)
    const effectiveApiKey = apiKey || this._getProviderApiKey(modelConfig.provider_name)
    if (!effectiveApiKey) {
      const providerName = modelConfig.provider_name.toLowerCase()
      const envVarName = providerName === 'anthropic' ? 'ANTHROPIC_API_KEY' :
                        providerName === 'openai' ? 'OPENAI_API_KEY' :
                        providerName === 'deepseek' ? 'DEEPSEEK_API_KEY' :
                        providerName === 'polza' ? 'POLZA_AI_API_KEY' :
                        `${providerName.toUpperCase()}_API_KEY`

      throw new Error(
        `No API key configured for provider: ${modelConfig.provider_name}. ` +
        `Please set ${envVarName} in backend .env file or provide your own API key. ` +
        `See backend/monolith/.env.example for configuration examples.`
      )
    }

    // Get provider adapter
    const provider = this._getProviderClient(modelConfig, effectiveApiKey)

    // Prepare messages
    const messages = Array.isArray(prompt)
      ? prompt
      : [{ role: 'user', content: prompt }]

    // Add system prompt as first message if user provided it
    // Note: Provider will add its own default prompt if needed (e.g., KodacodeProvider)
    const messagesWithSystem = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages

    // Execute API call via provider adapter
    let result
    const requestId = crypto.randomUUID()
    const startTime = Date.now()

    try {
      // Issue #4898: Add detailed logging for debugging streaming errors
      const logger = await import('../utils/logger.js').then(m => m.default || m);

      logger.info({
        requestId,
        provider: modelConfig.provider_name,
        model: modelConfig.model_id,
        stream,
        hasTools: !!tools,
        messageCount: messages.length
      }, '[TokenBasedLLMCoordinator] Starting chat request via provider adapter');

      // Build unified request for provider adapter
      // Pass base MCP prompt - provider will format it according to its needs
      const baseMcpPrompt = this._getBaseMcpPrompt(tools);

      const unifiedRequest = {
        messages: messagesWithSystem,
        model: modelConfig.model_id,
        options: {
          temperature,
          maxTokens,
          topP,
          stream,
          tools,
          baseMcpPrompt, // Provider formats this according to its requirements
          onStreamChunk: stream ? (chunk) => {
            // Unified streaming callback - provider sends {type, content} or {type, usage}
            onStreamChunk(chunk)
          } : undefined
        }
      }

      logger.info({
        requestId,
        provider: modelConfig.provider_name,
        requestFormat: 'unified'
      }, '[TokenBasedLLMCoordinator] Calling provider.chat() with unified format');

      // Call provider adapter - it handles all provider-specific logic
      const response = await provider.chat(unifiedRequest)

      logger.info({
        requestId,
        provider: modelConfig.provider_name,
        contentLength: response.content?.length || 0,
        toolCallCount: response.toolCalls?.length || 0
      }, '[TokenBasedLLMCoordinator] Provider adapter returned response');

      // Transform provider response to coordinator format
      result = {
        content: response.content,
        toolCalls: response.toolCalls && response.toolCalls.length > 0
          ? response.toolCalls.map(tc => ({
              id: tc.id,
              type: 'function',
              name: tc.name,
              input: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments
            }))
          : undefined,
        usage: {
          prompt_tokens: response.usage?.promptTokens || 0,
          completion_tokens: response.usage?.completionTokens || 0,
          total_tokens: response.usage?.totalTokens || 0
        },
        model: response.model || modelConfig.model_id,
        requestId
      }

      logger.info({
        requestId,
        provider: modelConfig.provider_name,
        usage: result.usage
      }, '[TokenBasedLLMCoordinator] Request completed successfully');

      // Record successful usage and get calculated cost
      const usageRecord = await this._recordUsage({
        tokenId: tokenValidation.tokenId,
        modelId,
        application,
        operation,
        promptTokens: result.usage.prompt_tokens,
        completionTokens: result.usage.completion_tokens,
        requestId,
        status: 'completed',
        metadata: {
          temperature,
          maxTokens,
          duration: Date.now() - startTime
        }
      })

      // Add cost information to result (Issue #: Token cost not saved to Integram)
      if (usageRecord && usageRecord.cost) {
        result.usage.cost = usageRecord.cost
        result.usage.cost_input = usageRecord.cost_input
        result.usage.cost_output = usageRecord.cost_output
      }

      return result
    } catch (error) {
      // Record failed usage
      await this._recordUsage({
        tokenId: tokenValidation.tokenId,
        modelId,
        application,
        operation,
        promptTokens: 0,
        completionTokens: 0,
        requestId,
        status: 'failed',
        errorMessage: error.message,
        metadata: {
          temperature,
          maxTokens,
          duration: Date.now() - startTime,
          error: error.toString()
        }
      })

      throw error
    }
  }

  /**
   * Get API key for a provider from environment
   * @private
   */
  _getProviderApiKey(providerName) {
    const envMapping = {
      'openai': 'OPENAI_API_KEY',
      'anthropic': 'ANTHROPIC_API_KEY',
      'deepseek': 'DEEPSEEK_API_KEY',
      'google': 'GOOGLE_AI_API_KEY',
      'polza': 'POLZA_AI_API_KEY',
      'kodacode': 'GITHUB_TOKEN'
    }

    const envKey = envMapping[providerName.toLowerCase()]
    return envKey ? process.env[envKey] : null
  }

  /**
   * Record usage in database
   * Issue #4566: Handle null database gracefully
   * @private
   */
  async _recordUsage(usageData) {
    // Skip recording if database is not configured
    if (!this.db) {
      // Log usage to console for development/debugging
      console.log('[AI Usage - No DB]', {
        application: usageData.application,
        operation: usageData.operation,
        promptTokens: usageData.promptTokens,
        completionTokens: usageData.completionTokens,
        status: usageData.status
      })
      // Calculate cost with default pricing when no database
      // Default: DeepSeek pricing ($0.14 input, $0.28 output per 1K tokens)
      const costInput = (usageData.promptTokens / 1000) * 0.14
      const costOutput = (usageData.completionTokens / 1000) * 0.28
      const totalCost = costInput + costOutput
      return {
        cost: totalCost,
        cost_input: costInput,
        cost_output: costOutput
      }
    }

    const {
      tokenId,
      modelId,
      application,
      operation,
      promptTokens,
      completionTokens,
      requestId,
      status = 'completed',
      errorMessage = null,
      metadata = {}
    } = usageData

    const totalTokens = promptTokens + completionTokens

    // Get model pricing
    const modelResult = await this.db.query(`
      SELECT cost_per_1k_input, cost_per_1k_output
      FROM ai_models
      WHERE id = $1
    `, [modelId])

    if (modelResult.rows.length === 0) {
      console.error(`Model not found for usage recording: ${modelId}`)
      return
    }

    const model = modelResult.rows[0]
    const costInput = (promptTokens / 1000) * parseFloat(model.cost_per_1k_input || 0)
    const costOutput = (completionTokens / 1000) * parseFloat(model.cost_per_1k_output || 0)
    const totalCost = costInput + costOutput

    try {
      // Record usage
      await this.db.query(`
        INSERT INTO ai_token_usage (
          access_token_id,
          model_id,
          application,
          operation,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          cost_input,
          cost_output,
          total_cost,
          request_id,
          status,
          error_message,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        tokenId,
        modelId,
        application,
        operation,
        promptTokens,
        completionTokens,
        totalTokens,
        costInput,
        costOutput,
        totalCost,
        requestId,
        status,
        errorMessage,
        JSON.stringify(metadata)
      ])

      // Deduct tokens from balance if successful
      if (status === 'completed' && totalTokens > 0) {
        await this.db.query(`
          UPDATE ai_access_tokens
          SET token_balance = GREATEST(token_balance - $1, 0)
          WHERE id = $2
        `, [totalTokens, tokenId])

        // Invalidate token cache
        this.tokenCache.clear()
      }

      // Issue #4873: Log consumption to Integram (asynchronously, don't block)
      if (status === 'completed' && (promptTokens > 0 || completionTokens > 0)) {
        // Get userId from tokenId
        const tokenResult = await this.db.query(`
          SELECT user_id FROM ai_access_tokens WHERE id = $1
        `, [tokenId])

        if (tokenResult.rows.length > 0) {
          const userId = tokenResult.rows[0].user_id

          // Get model name for Integram logging
          const modelNameResult = await this.db.query(`
            SELECT model_name FROM ai_models WHERE id = $1
          `, [modelId])

          const modelName = modelNameResult.rows.length > 0
            ? modelNameResult.rows[0].model_name
            : 'unknown'

          // Log to Integram asynchronously (don't block main flow)
          // Issue #: Pass calculated cost to Integram
          tokenConsumptionLogger.logConsumption({
            userId: userId,
            model: modelName,
            promptTokens: promptTokens,
            completionTokens: completionTokens,
            totalTokens: totalTokens,
            costRub: totalCost,
            application: application,
            operation: operation
          }).catch(err => {
            console.error('[TokenBasedLLMCoordinator] Failed to log to Integram:', err.message)
          })
        }
      }

      // Return calculated cost for API response
      return {
        cost: totalCost,
        cost_input: costInput,
        cost_output: costOutput
      }
    } catch (error) {
      console.error('Error recording usage:', error)
      // Don't throw - we don't want to fail the request if usage recording fails
      return null
    }
  }

  /**
   * Get token cache key
   * @private
   */
  _getTokenCacheKey(token) {
    return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16)
  }

  /**
   * List available models for a token
   * Issue #4566: Handle null database gracefully
   * @param {string} accessToken - User's access token
   * @returns {Promise<Array>} List of available models
   */
  async listAvailableModels(accessToken) {
    // If database is not configured, return default model
    if (!this.db) {
      return [{
        id: 'system_default',
        model_id: process.env.DEFAULT_AI_MODEL || 'deepseek-chat',
        display_name: 'DeepSeek Chat',
        description: 'Default AI model',
        context_window: '128K',
        max_output_tokens: '4096',
        cost_per_1k_input: '0.14',
        cost_per_1k_output: '0.28',
        provider_name: 'deepseek',
        provider_display_name: 'DeepSeek',
        provider_base_url: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
      }]
    }

    const tokenValidation = await this.validateToken(accessToken)

    let query = `SELECT * FROM v_active_ai_models`
    const params = []

    // Filter by allowed models if not wildcard
    if (!tokenValidation.allowedModels.includes('*')) {
      query += ` WHERE id = ANY($1)`
      params.push(tokenValidation.allowedModels)
    }

    query += ` ORDER BY provider_name, display_name`

    const result = await this.db.query(query, params)
    return result.rows
  }

  /**
   * Get token usage statistics
   * Issue #4566: Handle null database gracefully
   * @param {string} accessToken - User's access token
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Usage statistics
   */
  async getUsageStats(accessToken, options = {}) {
    // If database is not configured, return empty usage stats
    if (!this.db) {
      return []
    }

    const tokenValidation = await this.validateToken(accessToken)
    const { startDate, endDate, groupBy = 'day' } = options

    let dateFilter = ''
    const params = [tokenValidation.tokenId]

    if (startDate && endDate) {
      dateFilter = ` AND created_at BETWEEN $2 AND $3`
      params.push(startDate, endDate)
    }

    const result = await this.db.query(`
      SELECT
        COUNT(*) as request_count,
        SUM(total_tokens) as total_tokens,
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        SUM(total_cost) as total_cost,
        application,
        DATE_TRUNC($${params.length + 1}, created_at) as period
      FROM ai_token_usage
      WHERE access_token_id = $1 ${dateFilter}
      GROUP BY application, DATE_TRUNC($${params.length + 1}, created_at)
      ORDER BY period DESC
    `, [...params, groupBy])

    return result.rows
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    await super.cleanup()
    this.tokenCache.clear()
    this.modelCache.clear()
    this.providerClients.clear()
  }
}

// Singleton instance
let coordinatorInstance = null;

/**
 * Get singleton instance of TokenBasedLLMCoordinator
 * @param {Object} config - Configuration options
 * @returns {TokenBasedLLMCoordinator} Singleton instance
 */
export function getTokenBasedLLMCoordinator(config = {}) {
  if (!coordinatorInstance) {
    coordinatorInstance = new TokenBasedLLMCoordinator(config);
  }
  return coordinatorInstance;
}

export default TokenBasedLLMCoordinator
