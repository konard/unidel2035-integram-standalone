#!/usr/bin/env node

/**
 * Generate strong JWT secret
 *
 * Usage: node scripts/generate-jwt-secret.js
 *
 * This script generates a cryptographically secure random secret
 * suitable for JWT signing (256 bits / 32 bytes).
 */

import crypto from 'crypto'

console.log('\n🔐 Generating JWT Secret...\n')

// Generate 256-bit (32 bytes) random secret
const secret = crypto.randomBytes(32).toString('hex')

console.log('Your new JWT_SECRET (copy this to .env file):')
console.log('─'.repeat(70))
console.log(secret)
console.log('─'.repeat(70))

console.log('\n✅ Secret generated successfully!')
console.log('\n📝 Add this to your .env file:')
console.log(`JWT_SECRET=${secret}`)

console.log('\n⚠️  IMPORTANT:')
console.log('  1. Keep this secret safe and never commit it to git')
console.log('  2. Use different secrets for development and production')
console.log('  3. Rotate secrets regularly (every 3-6 months)')
console.log('  4. If compromised, generate a new secret immediately')
console.log('')

// Also generate SESSION_SECRET
const sessionSecret = crypto.randomBytes(32).toString('hex')
console.log('📝 Also add this SESSION_SECRET to your .env file:')
console.log(`SESSION_SECRET=${sessionSecret}`)
console.log('')
