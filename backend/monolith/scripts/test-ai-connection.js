#!/usr/bin/env node
/**
 * Test AI Provider Connection
 * Issue #4722: Workspace chat not working
 *
 * This script tests the connection to configured AI providers
 * to verify they are working correctly.
 *
 * Usage:
 *   node scripts/test-ai-connection.js [provider]
 *
 * Examples:
 *   node scripts/test-ai-connection.js polza
 *   node scripts/test-ai-connection.js deepseek
 *   node scripts/test-ai-connection.js  (tests all configured providers)
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const providerArg = process.argv[2]?.toLowerCase();

// Provider configurations
const providers = {
  polza: {
    name: 'Polza.ai',
    envKey: 'POLZA_AI_API_KEY',
    type: 'openai',
    baseURL: process.env.POLZA_BASE_URL || 'https://api.polza.ai/api/v1',
    model: process.env.DEFAULT_AI_MODEL || 'anthropic/claude-sonnet-4.5'
  },
  deepseek: {
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    type: 'openai',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat'
  },
  anthropic: {
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    type: 'anthropic',
    model: 'claude-sonnet-4-20250514'
  },
  openai: {
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    type: 'openai',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4'
  }
};

/**
 * Test a provider connection
 */
async function testProvider(providerKey, config) {
  const apiKey = process.env[config.envKey];

  if (!apiKey || apiKey === 'your-api-key-here' || apiKey.length < 10) {
    console.log(`⏭️  Skipping ${config.name} - not configured\n`);
    return { provider: config.name, status: 'skipped' };
  }

  console.log(`🧪 Testing ${config.name}...`);
  console.log(`   API Key: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);
  console.log(`   Model: ${config.model}`);

  try {
    const startTime = Date.now();
    let response;

    if (config.type === 'openai') {
      // OpenAI-compatible API (Polza, DeepSeek, OpenAI)
      const client = new OpenAI({
        apiKey,
        baseURL: config.baseURL
      });

      response = await client.chat.completions.create({
        model: config.model,
        messages: [{ role: 'user', content: 'Say "Hello from workspace chat test!"' }],
        max_tokens: 50,
        temperature: 0.2
      });

      const duration = Date.now() - startTime;
      const content = response.choices[0].message.content;

      console.log(`   ✅ Success! (${duration}ms)`);
      console.log(`   Response: "${content}"`);
      console.log(`   Tokens: ${response.usage?.total_tokens || 'N/A'}`);
      console.log('');

      return {
        provider: config.name,
        status: 'success',
        duration,
        content,
        tokens: response.usage
      };
    } else if (config.type === 'anthropic') {
      // Anthropic API
      const client = new Anthropic({ apiKey });

      response = await client.messages.create({
        model: config.model,
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say "Hello from workspace chat test!"' }]
      });

      const duration = Date.now() - startTime;
      const content = response.content[0].text;

      console.log(`   ✅ Success! (${duration}ms)`);
      console.log(`   Response: "${content}"`);
      console.log(`   Tokens: input=${response.usage.input_tokens}, output=${response.usage.output_tokens}`);
      console.log('');

      return {
        provider: config.name,
        status: 'success',
        duration,
        content,
        tokens: response.usage
      };
    }
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);

    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Details: ${JSON.stringify(error.response.data, null, 2)}`);
    }

    console.log('');

    return {
      provider: config.name,
      status: 'failed',
      error: error.message
    };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔧 AI Provider Connection Test\n');
  console.log('=' .repeat(60));
  console.log('');

  const results = [];

  if (providerArg && providers[providerArg]) {
    // Test specific provider
    const result = await testProvider(providerArg, providers[providerArg]);
    results.push(result);
  } else if (providerArg) {
    console.error(`❌ Unknown provider: ${providerArg}`);
    console.log(`\nAvailable providers: ${Object.keys(providers).join(', ')}`);
    process.exit(1);
  } else {
    // Test all providers
    for (const [key, config] of Object.entries(providers)) {
      const result = await testProvider(key, config);
      results.push(result);
    }
  }

  // Summary
  console.log('=' .repeat(60));
  console.log('\n📊 Summary:\n');

  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'failed');
  const skipped = results.filter(r => r.status === 'skipped');

  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log(`⏭️  Skipped: ${skipped.length}`);
  console.log('');

  if (successful.length > 0) {
    console.log('Working providers:');
    successful.forEach(r => {
      console.log(`  - ${r.provider} (${r.duration}ms)`);
    });
    console.log('');
  }

  if (failed.length > 0) {
    console.log('Failed providers:');
    failed.forEach(r => {
      console.log(`  - ${r.provider}: ${r.error}`);
    });
    console.log('');
  }

  // Exit code
  if (successful.length === 0 && failed.length > 0) {
    console.log('❌ All configured providers failed. Check API keys and network connection.');
    process.exit(1);
  } else if (successful.length === 0) {
    console.log('⚠️  No providers configured. Please add API keys to .env file.');
    process.exit(1);
  } else {
    console.log('✅ At least one provider is working. Workspace chat should function correctly.');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});
