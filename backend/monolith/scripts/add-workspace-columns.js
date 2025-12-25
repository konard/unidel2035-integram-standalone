#!/usr/bin/env node

/**
 * Add columns to existing Workspaces table in Integram
 *
 * Issue #4828: Move workspace and session settings from JSON/RAM to Integram database
 *
 * This script adds requisites (columns) to the Workspaces table (ID: 205944)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SERVER_URL = process.env.INTEGRAM_SERVER || 'https://dronedoc.ru';
const DATABASE = process.env.INTEGRAM_DATABASE || 'my';
const LOGIN = process.env.INTEGRAM_LOGIN || 'd';
const PASSWORD = process.env.INTEGRAM_PASSWORD || 'd';

const WORKSPACES_TABLE_ID = 205950; // Created via MCP

// Lookup table IDs (wrappers around base types - created in Phase 1)
const WORKSPACE_TEXT_FIELD_TYPE = 205945;  // Wraps SHORT (3)
const WORKSPACE_NUMBER_FIELD_TYPE = 205946; // Wraps NUMBER (13)
const WORKSPACE_DATE_FIELD_TYPE = 205947;  // Wraps DATETIME (4)
const WORKSPACE_BOOL_FIELD_TYPE = 205948;  // Wraps BOOL (7)
const WORKSPACE_LONG_TEXT_FIELD_TYPE = 205949; // Wraps LONG (2)

const WORKSPACES_COLUMNS = [
  { requisiteTypeId: WORKSPACE_TEXT_FIELD_TYPE, alias: 'Workspace ID' },
  { requisiteTypeId: WORKSPACE_TEXT_FIELD_TYPE, alias: 'Name' },
  { requisiteTypeId: WORKSPACE_TEXT_FIELD_TYPE, alias: 'User ID' },
  { requisiteTypeId: WORKSPACE_TEXT_FIELD_TYPE, alias: 'Integram Server' },
  { requisiteTypeId: WORKSPACE_TEXT_FIELD_TYPE, alias: 'Path' },
  { requisiteTypeId: WORKSPACE_TEXT_FIELD_TYPE, alias: 'Repository URL' },
  { requisiteTypeId: WORKSPACE_TEXT_FIELD_TYPE, alias: 'Repository Branch' },
  { requisiteTypeId: WORKSPACE_TEXT_FIELD_TYPE, alias: 'Repository Commit' },
  { requisiteTypeId: WORKSPACE_NUMBER_FIELD_TYPE, alias: 'Repository File Count' },
  { requisiteTypeId: WORKSPACE_NUMBER_FIELD_TYPE, alias: 'Repository Size Bytes' },
  { requisiteTypeId: WORKSPACE_DATE_FIELD_TYPE, alias: 'Created At' },
  { requisiteTypeId: WORKSPACE_DATE_FIELD_TYPE, alias: 'Last Activity' },
  { requisiteTypeId: WORKSPACE_BOOL_FIELD_TYPE, alias: 'Allow Read' },
  { requisiteTypeId: WORKSPACE_BOOL_FIELD_TYPE, alias: 'Allow Write' },
  { requisiteTypeId: WORKSPACE_BOOL_FIELD_TYPE, alias: 'Allow Bash' },
  { requisiteTypeId: WORKSPACE_BOOL_FIELD_TYPE, alias: 'Allow Web Fetch' },
  { requisiteTypeId: WORKSPACE_BOOL_FIELD_TYPE, alias: 'Allow Glob' },
  { requisiteTypeId: WORKSPACE_BOOL_FIELD_TYPE, alias: 'Allow Grep' },
  { requisiteTypeId: WORKSPACE_LONG_TEXT_FIELD_TYPE, alias: 'Restricted Paths JSON' },
  { requisiteTypeId: WORKSPACE_NUMBER_FIELD_TYPE, alias: 'Files Created' },
  { requisiteTypeId: WORKSPACE_NUMBER_FIELD_TYPE, alias: 'Files Modified' },
  { requisiteTypeId: WORKSPACE_NUMBER_FIELD_TYPE, alias: 'Files Deleted' },
  { requisiteTypeId: WORKSPACE_NUMBER_FIELD_TYPE, alias: 'Commands Executed' },
  { requisiteTypeId: WORKSPACE_NUMBER_FIELD_TYPE, alias: 'Size Bytes' }
];

function parseMCPResponse(response) {
  try {
    const content = response.content[0].text;
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to parse MCP response:', error.message);
    console.error('Response:', response);
    return null;
  }
}

async function addColumn(client, typeId, column) {
  console.log(`  Adding column: ${column.alias} (type: ${column.requisiteTypeId})...`);

  const result = await client.callTool({
    name: 'integram_add_requisite',
    arguments: {
      typeId: typeId,
      requisiteTypeId: column.requisiteTypeId
    }
  });

  console.log('  Raw result:', JSON.stringify(result, null, 2));

  const data = parseMCPResponse(result);
  console.log('  Parsed data:', JSON.stringify(data, null, 2));

  // Check if requisite was created (Integram returns ID even for existing requisites)
  const requisiteId = data.id || data.requisiteId;

  if (!requisiteId) {
    console.error(`  Error: ${data?.error || 'No requisite ID returned'}`);
    throw new Error(`Failed to add requisite: ${column.alias}`);
  }

  // Show warning if requisite already existed
  if (data.warnings) {
    console.log(`  ⚠ ${data.warnings}`);
  }

  console.log(`  ✓ Requisite created/found with ID: ${requisiteId}`);

  // Set alias
  const aliasResult = await client.callTool({
    name: 'integram_save_requisite_alias',
    arguments: {
      requisiteId: requisiteId,
      alias: column.alias
    }
  });

  const aliasData = parseMCPResponse(aliasResult);
  if (!aliasData || !aliasData.success) {
    console.warn(`  ⚠ Warning: Failed to set alias for requisite ${requisiteId}`);
  } else {
    console.log(`  ✓ Alias "${column.alias}" set successfully`);
  }

  return { requisiteId, alias: column.alias, requisiteTypeId: column.requisiteTypeId };
}

async function main() {
  console.log('🔨 Adding columns to Workspaces table');
  console.log(`Table ID: ${WORKSPACES_TABLE_ID}\n`);

  const serverScriptPath = path.join(__dirname, '../src/services/mcp/integram-server.js');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverScriptPath],
  });

  const client = new Client(
    {
      name: 'workspace-columns-adder',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  try {
    console.log('📡 Connecting to Integram MCP Server...');
    await client.connect(transport);
    console.log('✅ Connected!\n');

    console.log(`🔐 Authenticating with ${SERVER_URL}/${DATABASE}...`);
    const authResult = await client.callTool({
      name: 'integram_authenticate',
      arguments: {
        serverURL: SERVER_URL,
        database: DATABASE,
        login: LOGIN,
        password: PASSWORD
      }
    });

    const authData = parseMCPResponse(authResult);
    if (!authData || !authData.success) {
      throw new Error('Authentication failed');
    }

    console.log('✅ Authentication successful\n');

    console.log(`📋 Adding ${WORKSPACES_COLUMNS.length} columns to Workspaces table...\n`);

    const addedColumns = [];
    for (let i = 0; i < WORKSPACES_COLUMNS.length; i++) {
      const column = WORKSPACES_COLUMNS[i];
      console.log(`[${i + 1}/${WORKSPACES_COLUMNS.length}]`);
      const result = await addColumn(client, WORKSPACES_TABLE_ID, column);
      addedColumns.push(result);
      console.log('');
    }

    console.log('=' .repeat(80));
    console.log('✅ ALL COLUMNS ADDED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log(`\nTotal columns added: ${addedColumns.length}\n`);

    console.log('📄 Column IDs to save:\n');
    console.log('```javascript');
    console.log(`export const WORKSPACES_TABLE_ID = ${WORKSPACES_TABLE_ID};`);
    console.log('');
    addedColumns.forEach((col, index) => {
      const constName = col.alias.toUpperCase().replace(/ /g, '_');
      console.log(`export const WORKSPACE_${constName}_REQ_ID = ${col.requisiteId}; // ${col.alias}`);
    });
    console.log('```\n');

    console.log('Next steps:');
    console.log('1. Create WorkspaceSessions table');
    console.log('2. Add these constants to src/config/integram-requisites.js');
    console.log('3. Update WorkspaceService.js to use Integram');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
