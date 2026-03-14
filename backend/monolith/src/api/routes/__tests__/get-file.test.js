/**
 * getFile — Template File Loader tests (Issue #307)
 *
 * Port of PHP Get_file() (index.php:1492).
 * Tests the DB-specific override chain, fatal/non-fatal modes,
 * and path traversal protection.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFile } from '../legacy-compat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../../../public/templates');

describe('getFile', () => {
  const TEST_DB = '_test_getfile_db';
  const TEST_FILE = '_test_getfile_template.html';
  const CUSTOM_CONTENT = '<h1>Custom DB template</h1>';
  const DEFAULT_CONTENT = '<h1>Default template</h1>';

  beforeAll(async () => {
    // Create default template
    await fs.writeFile(path.join(TEMPLATES_DIR, TEST_FILE), DEFAULT_CONTENT, 'utf-8');
    // Create DB-specific override
    const customDir = path.join(TEMPLATES_DIR, 'custom', TEST_DB);
    await fs.mkdir(customDir, { recursive: true });
    await fs.writeFile(path.join(customDir, TEST_FILE), CUSTOM_CONTENT, 'utf-8');
  });

  afterAll(async () => {
    // Clean up test fixtures
    await fs.unlink(path.join(TEMPLATES_DIR, TEST_FILE)).catch(() => {});
    await fs.rm(path.join(TEMPLATES_DIR, 'custom', TEST_DB), { recursive: true, force: true });
  });

  // ── Priority chain ──────────────────────────────────────────────────────

  it('returns DB-specific override when it exists', async () => {
    const result = await getFile(TEST_DB, TEST_FILE);
    expect(result).toBe(CUSTOM_CONTENT);
  });

  it('falls back to default template when no DB override exists', async () => {
    const result = await getFile('nonexistent_db', TEST_FILE);
    expect(result).toBe(DEFAULT_CONTENT);
  });

  it('returns default template when db is null', async () => {
    const result = await getFile(null, TEST_FILE);
    expect(result).toBe(DEFAULT_CONTENT);
  });

  it('returns default template when db is empty string', async () => {
    const result = await getFile('', TEST_FILE);
    expect(result).toBe(DEFAULT_CONTENT);
  });

  // ── Fatal mode (default) ───────────────────────────────────────────────

  it('throws when template not found in fatal mode', async () => {
    await expect(getFile('anydb', 'nonexistent.html'))
      .rejects.toThrow('Template nonexistent.html is not found!');
  });

  it('throws when template not found with fatal=true explicit', async () => {
    await expect(getFile('anydb', 'nonexistent.html', true))
      .rejects.toThrow('is not found!');
  });

  // ── Non-fatal mode ─────────────────────────────────────────────────────

  it('returns false when template not found in non-fatal mode', async () => {
    const result = await getFile('anydb', 'nonexistent.html', false);
    expect(result).toBe(false);
  });

  // ── Input validation ───────────────────────────────────────────────────

  it('throws when file is not provided', async () => {
    await expect(getFile('db', '')).rejects.toThrow('Set file name!');
    await expect(getFile('db', null)).rejects.toThrow('Set file name!');
    await expect(getFile('db', undefined)).rejects.toThrow('Set file name!');
  });

  // ── Path traversal protection ──────────────────────────────────────────

  it('rejects file paths containing ".."', async () => {
    await expect(getFile('db', '../etc/passwd'))
      .rejects.toThrow('Invalid template path');
  });

  it('rejects absolute file paths', async () => {
    await expect(getFile('db', '/etc/passwd'))
      .rejects.toThrow('Invalid template path');
  });

  it('rejects db names containing ".."', async () => {
    await expect(getFile('..', 'test.html'))
      .rejects.toThrow('Invalid database name');
  });

  it('rejects db names containing "/"', async () => {
    await expect(getFile('db/../../etc', 'test.html'))
      .rejects.toThrow('Invalid database name');
  });
});
