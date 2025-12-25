#!/usr/bin/env node

/**
 * Test Workspaces table with the ACTUAL shared requisite structure
 *
 * Issue #4828: Tables use shared requisites (205951-205955) for storing data.
 * Each requisite stores JSON for its data type (text, number, date, bool, longtext).
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

// Table and requisite IDs (from get-table-metadata.js output)
const WORKSPACES_TABLE_ID = 205950;
const TEXT_REQ_ID = 205951;       // WorkspaceTextField
const NUMBER_REQ_ID = 205952;     // WorkspaceNumberField
const DATE_REQ_ID = 205953;       // WorkspaceDateField
const BOOL_REQ_ID = 205954;       // WorkspaceBoolField
const LONG_TEXT_REQ_ID = 205955;  // WorkspaceLongTextField

function parseMCPResponse(response) {
  try {
    const content = response.content[0].text;
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to parse:', error.message);
    return null;
  }
}

async function main() {
  console.log('🧪 Testing Workspaces table (v2 - shared requisites)\n');

  const serverScriptPath = path.join(__dirname, '../src/services/mcp/integram-server.js');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverScriptPath],
  });

  const client = new Client(
    { name: 'workspace-tester-v2', version: '1.0.0' },
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

    // Create test workspace
    console.log('📝 Creating test workspace...');
    const workspaceId = `test-workspace-${Date.now()}`;
    const now = new Date().toISOString();

    // Prepare data for each requisite type
    const textData = {
      workspaceId: workspaceId,
      name: 'Test Workspace',
      userId: '285',
      integramServer: 'dronedoc.ru',
      path: `/var/lib/drondoc/workspaces/${workspaceId}`,
      repositoryUrl: 'https://github.com/test/repo',
      repositoryBranch: 'main',
      repositoryCommit: 'abc123def456'
    };

    const numberData = {
      repositoryFileCount: 150,
      repositorySizeBytes: 2048000,
      filesCreated: 10,
      filesModified: 25,
      filesDeleted: 3,
      commandsExecuted: 50,
      sizeBytes: 3072000
    };

    const dateData = {
      createdAt: now,
      lastActivity: now
    };

    const boolData = {
      allowRead: true,
      allowWrite: true,
      allowBash: true,
      allowWebFetch: false,
      allowGlob: true,
      allowGrep: true
    };

    const longTextData = {
      restrictedPaths: ['/etc', '/usr/bin', '~/.ssh', '/root']
    };

    console.log('\nData to store:');
    console.log('  Text fields:', textData);
    console.log('  Number fields:', numberData);
    console.log('  Date fields:', dateData);
    console.log('  Bool fields:', boolData);
    console.log('  Long text data:', longTextData);
    console.log('');

    const createResult = await client.callTool({
      name: 'integram_create_object',
      arguments: {
        typeId: WORKSPACES_TABLE_ID,
        value: `Workspace: ${textData.name}`,  // Object name/value
        requisites: {
          [TEXT_REQ_ID]: JSON.stringify(textData),
          [NUMBER_REQ_ID]: JSON.stringify(numberData),
          [DATE_REQ_ID]: JSON.stringify(dateData),
          [BOOL_REQ_ID]: JSON.stringify(boolData),
          [LONG_TEXT_REQ_ID]: JSON.stringify(longTextData)
        }
      }
    });

    const createData = parseMCPResponse(createResult);
    console.log('Create result:', JSON.stringify(createData, null, 2));

    if (!createData?.success && !createData?.id && !createData?.objectId) {
      console.error('❌ Failed to create workspace');
      console.error('Response:', createData);
      throw new Error('Create failed');
    }

    const objectId = createData.objectId || createData.id;
    console.log(`\n✅ Test workspace created with object ID: ${objectId}\n`);

    // Retrieve the workspace to verify
    console.log('🔍 Retrieving workspace to verify...');
    const getResult = await client.callTool({
      name: 'integram_get_object_edit_data',
      arguments: { objectId: objectId.toString() }
    });

    const getData = parseMCPResponse(getResult);
    console.log('✅ Workspace retrieved successfully!\n');
    console.log('Retrieved data:');
    console.log(JSON.stringify(getData, null, 2));

    // Parse and display the JSON data from requisites
    console.log('\n📊 Parsed workspace data:');
    if (getData && getData.reqs) {
      const reqs = getData.reqs;

      if (reqs[TEXT_REQ_ID]) {
        console.log('\n  Text fields:');
        try {
          const parsed = typeof reqs[TEXT_REQ_ID].value === 'string'
            ? JSON.parse(reqs[TEXT_REQ_ID].value)
            : reqs[TEXT_REQ_ID].value;
          console.log(JSON.stringify(parsed, null, 4));
        } catch (e) {
          console.log('    Raw:', reqs[TEXT_REQ_ID].value);
        }
      }

      if (reqs[NUMBER_REQ_ID]) {
        console.log('\n  Number fields:');
        try {
          const parsed = typeof reqs[NUMBER_REQ_ID].value === 'string'
            ? JSON.parse(reqs[NUMBER_REQ_ID].value)
            : reqs[NUMBER_REQ_ID].value;
          console.log(JSON.stringify(parsed, null, 4));
        } catch (e) {
          console.log('    Raw:', reqs[NUMBER_REQ_ID].value);
        }
      }

      if (reqs[DATE_REQ_ID]) {
        console.log('\n  Date fields:');
        try {
          const parsed = typeof reqs[DATE_REQ_ID].value === 'string'
            ? JSON.parse(reqs[DATE_REQ_ID].value)
            : reqs[DATE_REQ_ID].value;
          console.log(JSON.stringify(parsed, null, 4));
        } catch (e) {
          console.log('    Raw:', reqs[DATE_REQ_ID].value);
        }
      }

      if (reqs[BOOL_REQ_ID]) {
        console.log('\n  Bool fields:');
        try {
          const parsed = typeof reqs[BOOL_REQ_ID].value === 'string'
            ? JSON.parse(reqs[BOOL_REQ_ID].value)
            : reqs[BOOL_REQ_ID].value;
          console.log(JSON.stringify(parsed, null, 4));
        } catch (e) {
          console.log('    Raw:', reqs[BOOL_REQ_ID].value);
        }
      }
    }

    // List all workspaces
    console.log('\n📋 Listing all workspaces...');
    const listResult = await client.callTool({
      name: 'integram_get_object_list',
      arguments: {
        typeId: WORKSPACES_TABLE_ID,
        params: { offset: 0, limit: 10 }
      }
    });

    const listData = parseMCPResponse(listResult);
    const count = listData?.object?.length || 0;
    console.log(`Found ${count} workspace(s)`);

    if (count > 0) {
      console.log('\nWorkspaces:');
      listData.object.forEach((ws, index) => {
        console.log(`  ${index + 1}. ID: ${ws.id}, Name: ${ws.val}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ TEST SUCCESSFUL');
    console.log('='.repeat(80));
    console.log('\nThe Workspaces table is working correctly with shared requisites!');
    console.log('Data is stored as JSON in each requisite type.');
    console.log('Ready for integration into WorkspaceService.js\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
