/**
 * Experiment: Test OAuth Token Generation
 * Verify that crypto.randomBytes token generation is secure
 */

const crypto = require('crypto');

// Old MD5-based implementation
function generateTokenOld() {
  return crypto.createHash('md5')
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex');
}

// New crypto.randomBytes implementation
function generateTokenNew() {
  return crypto.randomBytes(16).toString('hex');
}

console.log('=== OAuth Token Generation Test ===\n');

console.log('Generating 5 tokens with old MD5 method:');
const oldTokens = [];
for (let i = 0; i < 5; i++) {
  const token = generateTokenOld();
  oldTokens.push(token);
  console.log(`  ${i + 1}. ${token} (${token.length} chars)`);
}
console.log();

console.log('Generating 5 tokens with new crypto.randomBytes method:');
const newTokens = [];
for (let i = 0; i < 5; i++) {
  const token = generateTokenNew();
  newTokens.push(token);
  console.log(`  ${i + 1}. ${token} (${token.length} chars)`);
}
console.log();

// Check for uniqueness
const oldUnique = new Set(oldTokens).size === oldTokens.length;
const newUnique = new Set(newTokens).size === newTokens.length;

console.log('Uniqueness check:');
console.log('Old tokens all unique:', oldUnique ? '✓' : '✗');
console.log('New tokens all unique:', newUnique ? '✓' : '✗');
console.log();

// Check token length
console.log('Token length consistency:');
console.log('Old tokens:', oldTokens.every(t => t.length === 32) ? '✓ All 32 chars' : '✗ Inconsistent');
console.log('New tokens:', newTokens.every(t => t.length === 32) ? '✓ All 32 chars' : '✗ Inconsistent');
console.log();

// Security analysis
console.log('Security improvements:');
console.log('✓ crypto.randomBytes uses cryptographically secure PRNG');
console.log('✓ No dependency on weak MD5 hash function');
console.log('✓ No predictable timestamp/Math.random() input');
console.log('✓ Same output length (32 hex chars) for compatibility');
console.log();

// Entropy test (basic)
function countUniqueChars(str) {
  return new Set(str).size;
}

const oldEntropy = oldTokens.map(countUniqueChars);
const newEntropy = newTokens.map(countUniqueChars);

console.log('Character diversity (entropy indicator):');
console.log('Old tokens avg unique chars:', (oldEntropy.reduce((a, b) => a + b) / oldEntropy.length).toFixed(1), '/ 16');
console.log('New tokens avg unique chars:', (newEntropy.reduce((a, b) => a + b) / newEntropy.length).toFixed(1), '/ 16');
console.log();

console.log('Recommendation: Use crypto.randomBytes for all token generation');
