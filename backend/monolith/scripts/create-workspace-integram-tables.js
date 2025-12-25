/**
 * Create Workspace Storage Tables in Integram
 * Issue #4828: Move workspace and session settings from JSON/RAM to Integram database
 *
 * This script creates two tables in Integram database:
 * 1. Workspaces - stores workspace metadata and configuration
 * 2. WorkspaceSessions - stores chat session data
 *
 * Run with: node backend/monolith/scripts/create-workspace-integram-tables.js
 */

import IntegramMCPClient from '../src/services/mcp/IntegramMCPClient.js';
import logger from '../src/utils/logger.js';

// Configuration
const INTEGRAM_SERVER = process.env.INTEGRAM_SERVER || 'https://dronedoc.ru';
const INTEGRAM_DATABASE = process.env.INTEGRAM_DATABASE || 'my';
const INTEGRAM_LOGIN = process.env.INTEGRAM_LOGIN || 'd';
const INTEGRAM_PASSWORD = process.env.INTEGRAM_PASSWORD || 'd';

// Table definitions following Role-Sets paradigm
const TABLES = {
  workspaces: {
    name: 'Workspaces',
    baseTypeId: 1, // Independent type
    unique: false,
    requisites: [
      { name: 'workspace_id', type: 3, description: 'Workspace UUID (SHORT text)' },
      { name: 'name', type: 3, description: 'Workspace display name (SHORT text)' },
      { name: 'user_id', type: 3, description: 'Owner user ID (SHORT text)' },
      { name: 'integram_server', type: 3, description: 'Integram server URL (SHORT text)' },
      { name: 'path', type: 3, description: 'Filesystem path (SHORT text)' },
      { name: 'repository_url', type: 3, description: 'Git repository URL (SHORT text)' },
      { name: 'repository_branch', type: 3, description: 'Git branch (SHORT text)' },
      { name: 'repository_commit', type: 3, description: 'Latest commit hash (SHORT text)' },
      { name: 'repository_file_count', type: 13, description: 'Repository file count (NUMBER)' },
      { name: 'repository_size_bytes', type: 13, description: 'Repository size in bytes (NUMBER)' },
      { name: 'created_at', type: 4, description: 'Creation timestamp (DATETIME)' },
      { name: 'last_activity', type: 4, description: 'Last activity timestamp (DATETIME)' },
      { name: 'allow_read', type: 7, description: 'Allow read operations (BOOL)' },
      { name: 'allow_write', type: 7, description: 'Allow write operations (BOOL)' },
      { name: 'allow_bash', type: 7, description: 'Allow bash execution (BOOL)' },
      { name: 'allow_web_fetch', type: 7, description: 'Allow web fetch (BOOL)' },
      { name: 'allow_glob', type: 7, description: 'Allow glob operations (BOOL)' },
      { name: 'allow_grep', type: 7, description: 'Allow grep operations (BOOL)' },
      { name: 'restricted_paths', type: 2, description: 'JSON array of restricted paths (LONG text)' },
      { name: 'files_created', type: 13, description: 'Files created count (NUMBER)' },
      { name: 'files_modified', type: 13, description: 'Files modified count (NUMBER)' },
      { name: 'files_deleted', type: 13, description: 'Files deleted count (NUMBER)' },
      { name: 'commands_executed', type: 13, description: 'Commands executed count (NUMBER)' },
      { name: 'size_bytes', type: 13, description: 'Workspace size in bytes (NUMBER)' }
    ]
  },
  sessions: {
    name: 'WorkspaceSessions',
    baseTypeId: 1, // Independent type
    unique: false,
    requisites: [
      { name: 'workspace_id', type: 3, description: 'Workspace UUID (SHORT text)' },
      { name: 'file_path', type: 3, description: 'File path within workspace (SHORT text)' },
      { name: 'session_id', type: 3, description: 'Polza.ai session ID (SHORT text)' },
      { name: 'created_at', type: 4, description: 'Session creation timestamp (DATETIME)' },
      { name: 'last_used', type: 4, description: 'Last usage timestamp (DATETIME)' },
      { name: 'message_count', type: 13, description: 'Number of messages (NUMBER)' }
    ]
  }
};

/**
 * Main execution
 */
async function main() {
  logger.info({ server: INTEGRAM_SERVER, database: INTEGRAM_DATABASE }, '🚀 Starting Integram table creation');

  const client = new IntegramMCPClient({
    serverURL: INTEGRAM_SERVER,
    database: INTEGRAM_DATABASE
  });

  try {
    // Step 1: Authenticate
    logger.info('🔐 Authenticating with Integram...');
    await client.authenticate(INTEGRAM_LOGIN, INTEGRAM_PASSWORD);
    logger.info({ userId: client.userId, userName: client.userName }, '✅ Authentication successful');

    // Step 2: Check existing types
    logger.info('🔍 Checking for existing tables...');
    const dictionary = await client.getDictionary();
    const existingTypes = dictionary.types || [];

    logger.info({ count: existingTypes.length }, 'Existing types found');

    // Check if our tables already exist
    const workspacesTable = existingTypes.find(t => t.name === TABLES.workspaces.name);
    const sessionsTable = existingTypes.find(t => t.name === TABLES.sessions.name);

    if (workspacesTable && sessionsTable) {
      logger.info({
        workspacesId: workspacesTable.id,
        sessionsId: sessionsTable.id
      }, '✅ Tables already exist - no action needed');

      logger.info('📋 Table IDs to use in code:');
      logger.info(`  WORKSPACES_TABLE_ID = ${workspacesTable.id}`);
      logger.info(`  SESSIONS_TABLE_ID = ${sessionsTable.id}`);

      return {
        workspacesTableId: workspacesTable.id,
        sessionsTableId: sessionsTable.id,
        created: false
      };
    }

    // Step 3: Create Workspaces table
    let workspacesTableId;
    if (!workspacesTable) {
      logger.info('📊 Creating Workspaces table...');
      workspacesTableId = await createTable(client, TABLES.workspaces);
      logger.info({ tableId: workspacesTableId }, '✅ Workspaces table created');
    } else {
      workspacesTableId = workspacesTable.id;
      logger.info({ tableId: workspacesTableId }, '✅ Workspaces table already exists');
    }

    // Step 4: Create WorkspaceSessions table
    let sessionsTableId;
    if (!sessionsTable) {
      logger.info('📊 Creating WorkspaceSessions table...');
      sessionsTableId = await createTable(client, TABLES.sessions);
      logger.info({ tableId: sessionsTableId }, '✅ WorkspaceSessions table created');
    } else {
      sessionsTableId = sessionsTable.id;
      logger.info({ tableId: sessionsTableId }, '✅ WorkspaceSessions table already exists');
    }

    // Step 5: Print summary
    logger.info('🎉 Table creation complete!');
    logger.info('');
    logger.info('📋 Table IDs to use in code:');
    logger.info(`  WORKSPACES_TABLE_ID = ${workspacesTableId}`);
    logger.info(`  SESSIONS_TABLE_ID = ${sessionsTableId}`);
    logger.info('');
    logger.info('🔧 Next steps:');
    logger.info('  1. Add these constants to backend/monolith/src/config/integram-requisites.js');
    logger.info('  2. Update WorkspaceService.js to use Integram instead of JSON/Map');
    logger.info('  3. Run migration script to move existing data');

    return {
      workspacesTableId,
      sessionsTableId,
      created: true
    };

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, '❌ Failed to create tables');
    throw error;
  }
}

/**
 * Create a table with all requisites following the correct process
 */
async function createTable(client, tableDef) {
  // Step 1: Create type (table)
  logger.info({ name: tableDef.name }, '📝 Creating type...');
  const typeResult = await client.createType({
    name: tableDef.name,
    baseTypeId: tableDef.baseTypeId,
    unique: tableDef.unique
  });

  const typeId = typeResult.id;
  logger.info({ typeId, name: tableDef.name }, '✅ Type created');

  // Step 2: Add requisites (columns)
  logger.info({ typeId, count: tableDef.requisites.length }, '📝 Adding requisites...');
  const requisiteIds = [];

  for (const req of tableDef.requisites) {
    logger.info({ name: req.name, type: req.type }, `  Adding requisite: ${req.name}`);

    const reqResult = await client.addRequisite({
      typeId,
      requisiteTypeId: req.type
    });

    requisiteIds.push({
      id: reqResult.id,
      name: req.name,
      type: req.type
    });

    logger.info({ requisiteId: reqResult.id, name: req.name }, `  ✅ Requisite added`);
  }

  // Step 3: Set requisite aliases (Russian names matching database structure)
  logger.info({ typeId, count: requisiteIds.length }, '🏷️  Setting requisite aliases...');

  for (const req of requisiteIds) {
    // Convert snake_case to Title Case for Russian aliases
    const alias = req.name.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    logger.info({ requisiteId: req.id, alias }, `  Setting alias: ${alias}`);

    await client.saveRequisiteAlias({
      requisiteId: req.id,
      alias
    });

    logger.info({ requisiteId: req.id, alias }, `  ✅ Alias set`);
  }

  // Step 4: Verify table structure
  logger.info({ typeId }, '🔍 Verifying table structure...');
  const metadata = await client.getTypeMetadata({ typeId });

  if (!metadata.requisites || metadata.requisites.length === 0) {
    throw new Error(`Table ${tableDef.name} created but has NO requisites! Verification failed.`);
  }

  if (metadata.requisites.length !== tableDef.requisites.length) {
    logger.warn({
      expected: tableDef.requisites.length,
      actual: metadata.requisites.length
    }, '⚠️ Requisite count mismatch!');
  }

  // Check for requisites without aliases
  const noAliasReqs = metadata.requisites.filter(r => !r.alias || r.alias.trim() === '');
  if (noAliasReqs.length > 0) {
    logger.warn({
      count: noAliasReqs.length,
      requisites: noAliasReqs.map(r => r.id)
    }, '⚠️ Some requisites have no aliases!');
  }

  logger.info({
    typeId,
    name: tableDef.name,
    requisiteCount: metadata.requisites.length,
    requisites: metadata.requisites.map(r => ({ id: r.id, alias: r.alias, type: r.requisite_type_id }))
  }, '✅ Table structure verified');

  return typeId;
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(result => {
      logger.info(result, '✅ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error({ error: error.message }, '❌ Script failed');
      process.exit(1);
    });
}

export default main;
