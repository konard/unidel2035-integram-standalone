#!/usr/bin/env node

/**
 * Create Database Sessions Table
 *
 * Issue #3631: Sistema de almacenamiento de tokens de bases de datos
 *
 * This script creates the "Сессии БД" (Database Sessions) table in ddadmin
 * for storing authentication tokens across multiple databases.
 *
 * Table Structure:
 * - Session ID (UUID)
 * - Username
 * - Created At (DATETIME)
 * - Expires At (DATETIME)
 * - Databases JSON (encrypted token data)
 * - MFA Verified (BOOL)
 * - SSO Provider
 * - Metadata JSON
 *
 * Usage:
 *   node scripts/create-db-sessions-table.js
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SERVER_URL = 'https://dronedoc.ru';
const DATABASE = 'ddadmin';
const LOGIN = process.env.INTEGRAM_LOGIN || 'd';
const PASSWORD = process.env.INTEGRAM_PASSWORD || 'd';

const TABLE_NAME = 'Сессии БД';
const BASE_TYPE_ID = 0; // For ddadmin database

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
 * Main execution
 */
async function main() {
  console.log('🚀 Database Sessions Table Creator');
  console.log('Issue #3631: Sistema de almacenamiento de tokens de bases de datos\n');

  // Initialize MCP client
  const serverScriptPath = path.join(__dirname, '../src/services/mcp/integram-server.js');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverScriptPath],
  });

  const client = new Client(
    {
      name: 'db-sessions-table-creator',
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
    console.log(`   Role: ${authData.userRole}`);

    // Step 1: Check if table already exists
    console.log(`\n📋 Checking if table "${TABLE_NAME}" already exists...`);
    const dictResult = await client.callTool({
      name: 'integram_get_dictionary',
      arguments: {}
    });

    console.log('Dictionary result:', JSON.stringify(dictResult, null, 2));

    const dictionary = parseMCPResponse(dictResult);
    console.log('Parsed dictionary:', JSON.stringify(dictionary, null, 2).substring(0, 500));

    if (!dictionary) {
      throw new Error('Failed to parse dictionary response');
    }

    // Dictionary might be array directly or wrapped in object
    const types = Array.isArray(dictionary) ? dictionary : (dictionary.types || []);
    if (types.length === 0) {
      console.log('Warning: No types found in dictionary');
    }

    const existingTable = types.find(t => t.name === TABLE_NAME);
    if (existingTable) {
      console.log(`⚠️  Table "${TABLE_NAME}" already exists (ID: ${existingTable.id})`);
      console.log('   Skipping table creation.');
      console.log(`\n✅ You can use existing table ID: ${existingTable.id}`);
      return;
    }

    console.log(`✅ Table "${TABLE_NAME}" does not exist. Creating...`);

    // Step 2: Create table with all columns
    console.log(`\n🔨 Creating table "${TABLE_NAME}" with columns...`);

    const createTableResult = await client.callTool({
      name: 'integram_create_table_with_columns',
      arguments: {
        tableName: TABLE_NAME,
        baseTypeId: BASE_TYPE_ID,
        unique: false,
        columns: [
          {
            requisiteTypeId: 3,  // SHORT text
            alias: 'Session ID',
            allowNull: false
          },
          {
            requisiteTypeId: 3,  // SHORT text
            alias: 'Username',
            allowNull: false
          },
          {
            requisiteTypeId: 4,  // DATETIME
            alias: 'Created At',
            allowNull: false
          },
          {
            requisiteTypeId: 4,  // DATETIME
            alias: 'Expires At',
            allowNull: false
          },
          {
            requisiteTypeId: 2,  // LONG text (for JSON)
            alias: 'Databases JSON',
            allowNull: false
          },
          {
            requisiteTypeId: 7,  // BOOL
            alias: 'MFA Verified',
            allowNull: true
          },
          {
            requisiteTypeId: 3,  // SHORT text
            alias: 'SSO Provider',
            allowNull: true
          },
          {
            requisiteTypeId: 2,  // LONG text (for JSON)
            alias: 'Metadata JSON',
            allowNull: true
          }
        ]
      }
    });

    const tableCreated = parseMCPResponse(createTableResult);
    if (!tableCreated || !tableCreated.success) {
      throw new Error('Failed to create table');
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ TABLE CREATED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log(`\nTable Name: ${TABLE_NAME}`);
    console.log(`Table ID: ${tableCreated.typeId}`);
    console.log(`Columns Created: ${tableCreated.columnsCreated}`);

    console.log(`\nColumn Details:`);
    tableCreated.columns.forEach((col, index) => {
      console.log(`  ${index + 1}. ${col.alias} (ID: ${col.requisiteId})`);
      console.log(`     Type: ${col.requisiteTypeId}`);
      console.log(`     Allow Null: ${col.allowNull}`);
    });

    // Step 3: Verify table structure
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

    // Save table info for reference
    const tableInfo = {
      tableName: TABLE_NAME,
      typeId: tableCreated.typeId,
      database: DATABASE,
      createdAt: new Date().toISOString(),
      columns: tableCreated.columns.map(col => ({
        id: col.requisiteId,
        alias: col.alias,
        type: col.requisiteTypeId,
        allowNull: col.allowNull
      }))
    };

    console.log('\n' + '='.repeat(80));
    console.log('📄 SAVE THIS INFORMATION');
    console.log('='.repeat(80));
    console.log(`\nAdd to your .env file:`);
    console.log(`DB_SESSIONS_TABLE_ID=${tableCreated.typeId}`);
    console.log(`DB_SESSIONS_TABLE_NAME=${TABLE_NAME}`);

    console.log(`\nColumn IDs for code:`);
    tableCreated.columns.forEach(col => {
      const constName = col.alias.toUpperCase().replace(/ /g, '_');
      console.log(`const ${constName}_FIELD_ID = ${col.requisiteId}; // ${col.alias}`);
    });

    console.log('\n✅ Database Sessions Table setup complete!');
    console.log('\nNext steps:');
    console.log('1. Add DB_SESSIONS_TABLE_ID to your .env file');
    console.log('2. Update DatabaseTokenStorage service with column IDs');
    console.log('3. Test saving and retrieving sessions');

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
