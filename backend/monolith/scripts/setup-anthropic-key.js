#!/usr/bin/env node
// setup-anthropic-key.js - Setup script for Anthropic API key
// Usage: node scripts/setup-anthropic-key.js [API_KEY]

import aiProviderKeysService from '../src/services/ai-provider-keys/AIProviderKeysService.js';

async function setupAnthropicKey() {
  // Get API key from command line argument or prompt
  const apiKey = process.argv[2];

  if (!apiKey) {
    console.error('❌ Error: API key is required');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/setup-anthropic-key.js YOUR_ANTHROPIC_API_KEY');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/setup-anthropic-key.js sk-ant-api03-xxx...');
    console.log('');
    console.log('Get your API key at: https://console.anthropic.com/');
    process.exit(1);
  }

  // Validate API key format
  if (!apiKey.startsWith('sk-ant-')) {
    console.warn('⚠️  Warning: API key should start with "sk-ant-"');
    console.log('   Make sure you copied the correct key from Anthropic Console');
  }

  try {
    console.log('📦 Setting up Anthropic API key...');

    const result = await aiProviderKeysService.setProviderKey(
      'anthropic',
      apiKey,
      {
        displayName: 'Anthropic (Claude)',
        keyName: 'default',
        isDefault: true,
        isActive: true,
        metadata: {
          source: 'setup-script',
          setupDate: new Date().toISOString()
        }
      }
    );

    console.log('✅ Anthropic API key configured successfully!');
    console.log('');
    console.log('Details:');
    console.log(`  Provider: ${result.provider}`);
    console.log(`  Display Name: ${result.displayName}`);
    console.log(`  Key Name: ${result.keyName}`);
    console.log(`  Is Default: ${result.isDefault}`);
    console.log(`  Is Active: ${result.isActive}`);
    console.log(`  Created At: ${result.createdAt}`);
    console.log('');
    console.log('🚀 You can now start the backend server:');
    console.log('   cd backend/monolith');
    console.log('   npm run dev');
    console.log('');
    console.log('🎉 Claude Chat is ready to use!');

  } catch (error) {
    console.error('❌ Error setting up API key:', error.message);
    process.exit(1);
  }
}

// Run the setup
setupAnthropicKey();
