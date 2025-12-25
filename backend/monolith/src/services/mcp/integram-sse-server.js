#!/usr/bin/env node

/**
 * Integram MCP Server with SSE Transport
 *
 * This server implements MCP protocol over SSE (Server-Sent Events)
 * for use with Claude web interface (claude.ai)
 *
 * Usage:
 *   node integram-sse-server.js
 *
 * Environment Variables:
 *   PORT - Server port (default: 3100)
 *   HOST - Server host (default: 0.0.0.0)
 */

import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { IntegramAPIClient } from '../../../integram/IntegramAPIClient.js';

const PORT = process.env.PORT || 3100;
const HOST = process.env.HOST || '0.0.0.0';

// Integram API client (session will be set per-request)
let apiClient = null;

/**
 * Create MCP Server
 */
function createMCPServer() {
  const server = new Server(
    {
      name: 'integram-sse',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  /**
   * List all available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // Authentication tools
        {
          name: 'integram_authenticate',
          description: 'Authenticate with Integram API and establish a session',
          inputSchema: {
            type: 'object',
            properties: {
              serverURL: {
                type: 'string',
                description: 'Integram server URL (e.g., https://dronedoc.ru)',
              },
              database: {
                type: 'string',
                description: 'Database name (e.g., a2025)',
              },
              login: {
                type: 'string',
                description: 'User login',
              },
              password: {
                type: 'string',
                description: 'User password',
              },
            },
            required: ['serverURL', 'database', 'login', 'password'],
          },
        },
        {
          name: 'integram_set_context',
          description: 'Set authentication context from existing session (token and xsrf)',
          inputSchema: {
            type: 'object',
            properties: {
              serverURL: {
                type: 'string',
                description: 'Integram server URL',
              },
              database: {
                type: 'string',
                description: 'Database name',
              },
              token: {
                type: 'string',
                description: 'Session token',
              },
              xsrfToken: {
                type: 'string',
                description: 'XSRF token',
              },
            },
            required: ['serverURL', 'database', 'token', 'xsrfToken'],
          },
        },
        // Query tools
        {
          name: 'integram_get_dictionary',
          description: 'Get list of independent types (dictionary) from Integram',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'integram_get_type_metadata',
          description: 'Get metadata for a specific type including requisites',
          inputSchema: {
            type: 'object',
            properties: {
              typeId: {
                type: 'number',
                description: 'Type ID',
              },
            },
            required: ['typeId'],
          },
        },
        {
          name: 'integram_get_object_list',
          description: 'Get list of objects for a specific type',
          inputSchema: {
            type: 'object',
            properties: {
              typeId: {
                type: 'number',
                description: 'Type ID',
              },
              params: {
                type: 'object',
                description: 'Query parameters (offset, limit, search, etc.)',
              },
            },
            required: ['typeId'],
          },
        },
        {
          name: 'integram_get_object_edit_data',
          description: 'Get object data for editing',
          inputSchema: {
            type: 'object',
            properties: {
              objectId: {
                type: 'number',
                description: 'Object ID',
              },
            },
            required: ['objectId'],
          },
        },
        // DML operations
        {
          name: 'integram_create_object',
          description: 'Create new object (record) in Integram',
          inputSchema: {
            type: 'object',
            properties: {
              typeId: {
                type: 'number',
                description: 'Type ID',
              },
              value: {
                type: 'string',
                description: 'Object value (name)',
              },
              requisites: {
                type: 'object',
                description: 'Requisites as key-value pairs (requisiteId: value)',
              },
              parentId: {
                type: 'number',
                description: 'Parent object ID (optional)',
              },
            },
            required: ['typeId', 'value'],
          },
        },
        {
          name: 'integram_save_object',
          description: 'Save (update) existing object',
          inputSchema: {
            type: 'object',
            properties: {
              objectId: {
                type: 'number',
                description: 'Object ID',
              },
              value: {
                type: 'string',
                description: 'New object value (name)',
              },
            },
            required: ['objectId', 'value'],
          },
        },
        {
          name: 'integram_delete_object',
          description: 'Delete object from Integram',
          inputSchema: {
            type: 'object',
            properties: {
              objectId: {
                type: 'number',
                description: 'Object ID to delete',
              },
            },
            required: ['objectId'],
          },
        },
        // DDL operations
        {
          name: 'integram_create_type',
          description: 'Create new type (table) in Integram',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Type name',
              },
              baseTypeId: {
                type: 'number',
                description: 'Base type ID (1 for independent types)',
              },
              unique: {
                type: 'boolean',
                description: 'Whether values should be unique',
              },
            },
            required: ['name', 'baseTypeId'],
          },
        },
        {
          name: 'integram_add_requisite',
          description: 'Add requisite (column) to type',
          inputSchema: {
            type: 'object',
            properties: {
              typeId: {
                type: 'number',
                description: 'Type ID',
              },
              requisiteTypeId: {
                type: 'number',
                description: 'Requisite type ID (3=SHORT, 4=DATETIME, 13=NUMBER, etc.)',
              },
            },
            required: ['typeId', 'requisiteTypeId'],
          },
        },
      ],
    };
  });

  /**
   * Execute tool
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result;

      switch (name) {
        case 'integram_authenticate':
          apiClient = new IntegramAPIClient(
            args.serverURL,
            args.database,
            args.login,
            args.password
          );
          result = await apiClient.authenticate();
          break;

        case 'integram_set_context':
          apiClient = new IntegramAPIClient(
            args.serverURL,
            args.database,
            null,
            null
          );
          apiClient.setContext(args.token, args.xsrfToken);
          result = { success: true, message: 'Context set successfully' };
          break;

        case 'integram_get_dictionary':
          if (!apiClient) throw new Error('Not authenticated. Call integram_authenticate first.');
          result = await apiClient.getDictionary();
          break;

        case 'integram_get_type_metadata':
          if (!apiClient) throw new Error('Not authenticated. Call integram_authenticate first.');
          result = await apiClient.getTypeMetadata(args.typeId);
          break;

        case 'integram_get_object_list':
          if (!apiClient) throw new Error('Not authenticated. Call integram_authenticate first.');
          result = await apiClient.getObjectList(args.typeId, args.params || {});
          break;

        case 'integram_get_object_edit_data':
          if (!apiClient) throw new Error('Not authenticated. Call integram_authenticate first.');
          result = await apiClient.getObjectEditData(args.objectId);
          break;

        case 'integram_create_object':
          if (!apiClient) throw new Error('Not authenticated. Call integram_authenticate first.');
          result = await apiClient.createObject(
            args.typeId,
            args.value,
            args.requisites || {},
            args.parentId
          );
          break;

        case 'integram_save_object':
          if (!apiClient) throw new Error('Not authenticated. Call integram_authenticate first.');
          result = await apiClient.saveObject(args.objectId, args.value);
          break;

        case 'integram_delete_object':
          if (!apiClient) throw new Error('Not authenticated. Call integram_authenticate first.');
          result = await apiClient.deleteObject(args.objectId);
          break;

        case 'integram_create_type':
          if (!apiClient) throw new Error('Not authenticated. Call integram_authenticate first.');
          result = await apiClient.createType(args.name, args.baseTypeId, args.unique);
          break;

        case 'integram_add_requisite':
          if (!apiClient) throw new Error('Not authenticated. Call integram_authenticate first.');
          result = await apiClient.addRequisite(args.typeId, args.requisiteTypeId);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: error.message,
                tool: name,
                arguments: args,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Create Express app with SSE endpoint
 */
function createExpressApp() {
  const app = express();

  // Enable CORS for claude.ai
  app.use(
    cors({
      origin: ['https://claude.ai', 'https://*.claude.ai'],
      credentials: true,
    })
  );

  app.use(express.json());

  /**
   * SSE endpoint for MCP protocol
   */
  app.get('/sse', async (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    console.error('SSE client connected');

    const mcpServer = createMCPServer();

    // Handle incoming messages from client
    req.on('data', async (chunk) => {
      try {
        const message = JSON.parse(chunk.toString());
        console.error('Received message:', message);

        // Process MCP request
        const response = await mcpServer.handleRequest(message);

        // Send SSE response
        res.write(`data: ${JSON.stringify(response)}\n\n`);
      } catch (error) {
        console.error('Error processing message:', error);
        res.write(
          `data: ${JSON.stringify({
            error: error.message,
          })}\n\n`
        );
      }
    });

    req.on('end', () => {
      console.error('SSE client disconnected');
      res.end();
    });

    req.on('error', (error) => {
      console.error('SSE error:', error);
      res.end();
    });
  });

  /**
   * Health check
   */
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'integram-mcp-sse',
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

/**
 * Start server
 */
async function main() {
  const app = createExpressApp();

  app.listen(PORT, HOST, () => {
    console.error(`Integram MCP SSE Server running on http://${HOST}:${PORT}`);
    console.error(`SSE endpoint: http://${HOST}:${PORT}/sse`);
    console.error(`Health check: http://${HOST}:${PORT}/health`);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
