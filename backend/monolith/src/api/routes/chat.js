// chat.js - Unified Chat API endpoint
// SINGLE ENTRY POINT for all AI chat requests
// Architecture: Frontend → /api/chat → TokenBasedLLMCoordinator → Provider → Model

import express from 'express';
import logger from '../../utils/logger.js';
import { TokenBasedLLMCoordinator } from '../../core/TokenBasedLLMCoordinator.js';
import axios from 'axios';

const router = express.Router();

// Initialize coordinator (without db for now - db module doesn't exist)
// TODO: Fix database module path when proper db integration is available
const llmCoordinator = new TokenBasedLLMCoordinator({});

// MCP server configuration
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://dev.example.integram.io';
const MCP_API_PATH = '/api/mcp/integram';

/**
 * Get Integram MCP tools from HTTP MCP server
 * @returns {Array} Array of MCP tools in OpenAI format
 */
function getIntegramTools() {
  // Same 13 tools as in polza.js
  return [
    {
      type: 'function',
      function: {
        name: 'integram_authenticate',
        description: 'Authenticate with Integram API using login and password. MUST be called first before using any other Integram tools.',
        parameters: {
          type: 'object',
          properties: {
            serverURL: { type: 'string', description: 'Server URL (e.g., https://example.integram.io)' },
            database: { type: 'string', description: 'Database name (e.g., a2025, my, ddadmin)' },
            login: { type: 'string', description: 'Login username' },
            password: { type: 'string', description: 'Login password' }
          },
          required: ['serverURL', 'database', 'login', 'password']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'integram_get_dictionary',
        description: 'Get list of all types (tables) in Integram database. NO parameters needed.',
        parameters: { type: 'object', properties: {}, required: [] }
      }
    },
    {
      type: 'function',
      function: {
        name: 'integram_get_type_metadata',
        description: 'Get detailed metadata for a specific type (table structure, requisites/columns).',
        parameters: {
          type: 'object',
          properties: {
            typeId: { type: 'number', description: 'Type ID to get metadata for' }
          },
          required: ['typeId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'integram_get_object_list',
        description: 'Get list of objects (records) for a specific type (table).',
        parameters: {
          type: 'object',
          properties: {
            typeId: { type: 'number', description: 'Type ID to get objects from' },
            params: {
              type: 'object',
              description: 'Query parameters (offset, limit, filter)',
              properties: {
                offset: { type: 'number', description: 'Offset for pagination (default: 0)' },
                limit: { type: 'number', description: 'Limit number of results (default: 50)' }
              }
            }
          },
          required: ['typeId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'integram_get_object_edit_data',
        description: 'Get full data for editing a specific object (record) including all requisites.',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'number', description: 'Object ID to get edit data for' }
          },
          required: ['objectId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'integram_create_object',
        description: 'Create a new object (record) in a type (table).',
        parameters: {
          type: 'object',
          properties: {
            typeId: { type: 'number', description: 'Type ID to create object in' },
            value: { type: 'string', description: 'Object name/value' },
            requisites: {
              type: 'object',
              description: 'Object requisites as key-value pairs (requisiteId: value)',
              additionalProperties: { type: 'string' }
            }
          },
          required: ['typeId', 'value']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'integram_save_object',
        description: 'Update an existing object (record).',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'number', description: 'Object ID to update' },
            typeId: { type: 'number', description: 'Type ID of the object' },
            value: { type: 'string', description: 'New object name/value' },
            requisites: {
              type: 'object',
              description: 'Updated requisites',
              additionalProperties: { type: 'string' }
            }
          },
          required: ['objectId', 'typeId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'integram_set_object_requisites',
        description: 'Set requisites for an object.',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'number', description: 'Object ID' },
            requisites: {
              type: 'object',
              description: 'Requisites to set',
              additionalProperties: { type: 'string' }
            }
          },
          required: ['objectId', 'requisites']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'integram_delete_object',
        description: 'Delete an object (record).',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'number', description: 'Object ID to delete' }
          },
          required: ['objectId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'integram_create_type',
        description: 'Create a new type (table).',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Type name' },
            baseTypeId: { type: 'number', description: 'Base type ID (1 for independent)' },
            unique: { type: 'boolean', description: 'Whether type is unique' }
          },
          required: ['name', 'baseTypeId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'integram_add_requisite',
        description: 'Add a requisite (column) to a type.',
        parameters: {
          type: 'object',
          properties: {
            typeId: { type: 'number', description: 'Type ID to add requisite to' },
            requisiteTypeId: { type: 'number', description: 'Requisite type ID (3=SHORT, 13=NUMBER, etc.)' }
          },
          required: ['typeId', 'requisiteTypeId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'integram_save_requisite_alias',
        description: 'Set alias (name) for a requisite.',
        parameters: {
          type: 'object',
          properties: {
            requisiteId: { type: 'number', description: 'Requisite ID' },
            alias: { type: 'string', description: 'Requisite alias (name)' }
          },
          required: ['requisiteId', 'alias']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'integram_get_type_editor_data',
        description: 'Get type editor data including available base types and requisite types.',
        parameters: { type: 'object', properties: {}, required: [] }
      }
    }
  ];
}

/**
 * Execute MCP tool via HTTP MCP endpoint
 */
async function executeMCPTool(toolName, toolInput, sessionId) {
  try {
    logger.info({ toolName, toolInput, sessionId }, '[Chat MCP] Executing tool');

    const headers = {};
    if (sessionId) {
      headers['X-Session-ID'] = sessionId;
    }

    const response = await axios.post(`${MCP_SERVER_URL}${MCP_API_PATH}/execute`, {
      toolName,
      arguments: toolInput
    }, {
      timeout: 30000,
      headers
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Tool execution failed');
    }

    logger.info({ toolName, success: true }, '[Chat MCP] Tool executed successfully');

    // Return both result and session ID from response
    return {
      result: response.data.result,
      sessionId: response.headers['x-session-id'] || sessionId
    };
  } catch (error) {
    logger.error({ toolName, error: error.message }, '[Chat MCP] Tool execution failed');
    throw error;
  }
}

/**
 * POST /api/chat
 * Unified chat endpoint - routes to appropriate provider via coordinator
 */
router.post('/', async (req, res) => {
  try {
    const {
      message,
      model: rawModel = 'openai/gpt-4o', // Default model
      provider, // Provider from frontend (e.g., 'kodacode', 'polza', 'deepseek')
      conversationHistory = [],
      userId = 'default-user',
      enableTools = false,
      systemPrompt,
      temperature = 0.7,
      maxTokens = 4096,
      stream = false
    } = req.body;

    // Combine provider and model into format expected by coordinator
    // If provider is specified and model doesn't already have a provider prefix, add it
    let model = rawModel;
    if (provider && !rawModel.includes('/')) {
      model = `${provider}/${rawModel}`;
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    console.log('='.repeat(80));
    console.log('[CHAT DEBUG] Incoming request:');
    console.log('Provider:', provider);
    console.log('Raw Model:', rawModel);
    console.log('Combined Model:', model);
    console.log('User ID:', userId);
    console.log('Enable Tools:', enableTools);
    console.log('Stream:', stream);
    console.log('Message:', message.substring(0, 100));
    console.log('ConversationHistory length:', conversationHistory?.length || 0);
    console.log('ConversationHistory:', JSON.stringify(conversationHistory, null, 2));
    console.log('='.repeat(80));

    logger.info({
      model,
      userId,
      enableTools,
      stream,
      messageLength: message.length
    }, '[Chat] Incoming chat request');

    // Get MCP tools if enabled
    // IMPORTANT: Disable tools in streaming mode because streaming doesn't support tool execution loop
    // Models that don't support native function calling (output tool calls as text instead)
    const MODELS_WITHOUT_TOOL_SUPPORT = ['minimax', 'qwen', 'yi-large', 'yi-medium'];
    const modelSupportsTools = !MODELS_WITHOUT_TOOL_SUPPORT.some(m => model.toLowerCase().includes(m.toLowerCase()));

    // Koda models DO support tools - enable Integram MCP tools for them
    const mcpTools = (enableTools && !stream && modelSupportsTools) ? getIntegramTools() : null;

    if (enableTools && stream) {
      logger.warn('[Chat] Tools disabled in streaming mode - use non-streaming for tool calls');
    }
    if (enableTools && !modelSupportsTools) {
      logger.warn(`[Chat] Tools disabled: Model ${model} does not support native function calling`);
    }
    if (mcpTools && mcpTools.length > 0) {
      logger.info(`[Chat] Integram MCP tools enabled (${mcpTools.length} tools available) for model: ${model}`);
    }

    // Build messages array - filter out invalid messages
    // Note: System prompt is now handled by TokenBasedLLMCoordinator
    // which selects provider-specific prompts when tools are enabled
    const messages = [
      ...conversationHistory
        .filter(msg => msg && msg.role && msg.content) // Remove empty/invalid messages
        .map(msg => ({
          role: msg.role,
          content: msg.content
        })),
      {
        role: 'user',
        content: message
      }
    ];

    // Handle streaming
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        await llmCoordinator.chatWithToken(
          `user_${userId}`, // Simple token format
          model,
          messages,
          {
            temperature,
            maxTokens,
            systemPrompt, // Pass user's systemPrompt or undefined (coordinator will choose)
            tools: mcpTools,
            stream: true,
            onStreamChunk: (chunk) => {
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
          }
        );

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        logger.error({ error: error.message }, '[Chat] Streaming error');
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
      return;
    }

    // Non-streaming response with tool execution loop
    const MAX_TOOL_ITERATIONS = 10;
    let toolIterations = 0;
    let allToolCalls = [];
    let currentMessages = [...messages];
    let finalResponse;
    let mcpSessionId = null; // Store MCP session ID across tool calls

    while (toolIterations < MAX_TOOL_ITERATIONS) {
      toolIterations++;

      // Call AI through coordinator
      const coordinatorResponse = await llmCoordinator.chatWithToken(
        `user_${userId}`,
        model,
        currentMessages,
        {
          temperature,
          maxTokens,
          systemPrompt, // Pass user's systemPrompt or undefined (coordinator will choose)
          tools: mcpTools,
          stream: false
        }
      );

      finalResponse = coordinatorResponse;

      // Check if AI wants to use tools
      const toolCalls = coordinatorResponse.toolCalls;

      if (!toolCalls || toolCalls.length === 0) {
        // No tools requested - return response
        logger.info({ toolIterations }, '[Chat] No more tools requested, finishing');
        break;
      }

      logger.info({ toolCalls: toolCalls.length, iteration: toolIterations }, '[Chat] Processing tool calls');

      // Execute tools
      const toolResults = [];
      for (const toolCall of toolCalls) {
        try {
          // Handle multiple formats:
          // - OpenAI format: {function: {name, arguments}}
          // - Flat format: {name, arguments}
          // - Coordinator format: {name, input} (input is already parsed object)
          const toolName = toolCall.function?.name || toolCall.name;
          let toolArgs = toolCall.function?.arguments || toolCall.input || toolCall.arguments || {};

          // Parse arguments if it's a JSON string
          if (typeof toolArgs === 'string') {
            try {
              toolArgs = JSON.parse(toolArgs);
            } catch (e) {
              // Keep as string if not valid JSON
            }
          }

          const { result, sessionId: newSessionId } = await executeMCPTool(toolName, toolArgs, mcpSessionId);
          mcpSessionId = newSessionId; // Preserve session for next tool call
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: toolName,
            content: JSON.stringify(result)
          });
          allToolCalls.push({ ...toolCall, result });
        } catch (error) {
          const toolName = toolCall.function?.name || toolCall.name;
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: toolName,
            content: JSON.stringify({ error: error.message })
          });
          allToolCalls.push({ ...toolCall, error: error.message });
        }
      }

      // Add assistant message with tool calls + tool results to conversation
      // IMPORTANT: Convert tool_calls to OpenAI format for Polza API compatibility
      // Coordinator returns Anthropic-style format: {id, type, name, input}
      // Polza/OpenAI expects: {id, type, function: {name, arguments: JSON string}}
      const openAIFormatToolCalls = toolCalls.map(tc => {
        // Handle both coordinator format and OpenAI format
        const toolName = tc.function?.name || tc.name;
        const toolArgs = tc.function?.arguments || tc.input || tc.arguments || {};
        const argsString = typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs);

        return {
          id: tc.id,
          type: 'function',
          function: {
            name: toolName,
            arguments: argsString
          }
        };
      });

      currentMessages.push({
        role: 'assistant',
        content: coordinatorResponse.content || '',
        tool_calls: openAIFormatToolCalls
      });

      // Add tool results
      currentMessages.push(...toolResults);
    }

    if (toolIterations >= MAX_TOOL_ITERATIONS) {
      logger.warn('[Chat] Maximum tool execution iterations reached');
      return res.status(200).json({
        success: false,
        error: 'Maximum tool execution iterations reached',
        response: finalResponse?.content || 'Too many tool calls',
        toolCallsExecuted: allToolCalls.length
      });
    }

    // Return final response
    res.json({
      success: true,
      response: finalResponse.content,
      model: finalResponse.model,
      usage: finalResponse.usage,
      toolCallsExecuted: allToolCalls.length,
      data: finalResponse
    });

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, '[Chat] Error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
