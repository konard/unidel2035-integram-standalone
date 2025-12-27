#!/usr/bin/env node

/**
 * Environment Variables Verification Script
 * Simplified version without PostgreSQL dependency
 */

import '../src/config/env.js'

// Required environment variables for Integram API backend
const REQUIRED_VARS = [
  'PORT',
  'NODE_ENV'
]

// Optional but recommended variables
const OPTIONAL_VARS = [
  'INTEGRAM_BASE_URL',
  'INTEGRAM_URL',
  'INTEGRAM_DEFAULT_DB',
  'INTEGRAM_SYSTEM_USERNAME',
  'INTEGRAM_SYSTEM_PASSWORD',
  'OPENAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'ANTHROPIC_API_KEY'
]

console.log('\n✅ Environment verification for Integram Standalone Backend\n')

// Check required variables
let allRequiredSet = true
for (const varName of REQUIRED_VARS) {
  const value = process.env[varName]
  const isSet = value && value !== 'undefined' && value !== 'null'
  const status = isSet ? '✓' : '✗'
  const display = isSet ? value : 'NOT SET'

  console.log(`${status} ${varName.padEnd(25)} = ${display}`)

  if (!isSet) allRequiredSet = false
}

console.log()

// Check optional variables
for (const varName of OPTIONAL_VARS) {
  const value = process.env[varName]
  const isSet = value && value !== 'undefined' && value !== 'null'
  const status = isSet ? '✓' : '○'
  const display = isSet
    ? (varName.includes('KEY') || varName.includes('PASSWORD')
        ? '***' + value.slice(-4)
        : value)
    : 'not set'

  console.log(`${status} ${varName.padEnd(25)} = ${display}`)
}

console.log()

if (!allRequiredSet) {
  console.log('❌ ERROR: Some required environment variables are missing!')
  console.log()
  process.exit(1)
}

console.log('✅ Environment verification complete - server is ready to start!')
console.log()
