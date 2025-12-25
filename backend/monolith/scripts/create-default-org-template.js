#!/usr/bin/env node

/**
 * Create Default Organization Template
 *
 * Issue #3559 - Управление единым интерфейсом
 *
 * This script creates a default organization template with:
 * - Pre-configured sidebar menu
 * - Sample pages
 * - Default UI settings
 *
 * The template can be applied to new organizations for quick setup.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  serverURL: process.env.INTEGRAM_SERVER_URL || process.env.INTEGRAM_SERVER_URL || 'https://example.integram.io',
  database: process.env.INTEGRAM_DATABASE || 'a2025',
  login: process.env.INTEGRAM_LOGIN || 'd',
  password: process.env.INTEGRAM_PASSWORD || 'd'
};

// Default template data
const DEFAULT_TEMPLATE = {
  name: 'Типовая организация',
  description: 'Стандартный шаблон для быстрого старта организации',
  icon: '🏢',
  type: 'default',
  menu: [
    { name: 'Главная', route: '/', icon: '🏠', order: 1, visibleForRole: 'all', active: true },
    { name: 'Документы', route: '/documents', icon: '📄', order: 2, visibleForRole: 'all', active: true },
    { name: 'Агенты', route: '/agents', icon: '🤖', order: 3, visibleForRole: 'admin', active: true },
    { name: 'Аналитика', route: '/analytics', icon: '📊', order: 4, visibleForRole: 'member', active: true },
    { name: 'Команда', route: '/team', icon: '👥', order: 5, visibleForRole: 'all', active: true },
    { name: 'Настройки', route: '/settings', icon: '⚙️', order: 6, visibleForRole: 'admin', active: true }
  ],
  pages: [
    {
      title: 'Главная страница',
      route: '/',
      type: 'dashboard',
      icon: '🏠',
      content: '# Добро пожаловать в вашу организацию!\n\nЭто главная страница вашей организации.',
      published: true
    },
    {
      title: 'О компании',
      route: '/about',
      type: 'document',
      icon: '📋',
      content: '# О нашей компании\n\nЗдесь вы можете разместить информацию о вашей организации.',
      published: true
    },
    {
      title: 'Документация',
      route: '/docs',
      type: 'document',
      icon: '📚',
      content: '# Документация\n\nЗдесь будет размещена документация для сотрудников.',
      published: true
    }
  ],
  agents: [],
  settings: {
    theme: 'light',
    primaryColor: '#3B82F6',
    showSidebar: true,
    enableNotifications: true,
    language: 'ru'
  }
};

/**
 * Main function
 */
async function main() {
  console.log('🚀 Creating Default Organization Template\n');

  // Initialize MCP client
  const serverScriptPath = path.join(__dirname, '../src/services/mcp/integram-server.js');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverScriptPath],
  });

  const client = new Client(
    { name: 'create-default-template', version: '1.0.0' },
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
      throw new Error('Authentication failed');
    }
    console.log('✅ Authenticated!\n');

    // Get table IDs
    console.log('🔍 Getting table IDs...');
    const dictResult = await client.callTool({
      name: 'integram_get_dictionary',
      arguments: {}
    });

    const dict = JSON.parse(dictResult.content[0].text);
    const types = dict.types || [];

    const templatesTable = types.find(t => t.name === 'ШаблоныОрганизации');
    if (!templatesTable) {
      throw new Error('ШаблоныОрганизации table not found. Run setup-unified-interface-tables.js first.');
    }

    console.log(`✅ Found ШаблоныОрганизации table (ID: ${templatesTable.id})\n`);

    // Create template
    console.log('📝 Creating default template...');
    const templateResult = await client.callTool({
      name: 'integram_create_object',
      arguments: {
        typeId: templatesTable.id,
        value: DEFAULT_TEMPLATE.name,
        requisites: {
          'Название': DEFAULT_TEMPLATE.name,
          'Описание': DEFAULT_TEMPLATE.description,
          'Иконка': DEFAULT_TEMPLATE.icon,
          'Меню': JSON.stringify(DEFAULT_TEMPLATE.menu),
          'Страницы': JSON.stringify(DEFAULT_TEMPLATE.pages),
          'Агенты': JSON.stringify(DEFAULT_TEMPLATE.agents),
          'Настройки': JSON.stringify(DEFAULT_TEMPLATE.settings),
          'Тип': DEFAULT_TEMPLATE.type
        }
      }
    });

    const templateData = JSON.parse(templateResult.content[0].text);
    console.log(`✅ Template created with ID: ${templateData.id}\n`);

    console.log('📊 Template Summary:');
    console.log(`  - Name: ${DEFAULT_TEMPLATE.name}`);
    console.log(`  - Menu Items: ${DEFAULT_TEMPLATE.menu.length}`);
    console.log(`  - Pages: ${DEFAULT_TEMPLATE.pages.length}`);
    console.log(`  - Settings: ${Object.keys(DEFAULT_TEMPLATE.settings).length}`);
    console.log(`\n✅ Default organization template created successfully!`);

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

// Run
main().catch(console.error);
