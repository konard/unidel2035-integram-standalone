#!/usr/bin/env node

/**
 * Environment Variables Verification Script
 * Run this before starting the server to ensure all required env vars are set
 *
 * Usage: node scripts/verify-env.js
 *
 * Issue #1405: Help diagnose PostgreSQL SCRAM authentication errors
 */

import '../src/config/env.js'
import { createDatabasePool, testDatabaseConnection } from '../src/config/database.js'

// Required environment variables
const REQUIRED_VARS = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD'
]

// Optional but recommended variables
const OPTIONAL_VARS = [
  'NODE_ENV',
  'PORT',
  'OPENAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'ANTHROPIC_API_KEY'
]

// console.log('\n╔═══════════════════════════════════════════════════════════════════╗')
// console.log('║ Integram Backend - Environment Variables Verification              ║')
// console.log('╚═══════════════════════════════════════════════════════════════════╝\n')

// console.log('Current Working Directory:', process.cwd())
// console.log('NODE_ENV:', process.env.NODE_ENV || 'not set (defaults to development)')
// console.log()

// Check required variables
// console.log('📋 Required Environment Variables:')
// console.log('─'.repeat(70))

let allRequiredSet = true
for (const varName of REQUIRED_VARS) {
  const value = process.env[varName]
  const isSet = value && value !== 'undefined' && value !== 'null'
  const status = isSet ? '✓' : '✗'
  const display = isSet ? (varName === 'DB_PASSWORD' ? '***' + value.slice(-4) : value) : 'NOT SET'

  // console.log(`${status} ${varName.padEnd(15)} = ${display}`)

  if (!isSet) allRequiredSet = false
}

// console.log()

// Check optional variables
// console.log('🔧 Optional Environment Variables:')
// console.log('─'.repeat(70))

for (const varName of OPTIONAL_VARS) {
  const value = process.env[varName]
  const isSet = value && value !== 'undefined' && value !== 'null'
  const status = isSet ? '✓' : '○'
  const display = isSet
    ? (varName.includes('KEY') || varName.includes('SECRET')
        ? '***' + value.slice(-4)
        : value)
    : 'not set'

  // console.log(`${status} ${varName.padEnd(15)} = ${display}`)
}

// console.log()

if (!allRequiredSet) {
  // console.log('❌ ERROR: Some required environment variables are missing!')
  // console.log()
  // console.log('To fix this:')
  // console.log('1. Create a .env file in backend/monolith/ directory')
  // console.log('2. Copy from .env.example: cp .env.example .env')
  // console.log('3. Edit .env and set the required values')
  // console.log('4. Run this script again to verify')
  // console.log()
  process.exit(1)
}

// console.log('✓ All required environment variables are set')
// console.log()

// Test database connection
// console.log('🗄️  Testing Database Connection:')
// console.log('─'.repeat(70))

try {
  const pool = createDatabasePool()
  const connected = await testDatabaseConnection(pool)

  if (connected) {
    // console.log('✓ Database connection successful!')

    // Test a query
    try {
      const result = await pool.query('SELECT COUNT(*) as count FROM ai_models')
      // console.log(`✓ Found ${result.rows[0].count} AI models in database`)
    } catch (err) {
      // console.log('⚠ Warning: Could not query ai_models table:', err.message)
      // console.log('  This is normal if the database schema is not initialized yet.')
    }
  } else {
    // console.log('✗ Database connection failed')
    process.exit(1)
  }

  await pool.end()

} catch (error) {
  // console.log('✗ Database connection error:', error.message)
  // console.log()
  // console.log('Common issues:')
  // console.log('1. PostgreSQL server is not running')
  // console.log('2. Database credentials are incorrect')
  // console.log('3. Database does not exist yet')
  // console.log('4. Firewall blocking connection')
  // console.log()
  process.exit(1)
}

// console.log()
// console.log('╔═══════════════════════════════════════════════════════════════════╗')
// console.log('║ ✓ Environment verification complete - server is ready to start!   ║')
// console.log('╚═══════════════════════════════════════════════════════════════════╝')
// console.log()
// console.log('To start the server:')
// console.log('  npm run dev    (development with auto-reload)')
// console.log('  npm start      (production)')
// console.log()
