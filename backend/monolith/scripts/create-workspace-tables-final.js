#!/usr/bin/env node

/**
 * Create Workspace tables by first creating simple lookup tables for basic types
 * then using those as column types
 *
 * This works around the 'my' database restriction on base types
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_URL = process.env.INTEGRAM_SERVER_URL || 'https://example.integram.io';
const DATABASE = 'my';
const LOGIN = 'd';
const PASSWORD = 'd';

function parseMCPResponse(response) {
  try {
    const content = response.content[0].text;
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

async function createSimpleLookupTable(client, name, baseTypeId) {
  console.log(`  Creating lookup table: ${name}...`);

  const result = await client.callTool({
    name: 'integram_create_type',
    arguments: {
      name: name,
      baseTypeId: baseTypeId,
      unique: false
    }
  });

  const data = parseMCPResponse(result);
  if (!data) {
    console.error(`  Failed: No data returned`);
    return null;
  }

  // Handle different response formats
  const typeId = data.typeId || data.id || data.obj;
  if (!typeId) {
    console.error(`  Failed:`, data);
    return null;
  }

  console.log(`  ✓ Created: ${name} (ID: ${typeId})`);
  return typeId;
}

async function deleteWorkspacesTable(client, tableId) {
  console.log(`\n🗑️  Deleting existing Workspaces table (ID: ${tableId})...`);

  try {
    const result = await client.callTool({
      name: 'integram_delete_type',
      arguments: { typeId: tableId }
    });

    const data = parseMCPResponse(result);
    if (data?.success) {
      console.log('✅ Table deleted successfully');
      return true;
    } else {
      console.log('⚠️  Could not delete table:', data?.error);
      return false;
    }
  } catch (error) {
    console.log('⚠️  Error deleting table:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Creating Workspace Tables with Lookups\n');

  const serverScriptPath = path.join(__dirname, '../src/services/mcp/integram-server.js');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverScriptPath],
  });

  const client = new Client(
    { name: 'workspace-creator', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  try {
    await client.connect(transport);

    const authResult = await client.callTool({
      name: 'integram_authenticate',
      arguments: { serverURL: SERVER_URL, database: DATABASE, login: LOGIN, password: PASSWORD }
    });

    const authData = parseMCPResponse(authResult);
    if (!authData?.success) throw new Error('Auth failed');

    console.log('✅ Authenticated\n');

    // Delete the existing empty Workspaces table
    await deleteWorkspacesTable(client, 205944);

    // Create lookup tables for basic types we need
    console.log('\n📋 Creating lookup tables for basic types...\n');

    const textFieldType = await createSimpleLookupTable(client, 'WorkspaceTextField', 3);
    const numberFieldType = await createSimpleLookupTable(client, 'WorkspaceNumberField', 13);
    const dateFieldType = await createSimpleLookupTable(client, 'WorkspaceDateField', 4);
    const boolFieldType = await createSimpleLookupTable(client, 'WorkspaceBoolField', 7);
    const longTextFieldType = await createSimpleLookupTable(client, 'WorkspaceLongTextField', 2);

    if (!textFieldType || !numberFieldType || !dateFieldType || !boolFieldType || !longTextFieldType) {
      throw new Error('Failed to create lookup tables');
    }

    console.log('\n📊 Creating Workspaces table with columns...');

    const workspacesColumns = [
      { requisiteTypeId: textFieldType, alias: 'Workspace ID' },
      { requisiteTypeId: textFieldType, alias: 'Name' },
      { requisiteTypeId: textFieldType, alias: 'User ID' },
      { requisiteTypeId: textFieldType, alias: 'Integram Server' },
      { requisiteTypeId: textFieldType, alias: 'Path' },
      { requisiteTypeId: textFieldType, alias: 'Repository URL' },
      { requisiteTypeId: textFieldType, alias: 'Repository Branch' },
      { requisiteTypeId: textFieldType, alias: 'Repository Commit' },
      { requisiteTypeId: numberFieldType, alias: 'Repository File Count' },
      { requisiteTypeId: numberFieldType, alias: 'Repository Size Bytes' },
      { requisiteTypeId: dateFieldType, alias: 'Created At' },
      { requisiteTypeId: dateFieldType, alias: 'Last Activity' },
      { requisiteTypeId: boolFieldType, alias: 'Allow Read' },
      { requisiteTypeId: boolFieldType, alias: 'Allow Write' },
      { requisiteTypeId: boolFieldType, alias: 'Allow Bash' },
      { requisiteTypeId: boolFieldType, alias: 'Allow Web Fetch' },
      { requisiteTypeId: boolFieldType, alias: 'Allow Glob' },
      { requisiteTypeId: boolFieldType, alias: 'Allow Grep' },
      { requisiteTypeId: longTextFieldType, alias: 'Restricted Paths JSON' },
      { requisiteTypeId: numberFieldType, alias: 'Files Created' },
      { requisiteTypeId: numberFieldType, alias: 'Files Modified' },
      { requisiteTypeId: numberFieldType, alias: 'Files Deleted' },
      { requisiteTypeId: numberFieldType, alias: 'Commands Executed' },
      { requisiteTypeId: numberFieldType, alias: 'Size Bytes' }
    ];

    const workspacesResult = await client.callTool({
      name: 'integram_create_table_with_columns',
      arguments: {
        tableName: 'Workspaces',
        baseTypeId: 0,
        unique: false,
        columns: workspacesColumns
      }
    });

    console.log('\nRaw Workspaces result:', JSON.stringify(workspacesResult, null, 2));

    const workspacesData = parseMCPResponse(workspacesResult);
    console.log('Parsed Workspaces data:', JSON.stringify(workspacesData, null, 2));

    console.log('\n✅ Workspaces table created!');
    console.log(`Table ID: ${workspacesData.typeId || workspacesData.obj || workspacesData.id}`);
    console.log(`Columns: ${workspacesData.columnsCreated || workspacesData.columns?.length || 0}`);

    console.log('\n📊 Creating WorkspaceSessions table with columns...');

    const sessionsColumns = [
      { requisiteTypeId: textFieldType, alias: 'Workspace ID' },
      { requisiteTypeId: textFieldType, alias: 'File Path' },
      { requisiteTypeId: textFieldType, alias: 'Session ID' },
      { requisiteTypeId: dateFieldType, alias: 'Created At' },
      { requisiteTypeId: dateFieldType, alias: 'Last Used' },
      { requisiteTypeId: numberFieldType, alias: 'Message Count' }
    ];

    const sessionsResult = await client.callTool({
      name: 'integram_create_table_with_columns',
      arguments: {
        tableName: 'WorkspaceSessions',
        baseTypeId: 0,
        unique: false,
        columns: sessionsColumns
      }
    });

    const sessionsData = parseMCPResponse(sessionsResult);
    console.log('\n✅ WorkspaceSessions table created!');
    console.log(`Table ID: ${sessionsData.typeId}`);
    console.log(`Columns: ${sessionsData.columnsCreated || sessionsData.columns?.length || 0}`);

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL TABLES CREATED SUCCESSFULLY');
    console.log('='.repeat(80));

    console.log('\n📄 IDs to save:\n');
    console.log('```javascript');
    console.log(`export const WORKSPACES_TABLE_ID = ${workspacesData.typeId};`);
    console.log(`export const SESSIONS_TABLE_ID = ${sessionsData.typeId};`);
    console.log('```\n');

    console.log('Column details saved in response objects');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
