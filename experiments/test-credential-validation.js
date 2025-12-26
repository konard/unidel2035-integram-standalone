/**
 * Test script to verify that hardcoded credentials have been removed
 * and environment variables are properly required
 *
 * This script tests the security fix for Issue #58
 */

console.log('🔒 Testing Credential Validation (Issue #58)\n');
console.log('='.repeat(70));

// Test 1: Check that environment variables are not set (simulating missing config)
console.log('\n📋 Test 1: Verify error handling when credentials are missing\n');

// Temporarily clear environment variables to test validation
const originalUsername = process.env.INTEGRAM_REGISTRATION_USERNAME;
const originalPassword = process.env.INTEGRAM_REGISTRATION_PASSWORD;
delete process.env.INTEGRAM_REGISTRATION_USERNAME;
delete process.env.INTEGRAM_REGISTRATION_PASSWORD;

let test1Passed = false;
try {
  // Try to import defaultTokenService which should fail without credentials
  const service = await import('../backend/monolith/src/services/ai/defaultTokenService.js');

  // Try to create a token without credentials
  try {
    const result = await service.default.createDefaultToken('test-user-id');
    console.log('❌ Test 1 FAILED: Function should have thrown an error');
  } catch (error) {
    if (error.message.includes('INTEGRAM_REGISTRATION credentials not configured')) {
      console.log('✅ Test 1 PASSED: Proper validation error thrown');
      console.log(`   Error message: "${error.message}"`);
      test1Passed = true;
    } else {
      console.log('❌ Test 1 FAILED: Wrong error message');
      console.log(`   Expected: "INTEGRAM_REGISTRATION credentials not configured"`);
      console.log(`   Got: "${error.message}"`);
    }
  }
} catch (error) {
  console.log('❌ Test 1 ERROR:', error.message);
}

// Restore environment variables
if (originalUsername) process.env.INTEGRAM_REGISTRATION_USERNAME = originalUsername;
if (originalPassword) process.env.INTEGRAM_REGISTRATION_PASSWORD = originalPassword;

// Test 2: Verify no hardcoded credentials in source files
console.log('\n📋 Test 2: Verify hardcoded credentials removed from source files\n');

import { readFile } from 'fs/promises';
import { resolve } from 'path';

const filesToCheck = [
  'backend/monolith/src/api/routes/email-auth.js',
  'backend/monolith/src/api/routes/oauth.js',
  'backend/monolith/src/services/ai/defaultTokenService.js',
  'backend/monolith/scripts/test-organization-creation.js'
];

let test2Passed = true;
const foundCredentials = [];

for (const file of filesToCheck) {
  const filePath = resolve(process.cwd(), file);
  try {
    const content = await readFile(filePath, 'utf-8');

    // Check for hardcoded credentials
    const hasApiReg = content.includes("'api_reg'") || content.includes('"api_reg"');
    const hasCa84qkcx = content.includes("'ca84qkcx'") || content.includes('"ca84qkcx"');

    if (hasApiReg || hasCa84qkcx) {
      test2Passed = false;
      foundCredentials.push({
        file,
        hasApiReg,
        hasCa84qkcx
      });
    }
  } catch (error) {
    console.log(`⚠️  Warning: Could not read ${file}: ${error.message}`);
  }
}

if (test2Passed) {
  console.log('✅ Test 2 PASSED: No hardcoded credentials found in source files');
  console.log(`   Checked ${filesToCheck.length} files`);
} else {
  console.log('❌ Test 2 FAILED: Hardcoded credentials still present:');
  foundCredentials.forEach(({ file, hasApiReg, hasCa84qkcx }) => {
    console.log(`   - ${file}`);
    if (hasApiReg) console.log(`     • Contains hardcoded 'api_reg'`);
    if (hasCa84qkcx) console.log(`     • Contains hardcoded 'ca84qkcx'`);
  });
}

// Test 3: Verify environment variable usage
console.log('\n📋 Test 3: Verify environment variables are used correctly\n');

let test3Passed = true;
const envVarChecks = [];

for (const file of filesToCheck) {
  const filePath = resolve(process.cwd(), file);
  try {
    const content = await readFile(filePath, 'utf-8');

    // Check for environment variable usage
    const hasEnvUsage = content.includes('INTEGRAM_REGISTRATION_USERNAME') &&
                        content.includes('INTEGRAM_REGISTRATION_PASSWORD');

    envVarChecks.push({
      file,
      hasEnvUsage
    });

    if (!hasEnvUsage) {
      test3Passed = false;
    }
  } catch (error) {
    console.log(`⚠️  Warning: Could not read ${file}: ${error.message}`);
  }
}

if (test3Passed) {
  console.log('✅ Test 3 PASSED: All files use environment variables');
  console.log(`   Verified ${envVarChecks.length} files`);
} else {
  console.log('❌ Test 3 FAILED: Some files missing environment variable usage:');
  envVarChecks.forEach(({ file, hasEnvUsage }) => {
    if (!hasEnvUsage) {
      console.log(`   - ${file}`);
    }
  });
}

// Test 4: Check .env.example for security documentation
console.log('\n📋 Test 4: Verify .env.example has security documentation\n');

let test4Passed = false;
try {
  const envExamplePath = resolve(process.cwd(), 'backend/monolith/.env.example');
  const envContent = await readFile(envExamplePath, 'utf-8');

  const hasSecurityWarning = envContent.includes('CRITICAL SECURITY') ||
                              envContent.includes('⚠️');
  const hasRegistrationVars = envContent.includes('INTEGRAM_REGISTRATION_USERNAME') &&
                               envContent.includes('INTEGRAM_REGISTRATION_PASSWORD');

  if (hasSecurityWarning && hasRegistrationVars) {
    console.log('✅ Test 4 PASSED: .env.example has proper security documentation');
    console.log('   • Security warnings present');
    console.log('   • Registration credential variables documented');
    test4Passed = true;
  } else {
    console.log('❌ Test 4 FAILED: .env.example missing security documentation');
    if (!hasSecurityWarning) console.log('   • Missing security warnings');
    if (!hasRegistrationVars) console.log('   • Missing credential variable documentation');
  }
} catch (error) {
  console.log(`❌ Test 4 ERROR: ${error.message}`);
}

// Summary
console.log('\n' + '='.repeat(70));
console.log('📊 Test Summary\n');

const allTests = [
  { name: 'Test 1: Validation error handling', passed: test1Passed },
  { name: 'Test 2: No hardcoded credentials', passed: test2Passed },
  { name: 'Test 3: Environment variable usage', passed: test3Passed },
  { name: 'Test 4: Security documentation', passed: test4Passed }
];

const passedCount = allTests.filter(t => t.passed).length;
const totalCount = allTests.length;

allTests.forEach(({ name, passed }) => {
  console.log(`${passed ? '✅' : '❌'} ${name}`);
});

console.log('\n' + '='.repeat(70));
if (passedCount === totalCount) {
  console.log(`🎉 All tests passed! (${passedCount}/${totalCount})`);
  console.log('\n✅ Issue #58 fix verified: Hardcoded credentials successfully removed');
  process.exit(0);
} else {
  console.log(`⚠️  ${passedCount}/${totalCount} tests passed, ${totalCount - passedCount} failed`);
  console.log('\n❌ Please review the failed tests above');
  process.exit(1);
}
