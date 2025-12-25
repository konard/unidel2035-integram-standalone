#!/usr/bin/env node
/**
 * Telegram Authentication Script
 *
 * This script helps you authenticate with Telegram using MTProto API
 * and generates a session string that can be used for automated parsing.
 *
 * Usage:
 *   node scripts/telegram-auth.js
 *
 * Requirements:
 *   - TELEGRAM_API_ID and TELEGRAM_API_HASH in .env
 *   - Get these from https://my.telegram.org/apps
 */

import '../config/env.js'; // Load environment variables
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Logger } from 'telegram/extensions/Logger.js';
import input from 'input';

const API_ID = process.env.TELEGRAM_API_ID;
const API_HASH = process.env.TELEGRAM_API_HASH;

// Disable verbose gramjs logging
Logger.setLevel('none');

async function authenticate() {
  console.log('\n=== Telegram MTProto Authentication ===\n');

  // Check environment variables
  if (!API_ID || !API_HASH) {
    console.error('❌ Error: TELEGRAM_API_ID and TELEGRAM_API_HASH are required');
    console.log('\n📝 Steps to get API credentials:');
    console.log('  1. Go to https://my.telegram.org/apps');
    console.log('  2. Login with your Telegram account');
    console.log('  3. Create a new application (if you don\'t have one)');
    console.log('  4. Copy API ID and API Hash');
    console.log('  5. Add them to backend/monolith/.env:');
    console.log('     TELEGRAM_API_ID=your_api_id');
    console.log('     TELEGRAM_API_HASH=your_api_hash\n');
    process.exit(1);
  }

  console.log('✅ API credentials found in .env');
  console.log(`   API ID: ${API_ID}`);
  console.log(`   API Hash: ${API_HASH.substring(0, 10)}...\n`);

  // Create client with empty session
  const session = new StringSession('');
  const client = new TelegramClient(session, parseInt(API_ID), API_HASH, {
    connectionRetries: 5,
  });

  try {
    console.log('📞 Connecting to Telegram...');
    await client.connect();

    // Check if already authorized (shouldn't be on first run)
    if (await client.isUserAuthorized()) {
      console.log('✅ Already authorized!');
      const sessionString = client.session.save();
      console.log('\n📋 Your session string:');
      console.log(sessionString);
      console.log('\n💾 Add this to your .env file:');
      console.log(`TELEGRAM_SESSION=${sessionString}\n`);
      await client.disconnect();
      return;
    }

    // Start authorization
    console.log('🔐 Starting authorization process...\n');

    // Get phone number
    const phoneNumber = await input.text('Enter your phone number (with country code, e.g. +1234567890): ');

    // Send code
    console.log('\n📨 Sending verification code to Telegram...');
    await client.sendCode(
      {
        apiId: parseInt(API_ID),
        apiHash: API_HASH,
      },
      phoneNumber
    );

    console.log('✅ Verification code sent!');
    console.log('📱 Check your Telegram app for the code.\n');

    // Get verification code
    const code = await input.text('Enter the verification code: ');

    // Try to sign in
    try {
      await client.signInUser(
        {
          apiId: parseInt(API_ID),
          apiHash: API_HASH,
        },
        {
          phoneNumber: phoneNumber,
          phoneCode: async () => code,
          password: async () => {
            // If 2FA is enabled, ask for password
            console.log('\n🔒 2FA detected.');
            return await input.text('Enter your 2FA password: ');
          },
        }
      );

      console.log('\n✅ Authentication successful!');

      // Get and display session string
      const sessionString = client.session.save();

      console.log('\n' + '='.repeat(70));
      console.log('🎉 SUCCESS! Your Telegram session is ready.');
      console.log('='.repeat(70));
      console.log('\n📋 Session String (save this securely!):');
      console.log('─'.repeat(70));
      console.log(sessionString);
      console.log('─'.repeat(70));

      console.log('\n💾 Next Steps:');
      console.log('1. Add this to your backend/monolith/.env file:');
      console.log(`   TELEGRAM_SESSION=${sessionString}`);
      console.log('\n2. Restart the monolith backend:');
      console.log('   cd backend/monolith && npm run dev');
      console.log('\n3. Test the parser:');
      console.log('   curl http://localhost:8081/api/public-channel-parser/health');

      console.log('\n⚠️  SECURITY WARNING:');
      console.log('   - Keep this session string SECRET');
      console.log('   - It provides access to your Telegram account');
      console.log('   - Do NOT share it publicly or commit to Git');
      console.log('   - Store it securely in .env (which is .gitignore\'d)\n');

    } catch (error) {
      if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
        console.log('\n🔒 2FA enabled. Asking for password...');
        const password = await input.text('Enter your 2FA password: ');

        await client.signInUser(
          {
            apiId: parseInt(API_ID),
            apiHash: API_HASH,
          },
          {
            phoneNumber: phoneNumber,
            phoneCode: async () => code,
            password: async () => password,
          }
        );

        console.log('\n✅ Authentication successful!');

        const sessionString = client.session.save();
        console.log('\n📋 Your session string:');
        console.log(sessionString);
        console.log('\n💾 Add this to your .env file:');
        console.log(`TELEGRAM_SESSION=${sessionString}\n`);
      } else {
        throw error;
      }
    }

    // Disconnect
    await client.disconnect();
    console.log('👋 Disconnected from Telegram\n');

  } catch (error) {
    console.error('\n❌ Authentication failed:', error.message);

    if (error.message.includes('PHONE_CODE_INVALID')) {
      console.log('\n💡 The verification code is incorrect. Please try again.');
    } else if (error.message.includes('PHONE_CODE_EXPIRED')) {
      console.log('\n💡 The verification code has expired. Please run the script again.');
    } else if (error.message.includes('PHONE_NUMBER_INVALID')) {
      console.log('\n💡 The phone number is invalid. Make sure to include country code (e.g., +1234567890)');
    } else if (error.message.includes('PASSWORD_HASH_INVALID')) {
      console.log('\n💡 2FA password is incorrect. Please try again.');
    } else {
      console.log('\n💡 Error details:', error.stack);
    }

    try {
      await client.disconnect();
    } catch (disconnectError) {
      // Ignore disconnect errors
    }

    process.exit(1);
  }
}

// Run authentication
authenticate().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
