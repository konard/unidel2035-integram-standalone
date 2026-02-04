/**
 * AI Cell API Routes
 *
 * Endpoints for executing AI agents in Integram cells (Field Agents)
 * Similar to Airtable's AI Field Agents functionality
 */

import express from 'express'
import aiProviderService from '../../services/ai/aiProviderService.js'
import logger from '../../utils/logger.js'

const router = express.Router()

/**
 * POST /api/ai-cell/execute
 * Execute AI agent with instructions and row data
 *
 * Request body:
 * {
 *   instructions: string,      // AI instructions/prompt with optional {field_name} placeholders
 *   rowData: object,           // Row data for field reference substitution
 *   model: string,             // AI model to use (optional, defaults to gpt-3.5-turbo)
 *   provider: string,          // AI provider (optional, defaults to polza)
 *   webSearch: boolean,        // Enable web search (optional, defaults to false)
 *   userId: string,            // User ID for tracking (optional)
 *   tokenId: string            // Token ID for billing (optional)
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     content: string,         // Generated content
 *     usage: {                 // Token usage stats
 *       promptTokens: number,
 *       completionTokens: number,
 *       totalTokens: number
 *     },
 *     provider: string,
 *     model: string
 *   }
 * }
 */
router.post('/execute', async (req, res) => {
  try {
    const {
      instructions,
      rowData = {},
      model = 'openai/gpt-3.5-turbo',
      provider = 'polza',
      webSearch = false,
      userId,
      tokenId
    } = req.body

    // Validate required fields
    if (!instructions) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: instructions'
      })
    }

    logger.info('[AI Cell] Executing AI agent', {
      provider,
      model,
      instructionsLength: instructions.length,
      hasRowData: Object.keys(rowData).length > 0,
      webSearch,
      userId,
      tokenId
    })

    // Replace {field_name} placeholders with actual values from rowData
    const processedInstructions = replaceFieldReferences(instructions, rowData)

    logger.debug('[AI Cell] Processed instructions', {
      original: instructions.substring(0, 100),
      processed: processedInstructions.substring(0, 100)
    })

    // Prepare messages for AI
    const messages = [
      {
        role: 'user',
        content: processedInstructions
      }
    ]

    // Add web search note if enabled
    if (webSearch) {
      messages.unshift({
        role: 'system',
        content: 'You have access to web search. Use it when you need current information or facts.'
      })
    }

    // Execute AI operation
    const result = await aiProviderService.performAIOperation({
      provider,
      model,
      messages,
      options: {
        temperature: 0.7,
        max_tokens: 2000
      },
      tokenId,
      userId,
      operation: 'ai-cell'
    })

    if (!result.success) {
      throw new Error(result.error || 'AI operation failed')
    }

    // Extract content from AI response
    const content = result.data.choices?.[0]?.message?.content ||
                   result.data.text ||
                   ''

    logger.info('[AI Cell] AI agent execution completed', {
      provider,
      model,
      contentLength: content.length,
      totalTokens: result.usage?.total_tokens || 0
    })

    res.json({
      success: true,
      data: {
        content,
        usage: {
          promptTokens: result.usage?.prompt_tokens || 0,
          completionTokens: result.usage?.completion_tokens || 0,
          totalTokens: result.usage?.total_tokens || 0
        },
        provider: result.provider,
        model: result.model
      }
    })

  } catch (error) {
    logger.error('[AI Cell] Execution failed', {
      error: error.message,
      stack: error.stack
    })

    res.status(500).json({
      success: false,
      error: error.message || 'AI cell execution failed'
    })
  }
})

/**
 * GET /api/ai-cell/models
 * Get available AI models for AI cells
 *
 * Response:
 * {
 *   success: true,
 *   data: [
 *     {
 *       id: string,
 *       name: string,
 *       provider: string,
 *       providerName: string,
 *       description: string
 *     }
 *   ]
 * }
 */
router.get('/models', async (req, res) => {
  try {
    const models = aiProviderService.getAllModels()

    logger.info('[AI Cell] Retrieved available models', {
      count: models.length
    })

    res.json({
      success: true,
      data: models
    })

  } catch (error) {
    logger.error('[AI Cell] Failed to get models', {
      error: error.message
    })

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve models'
    })
  }
})

/**
 * GET /api/ai-cell/providers
 * Get available AI providers
 *
 * Response:
 * {
 *   success: true,
 *   data: [
 *     {
 *       key: string,
 *       name: string,
 *       displayName: string
 *     }
 *   ]
 * }
 */
router.get('/providers', async (req, res) => {
  try {
    const providers = aiProviderService.getAvailableProviders()

    logger.info('[AI Cell] Retrieved available providers', {
      count: providers.length
    })

    res.json({
      success: true,
      data: providers
    })

  } catch (error) {
    logger.error('[AI Cell] Failed to get providers', {
      error: error.message
    })

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve providers'
    })
  }
})

/**
 * Helper function to replace {field_name} placeholders with actual values
 * @param {string} text - Text with placeholders
 * @param {object} rowData - Row data with field values
 * @returns {string} - Text with placeholders replaced
 */
function replaceFieldReferences(text, rowData) {
  if (!text || !rowData) return text

  return text.replace(/\{([^}]+)\}/g, (match, fieldName) => {
    const trimmedFieldName = fieldName.trim()
    const fieldValue = rowData[trimmedFieldName]

    if (fieldValue !== undefined && fieldValue !== null) {
      return String(fieldValue)
    }

    // If field not found, keep the placeholder
    return match
  })
}

export default router
