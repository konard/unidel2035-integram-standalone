#!/usr/bin/env node

/**
 * Setup Unified Interface Management Tables in Integram
 *
 * Issue #3559 - Управление единым интерфейсом
 *
 * This script creates all necessary tables in Integram for the unified
 * interface management system using the MCP server.
 *
 * Tables to create:
 * 1. БоковоеМеню (ID: 2385 - already exists, add requisites)
 * 2. Страницы (new)
 * 3. АгентыОрганизации (new)
 * 4. НастройкиИнтерфейса (new)
 * 5. ШаблоныОрганизации (new)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  serverURL: process.env.INTEGRAM_SERVER_URL || 'https://dronedoc.ru',
  database: process.env.INTEGRAM_DATABASE || 'a2025',
  login: process.env.INTEGRAM_LOGIN || 'd',
  password: process.env.INTEGRAM_PASSWORD || 'd'
};

// Requisite type IDs (from Integram)
const REQUISITE_TYPES = {
  SHORT: 3,      // Short text (< 255 chars)
  LONG: 2,       // Long text (> 255 chars)
  NUMBER: 13,    // Numeric value
  DATETIME: 4,   // Date and time
  BOOL: 7,       // Boolean
  REFERENCE: 8   // Reference to another type
};

/**
 * Main setup function
 */
async function main() {
  console.log('🚀 Setting up Unified Interface Management Tables in Integram\n');
  console.log(`Server: ${CONFIG.serverURL}`);
  console.log(`Database: ${CONFIG.database}\n`);

  // Initialize MCP client
  const serverScriptPath = path.join(__dirname, '../src/services/mcp/integram-server.js');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverScriptPath],
  });

  const client = new Client(
    { name: 'unified-interface-setup', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  try {
    // Connect
    console.log('📡 Connecting to Integram MCP Server...');
    await client.connect(transport);
    console.log('✅ Connected!\n');

    // Authenticate
    console.log('🔐 Authenticating...');
    const authResult = await client.callTool({
      name: 'integram_authenticate',
      arguments: {
        serverURL: CONFIG.serverURL,
        database: CONFIG.database,
        login: CONFIG.login,
        password: CONFIG.password
      }
    });

    const authData = JSON.parse(authResult.content[0].text);
    if (!authData.success) {
      throw new Error('Authentication failed: ' + authData.error);
    }
    console.log('✅ Authenticated!\n');

    // Step 1: Check if БоковоеМеню (2385) exists and has requisites
    console.log('📋 Step 1: Checking БоковоеМеню table (ID: 2385)...');
    await setupSidebarMenuTable(client);

    // Step 2: Create Страницы table
    console.log('\n📋 Step 2: Creating Страницы table...');
    await createPagesTable(client);

    // Step 3: Create АгентыОрганизации table
    console.log('\n📋 Step 3: Creating АгентыОрганизации table...');
    await createOrgAgentsTable(client);

    // Step 4: Create НастройкиИнтерфейса table
    console.log('\n📋 Step 4: Creating НастройкиИнтерфейса table...');
    await createUISettingsTable(client);

    // Step 5: Create ШаблоныОрганизации table
    console.log('\n📋 Step 5: Creating ШаблоныОрганизации table...');
    await createTemplatesTable(client);

    console.log('\n\n✅ All tables created successfully!');
    console.log('\n📊 Summary:');
    console.log('  - БоковоеМеню: Updated with requisites');
    console.log('  - Страницы: Created');
    console.log('  - АгентыОрганизации: Created');
    console.log('  - НастройкиИнтерфейса: Created');
    console.log('  - ШаблоныОрганизации: Created');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await client.close();
  }
}

/**
 * Setup БоковоеМеню table (add requisites to existing table)
 */
async function setupSidebarMenuTable(client) {
  const typeId = 2385;

  // Get current metadata
  const metadataResult = await client.callTool({
    name: 'integram_get_type_metadata',
    arguments: { typeId }
  });

  const metadata = JSON.parse(metadataResult.content[0].text);
  console.log(`  Found table: ${metadata.name || 'БоковоеМеню'}`);
  console.log(`  Current requisites: ${metadata.requisites?.length || 0}`);

  // Define required requisites
  const requiredRequisites = [
    { name: 'Название', type: REQUISITE_TYPES.SHORT },
    { name: 'Маршрут', type: REQUISITE_TYPES.SHORT },
    { name: 'Иконка', type: REQUISITE_TYPES.SHORT },
    { name: 'Порядок', type: REQUISITE_TYPES.NUMBER },
    { name: 'РодительМеню', type: REQUISITE_TYPES.REFERENCE },
    { name: 'ВидимостьДляРоли', type: REQUISITE_TYPES.SHORT },
    { name: 'Активно', type: REQUISITE_TYPES.BOOL }
  ];

  // Check which requisites exist
  const existingNames = new Set(
    (metadata.requisites || []).map(r => r.alias || r.name)
  );

  // Add missing requisites
  for (const req of requiredRequisites) {
    if (!existingNames.has(req.name)) {
      console.log(`  Adding requisite: ${req.name}`);

      const addResult = await client.callTool({
        name: 'integram_add_requisite',
        arguments: {
          typeId,
          requisiteTypeId: req.type
        }
      });

      const addData = JSON.parse(addResult.content[0].text);
      if (!addData.id) {
        console.warn(`    ⚠️  Failed to add requisite ${req.name}`);
        continue;
      }

      // Set alias
      await client.callTool({
        name: 'integram_save_requisite_alias',
        arguments: {
          requisiteId: addData.id,
          alias: req.name
        }
      });

      console.log(`    ✅ Added: ${req.name}`);
    } else {
      console.log(`    ✓ Already exists: ${req.name}`);
    }
  }
}

/**
 * Create Страницы table
 */
async function createPagesTable(client) {
  // Create type
  const createResult = await client.callTool({
    name: 'integram_create_type',
    arguments: {
      name: 'Страницы',
      baseTypeId: 1,  // Independent type
      unique: false
    }
  });

  const createData = JSON.parse(createResult.content[0].text);
  const typeId = createData.id;
  console.log(`  Created table ID: ${typeId}`);

  // Add requisites
  const requisites = [
    { name: 'Название', type: REQUISITE_TYPES.SHORT },
    { name: 'Маршрут', type: REQUISITE_TYPES.SHORT },
    { name: 'Содержание', type: REQUISITE_TYPES.LONG },
    { name: 'Тип', type: REQUISITE_TYPES.SHORT },
    { name: 'Иконка', type: REQUISITE_TYPES.SHORT },
    { name: 'Обложка', type: REQUISITE_TYPES.SHORT },
    { name: 'ДатаСоздания', type: REQUISITE_TYPES.DATETIME },
    { name: 'ДатаИзменения', type: REQUISITE_TYPES.DATETIME },
    { name: 'Автор', type: REQUISITE_TYPES.NUMBER },
    { name: 'Опубликовано', type: REQUISITE_TYPES.BOOL }
  ];

  for (const req of requisites) {
    console.log(`  Adding requisite: ${req.name}`);

    const addResult = await client.callTool({
      name: 'integram_add_requisite',
      arguments: {
        typeId,
        requisiteTypeId: req.type
      }
    });

    const addData = JSON.parse(addResult.content[0].text);

    // Set alias
    await client.callTool({
      name: 'integram_save_requisite_alias',
      arguments: {
        requisiteId: addData.id,
        alias: req.name
      }
    });

    console.log(`    ✅ Added: ${req.name}`);
  }

  // Verify
  const metadata = await client.callTool({
    name: 'integram_get_type_metadata',
    arguments: { typeId }
  });
  const meta = JSON.parse(metadata.content[0].text);
  console.log(`  ✅ Created with ${meta.requisites?.length || 0} requisites`);
}

/**
 * Create АгентыОрганизации table
 */
async function createOrgAgentsTable(client) {
  // Create type
  const createResult = await client.callTool({
    name: 'integram_create_type',
    arguments: {
      name: 'АгентыОрганизации',
      baseTypeId: 1,
      unique: false
    }
  });

  const createData = JSON.parse(createResult.content[0].text);
  const typeId = createData.id;
  console.log(`  Created table ID: ${typeId}`);

  // Add requisites
  const requisites = [
    { name: 'Название', type: REQUISITE_TYPES.SHORT },
    { name: 'ШаблонАгента', type: REQUISITE_TYPES.REFERENCE },
    { name: 'Конфигурация', type: REQUISITE_TYPES.LONG },
    { name: 'Статус', type: REQUISITE_TYPES.SHORT },
    { name: 'ДатаСоздания', type: REQUISITE_TYPES.DATETIME },
    { name: 'Владелец', type: REQUISITE_TYPES.NUMBER }
  ];

  for (const req of requisites) {
    console.log(`  Adding requisite: ${req.name}`);

    const addResult = await client.callTool({
      name: 'integram_add_requisite',
      arguments: {
        typeId,
        requisiteTypeId: req.type
      }
    });

    const addData = JSON.parse(addResult.content[0].text);

    await client.callTool({
      name: 'integram_save_requisite_alias',
      arguments: {
        requisiteId: addData.id,
        alias: req.name
      }
    });

    console.log(`    ✅ Added: ${req.name}`);
  }

  const metadata = await client.callTool({
    name: 'integram_get_type_metadata',
    arguments: { typeId }
  });
  const meta = JSON.parse(metadata.content[0].text);
  console.log(`  ✅ Created with ${meta.requisites?.length || 0} requisites`);
}

/**
 * Create НастройкиИнтерфейса table
 */
async function createUISettingsTable(client) {
  // Create type
  const createResult = await client.callTool({
    name: 'integram_create_type',
    arguments: {
      name: 'НастройкиИнтерфейса',
      baseTypeId: 1,
      unique: false
    }
  });

  const createData = JSON.parse(createResult.content[0].text);
  const typeId = createData.id;
  console.log(`  Created table ID: ${typeId}`);

  // Add requisites
  const requisites = [
    { name: 'Ключ', type: REQUISITE_TYPES.SHORT },
    { name: 'Значение', type: REQUISITE_TYPES.LONG },
    { name: 'Тип', type: REQUISITE_TYPES.SHORT },
    { name: 'ДатаИзменения', type: REQUISITE_TYPES.DATETIME }
  ];

  for (const req of requisites) {
    console.log(`  Adding requisite: ${req.name}`);

    const addResult = await client.callTool({
      name: 'integram_add_requisite',
      arguments: {
        typeId,
        requisiteTypeId: req.type
      }
    });

    const addData = JSON.parse(addResult.content[0].text);

    await client.callTool({
      name: 'integram_save_requisite_alias',
      arguments: {
        requisiteId: addData.id,
        alias: req.name
      }
    });

    console.log(`    ✅ Added: ${req.name}`);
  }

  const metadata = await client.callTool({
    name: 'integram_get_type_metadata',
    arguments: { typeId }
  });
  const meta = JSON.parse(metadata.content[0].text);
  console.log(`  ✅ Created with ${meta.requisites?.length || 0} requisites`);
}

/**
 * Create ШаблоныОрганизации table
 */
async function createTemplatesTable(client) {
  // Create type
  const createResult = await client.callTool({
    name: 'integram_create_type',
    arguments: {
      name: 'ШаблоныОрганизации',
      baseTypeId: 1,
      unique: false
    }
  });

  const createData = JSON.parse(createResult.content[0].text);
  const typeId = createData.id;
  console.log(`  Created table ID: ${typeId}`);

  // Add requisites
  const requisites = [
    { name: 'Название', type: REQUISITE_TYPES.SHORT },
    { name: 'Описание', type: REQUISITE_TYPES.LONG },
    { name: 'Иконка', type: REQUISITE_TYPES.SHORT },
    { name: 'Меню', type: REQUISITE_TYPES.LONG },
    { name: 'Страницы', type: REQUISITE_TYPES.LONG },
    { name: 'Агенты', type: REQUISITE_TYPES.LONG },
    { name: 'Настройки', type: REQUISITE_TYPES.LONG },
    { name: 'Тип', type: REQUISITE_TYPES.SHORT }
  ];

  for (const req of requisites) {
    console.log(`  Adding requisite: ${req.name}`);

    const addResult = await client.callTool({
      name: 'integram_add_requisite',
      arguments: {
        typeId,
        requisiteTypeId: req.type
      }
    });

    const addData = JSON.parse(addResult.content[0].text);

    await client.callTool({
      name: 'integram_save_requisite_alias',
      arguments: {
        requisiteId: addData.id,
        alias: req.name
      }
    });

    console.log(`    ✅ Added: ${req.name}`);
  }

  const metadata = await client.callTool({
    name: 'integram_get_type_metadata',
    arguments: { typeId }
  });
  const meta = JSON.parse(metadata.content[0].text);
  console.log(`  ✅ Created with ${meta.requisites?.length || 0} requisites`);
}

// Run
main().catch(console.error);
