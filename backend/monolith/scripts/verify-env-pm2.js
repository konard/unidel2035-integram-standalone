#!/usr/bin/env node

/**
 * Lightweight Environment Variables Verification Script for PM2 Deployment
 * Issue #1917: PM2-friendly environment check that doesn't fail on missing DB
 *
 * This script validates environment configuration without requiring database connection
 * It's designed to run before PM2 starts the backend
 *
 * Usage: node scripts/verify-env-pm2.js
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

// Try to load .env file manually if it exists (without dotenv dependency)
const envPath = join(rootDir, '.env')
if (existsSync(envPath)) {
  try {
    const envContent = readFileSync(envPath, 'utf8')
    const lines = envContent.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=')
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '')
          if (!process.env[key]) {
            process.env[key] = value
          }
        }
      }
    }
    // console.log('✓ Loaded .env file from:', envPath)
  } catch (err) {
    // console.log('⚠ Could not read .env file:', err.message)
  }
} else {
  // console.log('⚠ No .env file found at:', envPath)
  // console.log('  Using environment variables from shell or PM2 config')
}

// console.log('\n╔═══════════════════════════════════════════════════════════════════╗')
// console.log('║ DronDoc Backend - PM2 Environment Verification (Issue #1917)      ║')
// console.log('╚═══════════════════════════════════════════════════════════════════╝\n')

// console.log('Current Working Directory:', process.cwd())
// console.log('Script Location:', __dirname)
// console.log('Backend Root:', rootDir)
// console.log('NODE_ENV:', process.env.NODE_ENV || 'not set (defaults to development)')
// console.log('PORT:', process.env.PORT || '8081 (default)')
// console.log()

// Critical environment variables (must be set)
const CRITICAL_VARS = []

// Optional database variables (warn if not set, but don't fail)
const DATABASE_VARS = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD'
]

// Optional but recommended variables
const OPTIONAL_VARS = [
  'OPENAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'ANTHROPIC_API_KEY',
  'REDIS_ENABLED',
  'CORS_ORIGIN'
]

let hasErrors = false
let hasWarnings = false

// Check critical variables
if (CRITICAL_VARS.length > 0) {
  // console.log('🔴 Critical Environment Variables (required):')
  // console.log('─'.repeat(70))

  for (const varName of CRITICAL_VARS) {
    const value = process.env[varName]
    const isSet = value && value !== 'undefined' && value !== 'null'
    const status = isSet ? '✓' : '✗'
    const display = isSet ? (varName.includes('KEY') || varName.includes('PASSWORD') ? '***' + value.slice(-4) : value) : 'NOT SET'

    // console.log(`${status} ${varName.padEnd(20)} = ${display}`)

    if (!isSet) {
      hasErrors = true
    }
  }
  // console.log()
} else {
  // console.log('✓ No critical environment variables required')
  // console.log()
}

// Check database variables
// console.log('🗄️  Database Configuration (optional):')
// console.log('─'.repeat(70))

let dbConfigured = true
for (const varName of DATABASE_VARS) {
  const value = process.env[varName]
  const isSet = value && value !== 'undefined' && value !== 'null'
  const status = isSet ? '✓' : '○'
  const display = isSet
    ? (varName === 'DB_PASSWORD' ? '***' + value.slice(-4) : value)
    : 'not set'

  // console.log(`${status} ${varName.padEnd(20)} = ${display}`)

  if (!isSet) {
    dbConfigured = false
  }
}

if (!dbConfigured) {
  // console.log()
  // console.log('⚠ Database not fully configured - backend will run in degraded mode')
  // console.log('  Database-dependent features (health monitoring, self-healing) will be disabled')
  hasWarnings = true
}

// console.log()

// Check optional variables
// console.log('🔧 Optional Configuration:')
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

  // console.log(`${status} ${varName.padEnd(20)} = ${display}`)
}

// console.log()

// Check Redis configuration
const redisEnabled = process.env.REDIS_ENABLED !== 'false'
// console.log('🔄 Redis Configuration:')
// console.log('─'.repeat(70))
// console.log(`${redisEnabled ? '✓' : '○'} REDIS_ENABLED       = ${process.env.REDIS_ENABLED || 'true (default)'}`)

if (redisEnabled) {
  // console.log()
  // console.log('⚠ Redis is ENABLED but may cause crash loops if Redis is not running!')
  // console.log('  If you see continuous restarts in PM2:')
  // console.log('  1. Set REDIS_ENABLED=false in .env or ecosystem.config.cjs')
  // console.log('  2. Or ensure Redis is installed and running: systemctl start redis')
  hasWarnings = true
}

// console.log()

// Check package.json exists
// console.log('📦 Package Configuration:')
// console.log('─'.repeat(70))

const packageJsonPath = join(rootDir, 'package.json')
if (existsSync(packageJsonPath)) {
  // console.log('✓ package.json found at:', packageJsonPath)
} else {
  // console.log('✗ package.json NOT FOUND at:', packageJsonPath)
  // console.log('  This will cause PM2 to fail!')
  hasErrors = true
}

const indexJsPath = join(rootDir, 'src', 'index.js')
if (existsSync(indexJsPath)) {
  // console.log('✓ src/index.js found at:', indexJsPath)
} else {
  // console.log('✗ src/index.js NOT FOUND at:', indexJsPath)
  hasErrors = true
}

// console.log()

// Final summary
// console.log('╔═══════════════════════════════════════════════════════════════════╗')
if (hasErrors) {
  // console.log('║ ✗ ERRORS DETECTED - Cannot start backend!                         ║')
  // console.log('╚═══════════════════════════════════════════════════════════════════╝')
  // console.log()
  // console.log('Please fix the errors above before starting the backend.')
  // console.log()
  process.exit(1)
} else if (hasWarnings) {
  // console.log('║ ⚠ WARNINGS DETECTED - Backend can start but with reduced features ║')
  // console.log('╚═══════════════════════════════════════════════════════════════════╝')
  // console.log()
  // console.log('✓ Backend can start, but some features may be disabled')
  // console.log('  Review warnings above and configure as needed')
  // console.log()
  process.exit(0)
} else {
  // console.log('║ ✓ All checks passed - Backend is ready to start!                  ║')
  // console.log('╚═══════════════════════════════════════════════════════════════════╝')
  // console.log()
  // console.log('To start with PM2:')
  // console.log('  pm2 start ecosystem.config.cjs --env production')
  // console.log('  pm2 logs dronedoc-monolith')
  // console.log()
  process.exit(0)
}
