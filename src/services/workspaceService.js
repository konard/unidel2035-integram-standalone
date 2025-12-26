/**
 * Workspace Service - Frontend
 * Issue #4276: Fix workspace chat endpoints
 *
 * This service provides frontend access to workspace file management and chat.
 *
 * Endpoints:
 * - Workspace management: /api/workspace-chat/workspaces (CRUD operations)
 * - File operations: /api/workspace-chat/workspaces/{id}/files (read, write, delete)
 * - Chat: /api/polza/chat (same as sidebar Chat.vue, per user request)
 * - Session: /api/polza/session (separate session per workspace/file)
 *
 * IMPORTANT: BASE_URL already includes '/api' (e.g., 'https://dev.drondoc.ru/api')
 * Do NOT add '/api' prefix to paths - it will create double '/api/api/' paths!
 */

import { logger } from '@/utils/logger';

// Base URL for backend API - already includes '/api' prefix
// Example: 'https://dev.drondoc.ru/api' or 'http://localhost:8081'
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8081';

// Session storage for file-specific chat sessions
// Key format: `workspace_${workspaceId}_file_${filepath}`
const fileChatSessions = new Map();

/**
 * Create a new workspace
 * @param {string} userId - User identifier
 * @param {object} options - Workspace options
 * @param {string} options.name - Workspace name
 * @param {string} options.repositoryUrl - Git repository URL (optional)
 * @param {string} options.branch - Git branch (optional)
 * @param {object} options.toolConfig - Tool configuration (optional)
 * @param {string} options.githubToken - GitHub personal access token for private repos (optional)
 * @param {string} options.integramServer - Integram server URL (optional, e.g., 'https://dronedoc.ru')
 * @returns {Promise<object>} Workspace object
 */
export async function createWorkspace(userId, options = {}) {
  // Issue #4584: Pass integramServer for {integramServer}_{userId} directory naming
  // If not provided, try to get from integramService
  let integramServer = options.integramServer;
  if (!integramServer) {
    try {
      // Dynamically import integramService to avoid circular dependencies
      const { default: integramService } = await import('./integramService');
      integramServer = integramService.getServer();
      logger.info({ integramServer }, 'Using integram server from integramService');
    } catch (error) {
      logger.warn({ error: error.message }, 'Could not get integram server, workspace will use userId-only directory');
    }
  }

  const response = await fetch(`${BASE_URL}/workspace-chat/workspaces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId,
      ...options,
      integramServer // Add integramServer to request
    })
  });

  if (!response.ok) {
    const error = await response.json();
    const errorMessage = error.error || 'Failed to create workspace';
    const err = new Error(errorMessage);
    err.suggestedUrl = error.suggestedUrl;
    throw err;
  }

  const result = await response.json();
  return result.workspace;
}

/**
 * Get all workspaces for a user
 * @param {string} userId - User identifier
 * @returns {Promise<array>} Array of workspace objects
 */
export async function getUserWorkspaces(userId) {
  const response = await fetch(`${BASE_URL}/workspace-chat/workspaces/${userId}`);

  if (!response.ok) {
    throw new Error('Failed to get workspaces');
  }

  const result = await response.json();
  return result.workspaces;
}

/**
 * Get a single workspace by ID
 * Issue #4764: Add function to get workspace details for direct URL access
 * @param {string} workspaceId - Workspace identifier
 * @returns {Promise<object>} Workspace object
 */
export async function getWorkspace(workspaceId) {
  const response = await fetch(`${BASE_URL}/workspace-chat/workspace/${workspaceId}`);

  if (!response.ok) {
    if (response.status === 404) {
      return null; // Workspace not found
    }
    throw new Error('Failed to get workspace');
  }

  const result = await response.json();
  return result.workspace;
}

/**
 * Delete a workspace
 * @param {string} workspaceId - Workspace identifier
 * @returns {Promise<object>} Delete result
 */
export async function deleteWorkspace(workspaceId) {
  const response = await fetch(`${BASE_URL}/workspace-chat/workspaces/${workspaceId}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    throw new Error('Failed to delete workspace');
  }

  const result = await response.json();
  return result;
}

/**
 * Get file tree for workspace
 * @param {string} workspaceId - Workspace identifier
 * @param {string} path - Relative path (optional)
 * @returns {Promise<object>} File tree object
 */
export async function getWorkspaceFileTree(workspaceId, path = '') {
  let url = `${BASE_URL}/workspace-chat/workspaces/${workspaceId}/files`;
  if (path) {
    url += `?path=${encodeURIComponent(path)}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to get file tree');
  }

  const result = await response.json();
  return result.tree;
}

/**
 * Get or create a chat session for a specific file in workspace
 * Issue #4276: Separate chat history for each file
 * @param {string} workspaceId - Workspace identifier
 * @param {string} filepath - File path (optional, for file-specific sessions)
 * @param {object} options - Session options
 * @returns {Promise<string>} Session ID
 */
async function getOrCreateSession(workspaceId, filepath = null, options = {}) {
  // Create unique session key for this workspace/file combination
  const sessionKey = filepath
    ? `workspace_${workspaceId}_file_${filepath}`
    : `workspace_${workspaceId}`;

  // Check if session exists and is still valid
  let sessionId = fileChatSessions.get(sessionKey);

  // If no session exists, create a new one
  if (!sessionId) {
    logger.info(`Creating new Polza.ai session for ${sessionKey}`);

    const systemPrompt = options.systemPrompt ||
      (filepath
        ? `Вы - AI-ассистент для редактирования кода. Помогаете пользователю работать с файлом ${filepath} в workspace ${workspaceId}. Отвечайте на русском языке.`
        : `Вы - AI-ассистент для работы с workspace ${workspaceId}. Отвечайте на русском языке.`);

    const response = await fetch(`${BASE_URL}/polza/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemPrompt,
        model: options.model || 'anthropic/claude-sonnet-4.5',
        userId: `workspace_user_${workspaceId}`
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to create Polza.ai session:', errorText);
      throw new Error(`Failed to create chat session: ${response.status}`);
    }

    const sessionData = await response.json();
    if (!sessionData.success || !sessionData.sessionId) {
      throw new Error('Invalid session response from server');
    }

    sessionId = sessionData.sessionId;
    fileChatSessions.set(sessionKey, sessionId);
    logger.info(`Created Polza.ai session ${sessionId} for ${sessionKey}`);
  }

  return sessionId;
}

/**
 * Chat with AI for workspace file editing
 * Issue #4276: Use backend/monolith Polza.ai endpoint (same as sidebar chat)
 *
 * @param {string} workspaceId - Workspace identifier
 * @param {string} message - User message
 * @param {array} conversationHistory - Conversation history
 * @param {object} options - Chat options
 * @param {string} options.model - AI model to use
 * @param {number} options.temperature - Temperature (0-1)
 * @param {number} options.maxTokens - Max tokens
 * @param {string} options.systemPrompt - System prompt
 * @param {string} options.filepath - File path (for file-specific session)
 * @param {function} onChunk - Callback for streaming response chunks
 * @returns {Promise<object>} Chat result
 */
export async function chatWithWorkspace(workspaceId, message, conversationHistory = [], options = {}, onChunk = null) {
  try {
    // Get or create session for this workspace/file
    const sessionId = await getOrCreateSession(workspaceId, options.filepath, options);

    logger.info(`Sending chat message to Polza.ai`, {
      sessionId,
      workspaceId,
      filepath: options.filepath,
      messageLength: message.length
    });

    // Send chat request to Polza.ai endpoint
    const response = await fetch(`${BASE_URL}/polza/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        message,
        model: options.model || 'anthropic/claude-sonnet-4.5',
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 4096,
        attachments: [] // File attachments if needed
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Chat request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Chat request unsuccessful');
    }

    // Polza.ai returns the full response at once (no streaming)
    // Simulate streaming by sending the response in chunks for compatibility
    if (onChunk && data.response) {
      // Split response into words for pseudo-streaming effect
      const words = data.response.split(' ');
      const chunkSize = 5; // Words per chunk

      for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize).join(' ');
        onChunk({
          type: 'text',
          text: i === 0 ? chunk : ' ' + chunk,
          usage: data.metadata?.usage
        });

        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    return {
      response: data.response,
      metadata: data.metadata
    };
  } catch (error) {
    logger.error('Chat with workspace failed:', error);
    throw error;
  }
}

/**
 * Read file content from workspace
 * @param {string} workspaceId - Workspace identifier
 * @param {string} filepath - File path relative to workspace root
 * @returns {Promise<string>} File content
 */
export async function readWorkspaceFile(workspaceId, filepath) {
  const response = await fetch(`${BASE_URL}/workspace-chat/workspaces/${workspaceId}/files/${filepath}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to read file');
  }

  const result = await response.json();
  return result.content;
}

/**
 * Write/update file content in workspace
 * @param {string} workspaceId - Workspace identifier
 * @param {string} filepath - File path relative to workspace root
 * @param {string} content - File content
 * @returns {Promise<object>} Write result
 */
export async function writeWorkspaceFile(workspaceId, filepath, content) {
  const response = await fetch(`${BASE_URL}/workspace-chat/workspaces/${workspaceId}/files/${filepath}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to write file');
  }

  const result = await response.json();
  return result;
}

/**
 * Delete file from workspace
 * @param {string} workspaceId - Workspace identifier
 * @param {string} filepath - File path relative to workspace root
 * @returns {Promise<object>} Delete result
 */
export async function deleteWorkspaceFile(workspaceId, filepath) {
  const response = await fetch(`${BASE_URL}/workspace-chat/workspaces/${workspaceId}/files/${filepath}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete file');
  }

  const result = await response.json();
  return result;
}

/**
 * Chat with workspace using workspace-ai-agent API (Issue #4417)
 * This uses the TokenBasedLLMCoordinator with tool calling and SSE streaming
 *
 * @param {string} workspaceId - Workspace identifier
 * @param {string} message - User message
 * @param {string} userId - User ID for token authentication
 * @param {object} options - Chat options
 * @param {string} options.model - Model ID (optional, uses default if not provided)
 * @param {string} options.sessionId - Session ID for conversation history (optional)
 * @param {function} onChunk - Callback for streaming response chunks
 * @returns {Promise<object>} Chat result
 */
export async function chatWithWorkspaceAI(workspaceId, message, userId, options = {}, onChunk = null) {
  try {
    logger.info('Sending chat message to workspace-ai-agent', {
      workspaceId,
      userId,
      messageLength: message.length,
      model: options.model
    });

    // Send chat request to workspace-ai-agent endpoint (SSE stream)
    const response = await fetch(`${BASE_URL}/workspace-ai-agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workspaceId,
        message,
        userId,
        modelId: options.model,
        sessionId: options.sessionId
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Workspace AI chat request failed: ${response.status}`);
    }

    // Process SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';
    let usage = null;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events (lines starting with "data: ")
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) {
          continue;
        }

        try {
          const eventData = JSON.parse(line.substring(6)); // Remove "data: " prefix

          if (eventData.event === 'content_block_delta' && eventData.data) {
            const text = eventData.data.text || '';
            fullResponse += text;

            if (onChunk) {
              onChunk({
                type: 'text',
                text
              });
            }
          } else if (eventData.event === 'tool_use' && eventData.data) {
            if (onChunk) {
              onChunk({
                type: 'tool_use',
                toolName: eventData.data.name,
                toolInput: eventData.data.input
              });
            }
          } else if (eventData.event === 'tool_result' && eventData.data) {
            if (onChunk) {
              onChunk({
                type: 'tool_execution',
                result: JSON.stringify(eventData.data, null, 2)
              });
            }
          } else if (eventData.event === 'message_complete' && eventData.data) {
            usage = eventData.data.usage;
          } else if (eventData.event === 'error') {
            throw new Error(eventData.data?.error || 'Workspace AI chat error');
          }
        } catch (parseError) {
          logger.error('Failed to parse SSE event:', parseError, line);
        }
      }
    }

    return {
      response: fullResponse,
      metadata: {
        usage
      }
    };
  } catch (error) {
    logger.error('Workspace AI chat failed:', error);
    throw error;
  }
}

/**
 * Check Polza.ai chat health
 * @returns {Promise<object>} Health status
 */
export async function checkWorkspaceHealth() {
  const response = await fetch(`${BASE_URL}/polza/health`);

  if (!response.ok) {
    throw new Error('Health check failed');
  }

  const result = await response.json();
  return result;
}

export default {
  createWorkspace,
  getUserWorkspaces,
  getWorkspace,
  deleteWorkspace,
  getWorkspaceFileTree,
  chatWithWorkspace,
  chatWithWorkspaceAI,
  checkWorkspaceHealth,
  readWorkspaceFile,
  writeWorkspaceFile,
  deleteWorkspaceFile
};
