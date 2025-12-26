/**
 * Experiment: Test Payment Signature Generation
 * Verify that SHA-256 signature generation works correctly
 */

const crypto = require('crypto');

// Old MD5 implementation (for comparison)
function generateMd5Signature(params) {
  const str = params.join(':');
  return crypto.createHash('md5').update(str).digest('hex');
}

// New SHA-256 implementation
function generateSignature(params) {
  const str = params.join(':');
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Test with sample payment parameters
const testParams = ['merchant123', '2024-01-01', '2024-12-31', 'secret_password'];

console.log('=== Payment Signature Generation Test ===\n');

console.log('Input parameters:', testParams);
console.log('Concatenated string:', testParams.join(':'));
console.log();

const md5Result = generateMd5Signature(testParams);
const sha256Result = generateSignature(testParams);

console.log('Old MD5 signature (32 chars):', md5Result);
console.log('Length:', md5Result.length);
console.log();

console.log('New SHA-256 signature (64 chars):', sha256Result);
console.log('Length:', sha256Result.length);
console.log();

console.log('✓ SHA-256 provides stronger cryptographic security');
console.log('✓ SHA-256 is resistant to collision attacks');
console.log('✓ Output length is 64 hex chars (vs MD5\'s 32)');
console.log();

// Test consistency
const sha256Result2 = generateSignature(testParams);
console.log('Consistency check (same input should give same output):');
console.log('First call:  ', sha256Result);
console.log('Second call: ', sha256Result2);
console.log('Match:', sha256Result === sha256Result2 ? '✓' : '✗');
console.log();

// Test different inputs produce different outputs
const differentParams = ['merchant456', '2024-01-01', '2024-12-31', 'different_password'];
const sha256Different = generateSignature(differentParams);
console.log('Different inputs produce different outputs:');
console.log('Original: ', sha256Result.substring(0, 20) + '...');
console.log('Different:', sha256Different.substring(0, 20) + '...');
console.log('Different:', sha256Result !== sha256Different ? '✓' : '✗');
