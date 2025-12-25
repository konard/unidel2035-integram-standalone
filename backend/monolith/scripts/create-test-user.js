/**
 * Create Test User Script
 *
 * Creates a test user with login 'd' and password 'd' for development/testing
 *
 * Usage: node backend/monolith/scripts/create-test-user.js
 */

import '../src/config/env.js';
import { v4 as uuidv4 } from 'uuid';
import * as storageService from '../src/services/user-sync/storageService.js';
import { hashPassword } from '../src/services/user-sync/passwordSyncService.js';
import logger from '../src/utils/logger.js';

async function createTestUser() {
  try {
    console.log('Creating test user...');
    console.log('Username: d');
    console.log('Email: d@test.local');
    console.log('Password: d');

    const userId = uuidv4();
    const passwordHash = await hashPassword('d');

    const testUser = {
      userId,
      email: 'd@test.local',
      username: 'd',
      displayName: 'Test User',
      password_hash: passwordHash, // Store password hash for test user
      createdAt: new Date().toISOString(),
      databases: [
        {
          name: 'test',
          recordId: 'test-record-' + userId,
          syncedAt: new Date().toISOString(),
          status: 'active'
        }
      ]
    };

    // Update registry
    await storageService.updateUserInRegistry(testUser);

    // Add log entry
    await storageService.addLog({
      userId,
      operation: 'test_user_creation',
      status: 'success',
      message: 'Test user created via script',
      timestamp: new Date().toISOString()
    });

    console.log('\n✅ Test user created successfully!');
    console.log('\nLogin credentials:');
    console.log('  Username: d');
    console.log('  Email: d@test.local');
    console.log('  Password: d');
    console.log('\nUser ID:', userId);
    console.log('Password hash:', passwordHash);

    logger.info({ userId, email: 'd@test.local', username: 'd' }, 'Test user created');

  } catch (error) {
    console.error('❌ Failed to create test user:', error.message);
    logger.error({ error: error.message, stack: error.stack }, 'Test user creation failed');
    process.exit(1);
  }
}

createTestUser()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
