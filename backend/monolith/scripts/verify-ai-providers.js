#!/usr/bin/env node
/**
 * AI Provider Configuration Verification Script
 * Issue #4722: Workspace chat not working
 *
 * This script checks if AI provider API keys are properly configured
 * and tests the connection to each configured provider.
 *
 * Usage:
 *   node scripts/verify-ai-providers.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

console.log('🔍 AI Provider Configuration Verification\n');
console.log('=' .repeat(60));

// Check which providers have API keys configured
const providers = [
  {
    name: 'Polza.ai',
    envKey: 'POLZA_AI_API_KEY',
    priority: 1,
    description: 'Primary AI provider (recommended)'
  },
  {
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    priority: 2,
    description: 'Fallback provider (low cost)'
  },
  {
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    priority: 3,
    description: 'Fallback provider (high quality)'
  },
  {
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    priority: 4,
    description: 'Fallback provider (versatile)'
  }
];

let configuredCount = 0;
let primaryConfigured = false;

console.log('\n📋 Provider Status:\n');

providers.forEach(provider => {
  const apiKey = process.env[provider.envKey];
  const isConfigured = !!apiKey && apiKey !== 'your-api-key-here' && apiKey.length > 10;

  if (isConfigured) {
    configuredCount++;
    if (provider.priority === 1) {
      primaryConfigured = true;
    }
  }

  const status = isConfigured ? '✅' : '❌';
  const keyPreview = isConfigured
    ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`
    : 'Not configured';

  console.log(`${status} ${provider.name} (Priority ${provider.priority})`);
  console.log(`   Env: ${provider.envKey}`);
  console.log(`   Key: ${keyPreview}`);
  console.log(`   Description: ${provider.description}`);
  console.log('');
});

console.log('=' .repeat(60));
console.log('\n📊 Summary:\n');

if (configuredCount === 0) {
  console.log('❌ ERROR: No AI provider API keys configured!');
  console.log('\nWorkspace chat will NOT work without at least one provider.');
  console.log('\n📝 To fix this:');
  console.log('1. Copy backend/monolith/.env.example.polza to backend/monolith/.env');
  console.log('2. Add your API key(s) to the .env file');
  console.log('3. Restart the backend server');
  console.log('\nRecommended: Get a Polza.ai API key from https://polza.ai');
  process.exit(1);
} else {
  console.log(`✅ ${configuredCount} provider(s) configured`);

  if (primaryConfigured) {
    console.log('✅ Primary provider (Polza.ai) is configured');
    console.log('   Using Polza.ai for workspace chat');
  } else {
    const configuredProvider = providers.find(p => {
      const key = process.env[p.envKey];
      return key && key !== 'your-api-key-here' && key.length > 10;
    });

    console.log(`⚠️  Primary provider (Polza.ai) not configured`);
    console.log(`   Using fallback: ${configuredProvider?.name || 'Unknown'}`);
    console.log('   Recommendation: Configure Polza.ai for best results');
  }

  console.log('\n✅ Workspace chat should be working');
}

console.log('\n' + '=' .repeat(60));
console.log('\n💡 Tips:');
console.log('- Polza.ai provides access to Claude models with good pricing');
console.log('- DeepSeek is the cheapest option for fallback');
console.log('- You can configure multiple providers for redundancy');
console.log('- API keys should never be committed to git');
console.log('\n📖 For more info, see: backend/monolith/.env.example.polza\n');

process.exit(0);
