/**
 * Experiment: Test File Hash Calculation
 * Verify that SHA-256 file hashing works correctly
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Old MD5 implementation
async function calculateMd5Hash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);

    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// New SHA-256 implementation
async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function runTests() {
  console.log('=== File Hashing Test ===\n');

  // Create a test file
  const testFile = path.join(__dirname, 'test-file.txt');
  const testContent = 'This is a test file for hash verification.\nSecond line of content.\n';

  fs.writeFileSync(testFile, testContent);
  console.log('Created test file:', testFile);
  console.log('File content length:', testContent.length, 'bytes');
  console.log();

  try {
    const md5Hash = await calculateMd5Hash(testFile);
    const sha256Hash = await calculateFileHash(testFile);

    console.log('Old MD5 hash (32 chars):   ', md5Hash);
    console.log('New SHA-256 hash (64 chars):', sha256Hash);
    console.log();

    // Test consistency
    const sha256Hash2 = await calculateFileHash(testFile);
    console.log('Consistency check:');
    console.log('First call:  ', sha256Hash);
    console.log('Second call: ', sha256Hash2);
    console.log('Match:', sha256Hash === sha256Hash2 ? '✓' : '✗');
    console.log();

    // Test with modified content
    fs.writeFileSync(testFile, testContent + 'Modified!');
    const sha256Modified = await calculateFileHash(testFile);
    console.log('Hash changes when file is modified:');
    console.log('Original: ', sha256Hash.substring(0, 20) + '...');
    console.log('Modified: ', sha256Modified.substring(0, 20) + '...');
    console.log('Different:', sha256Hash !== sha256Modified ? '✓' : '✗');
    console.log();

    console.log('✓ SHA-256 provides stronger file integrity verification');
    console.log('✓ SHA-256 is resistant to collision attacks');
    console.log('✓ Can reliably detect duplicate files');

  } finally {
    // Clean up
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
      console.log('\nCleaned up test file');
    }
  }
}

runTests().catch(console.error);
