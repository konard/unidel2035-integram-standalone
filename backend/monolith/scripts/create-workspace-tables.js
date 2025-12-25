#!/usr/bin/env node

/**
 * Create Workspace and Session Tables in Integram
 *
 * Issue #4828: Move workspace and session settings from JSON/RAM to Integram database
 *
 * This script creates two tables in Integram:
 * 1. Workspaces - stores workspace metadata and configuration
 * 2. WorkspaceSessions - stores chat session data
 *
 * Usage:
 *   node scripts/create-workspace-tables.js
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

const WORKSPACES_TABLE = {
  name: 'Workspaces',
  baseTypeId: 1, // Independent type for 'my' database
  columns: [
    { requisiteTypeId: 3, alias: 'Workspace ID', allowNull: false },
    { requisiteTypeId: 3, alias: 'Name', allowNull: false },
    { requisiteTypeId: 3, alias: 'User ID', allowNull: false },
    { requisiteTypeId: 3, alias: 'Integram Server', allowNull: true },
    { requisiteTypeId: 3, alias: 'Path', allowNull: false },
    { requisiteTypeId: 3, alias: 'Repository URL', allowNull: true },
    { requisiteTypeId: 3, alias: 'Repository Branch', allowNull: true },
    { requisiteTypeId: 3, alias: 'Repository Commit', allowNull: true },
    { requisiteTypeId: 13, alias: 'Repository File Count', allowNull: true },
    { requisiteTypeId: 13, alias: 'Repository Size Bytes', allowNull: true },
    { requisiteTypeId: 4, alias: 'Created At', allowNull: false },
    { requisiteTypeId: 4, alias: 'Last Activity', allowNull: false },
    { requisiteTypeId: 7, alias: 'Allow Read', allowNull: false },
    { requisiteTypeId: 7, alias: 'Allow Write', allowNull: false },
    { requisiteTypeId: 7, alias: 'Allow Bash', allowNull: false },
    { requisiteTypeId: 7, alias: 'Allow Web Fetch', allowNull: false },
    { requisiteTypeId: 7, alias: 'Allow Glob', allowNull: false },
    { requisiteTypeId: 7, alias: 'Allow Grep', allowNull: false },
    { requisiteTypeId: 2, alias: 'Restricted Paths JSON', allowNull: true },
    { requisiteTypeId: 13, alias: 'Files Created', allowNull: true },
    { requisiteTypeId: 13, alias: 'Files Modified', allowNull: true },
    { requisiteTypeId: 13, alias: 'Files Deleted', allowNull: true },
    { requisiteTypeId: 13, alias: 'Commands Executed', allowNull: true },
    { requisiteTypeId: 13, alias: 'Size Bytes', allowNull: true }
  ]
};

const SESSIONS_TABLE = {
  name: 'WorkspaceSessions',
  baseTypeId: 1, // Independent type for 'my' database
  columns: [
    { requisiteTypeId: 3, alias: 'Workspace ID', allowNull: false },
    { requisiteTypeId: 3, alias: 'File Path', allowNull: false },
    { requisiteTypeId: 3, alias: 'Session ID', allowNull: false },
    { requisiteTypeId: 4, alias: 'Created At', allowNull: false },
    { requisiteTypeId: 4, alias: 'Last Used', allowNull: false },
    { requisiteTypeId: 13, alias: 'Message Count', allowNull: true }
  ]
};

/**
 * Parse MCP response
 */
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

/**
 * Create a table with columns
 */
async function createTable(client, tableDef) {
  console.log(`\n🔨 Creating table "${tableDef.name}" with ${tableDef.columns.length} columns...`);

  // Check if table already exists
  console.log(`📋 Checking if table "${tableDef.name}" already exists...`);
  const dictResult = await client.callTool({
    name: 'integram_get_dictionary',
    arguments: {}
  });

  const dictionary = parseMCPResponse(dictResult);
  if (!dictionary) {
    throw new Error('Failed to parse dictionary response');
  }

  const types = Array.isArray(dictionary) ? dictionary : (dictionary.types || []);
  const existingTable = types.find(t => t.name === tableDef.name);

  if (existingTable) {
    console.log(`⚠️  Table "${tableDef.name}" already exists (ID: ${existingTable.id})`);
    console.log('   Skipping table creation.');
    return {
      typeId: existingTable.id,
      existed: true
    };
  }

  console.log(`✅ Table "${tableDef.name}" does not exist. Creating...`);

  // Create table with all columns
  const createTableResult = await client.callTool({
    name: 'integram_create_table_with_columns',
    arguments: {
      tableName: tableDef.name,
      baseTypeId: tableDef.baseTypeId,
      unique: false,
      columns: tableDef.columns
    }
  });

  console.log('Create table response:', JSON.stringify(createTableResult, null, 2));

  const tableCreated = parseMCPResponse(createTableResult);
  console.log('Parsed response:', JSON.stringify(tableCreated, null, 2));

  if (!tableCreated || !tableCreated.success) {
    console.error('Error details:', tableCreated?.error || 'Unknown error');
    throw new Error(`Failed to create table: ${tableDef.name}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log(`✅ TABLE "${tableDef.name}" CREATED SUCCESSFULLY`);
  console.log('='.repeat(80));
  console.log(`\nTable ID: ${tableCreated.typeId}`);
  console.log(`Columns Created: ${tableCreated.columnsCreated}`);

  console.log(`\nColumn Details:`);
  tableCreated.columns.forEach((col, index) => {
    console.log(`  ${index + 1}. ${col.alias} (ID: ${col.requisiteId})`);
    console.log(`     Type: ${col.requisiteTypeId}`);
    console.log(`     Allow Null: ${col.allowNull}`);
  });

  // Verify table structure
  console.log(`\n🔍 Verifying table structure...`);
  const verifyResult = await client.callTool({
    name: 'integram_get_table_structure',
    arguments: {
      typeId: tableCreated.typeId
    }
  });

  const tableStructure = parseMCPResponse(verifyResult);
  console.log(`\n✅ Table verified:`);
  console.log(`   Table ID: ${tableStructure.typeId}`);
  console.log(`   Table Name: ${tableStructure.tableName}`);
  console.log(`   Column Count: ${tableStructure.columnCount}`);

  return {
    typeId: tableCreated.typeId,
    columns: tableCreated.columns,
    existed: false
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Workspace Tables Creator');
  console.log('Issue #4828: Move workspace and session settings to Integram\n');

  // Initialize MCP client
  const serverScriptPath = path.join(__dirname, '../src/services/mcp/integram-server.js');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverScriptPath],
  });

  const client = new Client(
    {
      name: 'workspace-tables-creator',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  try {
    // Connect to MCP server
    console.log('📡 Connecting to Integram MCP Server...');
    await client.connect(transport);
    console.log('✅ Connected!\n');

    // Authenticate
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

    console.log('✅ Authentication successful');
    console.log(`   User: ${authData.userName} (ID: ${authData.userId})`);
    console.log(`   Role: ${authData.userRole || 'N/A'}`);

    // Get type editor data to find valid base type ID
    console.log('\n🔍 Getting type editor data to detect base type ID...');
    const editorDataResult = await client.callTool({
      name: 'integram_get_type_editor_data',
      arguments: {}
    });

    const editorData = parseMCPResponse(editorDataResult);
    console.log('Full editor data:', JSON.stringify(editorData, null, 2).substring(0, 1000));
    console.log('Base type options:', JSON.stringify(editorData?.baseTypeOptions, null, 2));

    // Detect correct base type ID
    let baseTypeId = 1; // Default
    if (editorData.baseTypeOptions && editorData.baseTypeOptions.length > 0) {
      // Find first available base type (usually ID 0 or 1)
      const firstBaseType = editorData.baseTypeOptions[0];
      baseTypeId = firstBaseType.id;
      console.log(`✅ Detected base type ID: ${baseTypeId} (${firstBaseType.name})`);
    }

    // Update table definitions with detected base type
    WORKSPACES_TABLE.baseTypeId = baseTypeId;
    SESSIONS_TABLE.baseTypeId = baseTypeId;

    // Create Workspaces table
    const workspacesResult = await createTable(client, WORKSPACES_TABLE);

    // Create WorkspaceSessions table
    const sessionsResult = await createTable(client, SESSIONS_TABLE);

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('📄 SAVE THIS INFORMATION');
    console.log('='.repeat(80));

    console.log(`\n🎯 Add to backend/monolith/src/config/integram-requisites.js:`);
    console.log('\n```javascript');
    console.log(`export const WORKSPACES_TABLE_ID = ${workspacesResult.typeId};`);
    console.log(`export const SESSIONS_TABLE_ID = ${sessionsResult.typeId};`);

    if (!workspacesResult.existed) {
      console.log('\n// Workspace column IDs');
      workspacesResult.columns.forEach(col => {
        const constName = col.alias.toUpperCase().replace(/ /g, '_');
        console.log(`export const WORKSPACE_${constName}_REQ_ID = ${col.requisiteId}; // ${col.alias}`);
      });
    }

    if (!sessionsResult.existed) {
      console.log('\n// Session column IDs');
      sessionsResult.columns.forEach(col => {
        const constName = col.alias.toUpperCase().replace(/ /g, '_');
        console.log(`export const SESSION_${constName}_REQ_ID = ${col.requisiteId}; // ${col.alias}`);
      });
    }

    console.log('```');

    console.log('\n✅ Workspace Tables setup complete!');
    console.log('\nNext steps:');
    console.log('1. Add table IDs and column IDs to src/config/integram-requisites.js');
    console.log('2. Update WorkspaceService.js to use Integram tables instead of JSON/Map');
    console.log('3. Create migration script to move existing workspaces to Integram');
    console.log('4. Test workspace creation and retrieval');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    // Close MCP client
    await client.close();
  }
}

main();
