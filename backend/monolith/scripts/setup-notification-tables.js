#!/usr/bin/env node
/**
 * Setup Integram tables for notification system
 *
 * This script creates the necessary tables (types) and fields (requisites)
 * in the Integram database for the notification system.
 *
 * Usage: node scripts/setup-notification-tables.js
 */

const IntegramMCPClient = require('../src/services/mcp/IntegramMCPClient')

// Configuration
const CONFIG = {
  serverURL: process.env.INTEGRAM_SERVER_URL || process.env.INTEGRAM_SERVER_URL || 'https://example.integram.io',
  database: process.env.INTEGRAM_DATABASE || 'my',
  login: process.env.INTEGRAM_LOGIN || 'd',
  password: process.env.INTEGRAM_PASSWORD || 'd'
}

// Requisite type IDs (from Integram)
const REQUISITE_TYPES = {
  SHORT: 3,   // Short text (< 255 chars)
  LONG: 2,    // Long text (> 255 chars)
  NUMBER: 13, // Numeric value
  DATETIME: 4, // Date and time
  BOOL: 7     // Boolean
}

/**
 * Main setup function
 */
async function main() {
  console.log('🚀 Starting notification system setup in Integram...')
  console.log(`Server: ${CONFIG.serverURL}`)
  console.log(`Database: ${CONFIG.database}`)
  console.log(`Login: ${CONFIG.login}`)

  const client = new IntegramMCPClient({
    serverURL: CONFIG.serverURL,
    database: CONFIG.database
  })

  try {
    // Step 1: Authenticate
    console.log('\n📝 Step 1: Authenticating...')
    await client.authenticate(CONFIG.login, CONFIG.password)
    console.log('✅ Authenticated successfully')
    console.log(`User ID: ${client.userId}`)
    console.log(`User Name: ${client.userName}`)

    // Check if tables already exist
    console.log('\n🔍 Checking for existing tables...')
    // This would require getDictionary() - we'll need to add this to IntegramMCPClient
    // For now, we'll proceed with creation and handle errors

    // Step 2: Create "Уведомления" (Notifications) type
    console.log('\n📋 Step 2: Creating "Уведомления" (Notifications) table...')
    // Note: We can't use createType directly from IntegramMCPClient
    // We'll need to make HTTP calls manually or extend the client

    console.log('\n⚠️  NOTICE: This script requires additional MCP functions not yet in IntegramMCPClient')
    console.log('The following functions need to be added to IntegramMCPClient:')
    console.log('  - getDictionary()')
    console.log('  - createType(name, baseTypeId, unique)')
    console.log('  - addRequisite(typeId, requisiteTypeId)')
    console.log('  - saveRequisiteAlias(requisiteId, alias)')
    console.log('  - getTypeMetadata(typeId)')
    console.log('')
    console.log('Please use the Integram web interface or MCP server directly to create tables.')
    console.log('See docs/NOTIFICATION_INTEGRAM_SCHEMA.md for the complete schema design.')

    process.exit(1)
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error)
}

module.exports = { main }
