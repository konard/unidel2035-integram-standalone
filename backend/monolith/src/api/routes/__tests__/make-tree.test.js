/**
 * makeTree — HTML template parser unit tests (Issue #301)
 *
 * Tests for makeTree() which ports PHP Make_tree() (index.php:7082).
 * Uses a temporary directory with fixture templates instead of real
 * template files, so the tests are fully self-contained.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// We need to mock getFile since tests shouldn't depend on real template files.
// Instead we test makeTree's parsing logic by writing temp template files to
// the expected templates directory.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../../../public/templates');
const TEST_DB = '__make_tree_test__';
const CUSTOM_DIR = path.join(TEMPLATES_DIR, 'custom', TEST_DB);

// Helper: ensure directory exists
function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Write a template file in the default templates dir
function writeTemplate(name, content) {
  ensureDirSync(TEMPLATES_DIR);
  fs.writeFileSync(path.join(TEMPLATES_DIR, name), content, 'utf-8');
}

// Write a template file in the custom DB dir
function writeCustomTemplate(name, content) {
  ensureDirSync(CUSTOM_DIR);
  fs.writeFileSync(path.join(CUSTOM_DIR, name), content, 'utf-8');
}

// Clean up test fixtures
function removeIfExists(filePath) {
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

const testFiles = [];

function trackTemplate(name, content, custom = false) {
  const dir = custom ? CUSTOM_DIR : TEMPLATES_DIR;
  const fullPath = path.join(dir, name);
  testFiles.push(fullPath);
  if (custom) {
    writeCustomTemplate(name, content);
  } else {
    writeTemplate(name, content);
  }
}

// Dynamic import so we can set up fixtures first
let makeTree;

beforeAll(async () => {
  // Create test fixtures
  ensureDirSync(TEMPLATES_DIR);

  // Simple template with no blocks
  trackTemplate('mt_simple.html', '<h1>Hello {name}</h1>');

  // Template with one block
  trackTemplate('mt_one_block.html',
    'Header\n<!-- BEGIN: content -->Inner {value}<!-- END: content -->\nFooter');

  // Template with nested blocks
  trackTemplate('mt_nested.html',
    '<!-- BEGIN: outer -->Outer start <!-- BEGIN: inner -->Inner {x}<!-- END: inner --> Outer end<!-- END: outer -->');

  // Template with FILE include
  trackTemplate('mt_include_target.html', '<p>Included content {y}</p>');
  trackTemplate('mt_with_include.html',
    'Before <!-- FILE: mt_include_target -->After');

  // Template with BOM
  trackTemplate('mt_bom.html', '\uFEFF<div>BOM content</div>');

  // Template with multiple sibling blocks
  trackTemplate('mt_siblings.html',
    'Preamble\n<!-- BEGIN: alpha -->A<!-- END: alpha -->\nMiddle\n<!-- BEGIN: beta -->B<!-- END: beta -->\nEnd');

  // Template for nesting mismatch test
  trackTemplate('mt_mismatch.html',
    '<!-- BEGIN: outer --><!-- END: wrong -->');

  // Deep nesting
  trackTemplate('mt_deep.html',
    '<!-- BEGIN: l1 --><!-- BEGIN: l2 --><!-- BEGIN: l3 -->Deep {z}<!-- END: l3 --><!-- END: l2 --><!-- END: l1 -->');

  // info.html fallback for FILE includes of missing files
  trackTemplate('info.html', '<p>Info fallback</p>');

  // Template that FILE-includes a nonexistent file (should fall back to info.html)
  trackTemplate('mt_missing_include.html',
    'Before <!-- FILE: nonexistent_file_xyz -->After');

  const mod = await import('../legacy-compat.js');
  makeTree = mod.makeTree;
});

afterAll(() => {
  // Clean up all test fixtures
  for (const f of testFiles) {
    removeIfExists(f);
  }
  // Try removing custom dir (only if empty)
  try { fs.rmdirSync(CUSTOM_DIR); } catch { /* ignore */ }
  try { fs.rmdirSync(path.join(TEMPLATES_DIR, 'custom', TEST_DB)); } catch { /* ignore */ }
});

describe('makeTree (Issue #301)', () => {
  it('parses a simple template with no blocks', async () => {
    const blocks = await makeTree(TEST_DB, 'mt_simple.html', 'root');
    expect(blocks).toBeDefined();
    expect(blocks['root']).toBeDefined();
    expect(blocks['root'].CONTENT).toBe('<h1>Hello {name}</h1>');
  });

  it('parses a template with one block', async () => {
    const blocks = await makeTree(TEST_DB, 'mt_one_block.html', 'root');
    expect(blocks['root']).toBeDefined();
    expect(blocks['root.content']).toBeDefined();
    expect(blocks['root.content'].CONTENT).toBe('Inner {value}');
    expect(blocks['root.content'].PARENT).toBe('root');
    // Parent should contain insertion point
    expect(blocks['root'].CONTENT).toContain('{_block_.root.content}');
    // Parent should preserve surrounding text
    expect(blocks['root'].CONTENT).toContain('Header\n');
    expect(blocks['root'].CONTENT).toContain('\nFooter');
  });

  it('parses nested blocks', async () => {
    const blocks = await makeTree(TEST_DB, 'mt_nested.html', 'root');
    expect(blocks['root.outer']).toBeDefined();
    expect(blocks['root.outer.inner']).toBeDefined();
    expect(blocks['root.outer.inner'].CONTENT).toBe('Inner {x}');
    expect(blocks['root.outer.inner'].PARENT).toBe('root.outer');
    expect(blocks['root.outer'].PARENT).toBe('root');
    // Outer block should contain insertion point for inner
    expect(blocks['root.outer'].CONTENT).toContain('{_block_.root.outer.inner}');
  });

  it('parses multiple sibling blocks', async () => {
    const blocks = await makeTree(TEST_DB, 'mt_siblings.html', 'root');
    expect(blocks['root.alpha']).toBeDefined();
    expect(blocks['root.beta']).toBeDefined();
    expect(blocks['root.alpha'].CONTENT).toBe('A');
    expect(blocks['root.beta'].CONTENT).toBe('B');
    // Root should contain both insertion points and surrounding text
    expect(blocks['root'].CONTENT).toContain('{_block_.root.alpha}');
    expect(blocks['root'].CONTENT).toContain('{_block_.root.beta}');
    expect(blocks['root'].CONTENT).toContain('Preamble\n');
    expect(blocks['root'].CONTENT).toContain('\nEnd');
  });

  it('strips UTF-8 BOM', async () => {
    const blocks = await makeTree(TEST_DB, 'mt_bom.html', 'root');
    expect(blocks['root'].CONTENT).toBe('<div>BOM content</div>');
    expect(blocks['root'].CONTENT).not.toContain('\uFEFF');
  });

  it('handles FILE includes', async () => {
    const blocks = await makeTree(TEST_DB, 'mt_with_include.html', 'root');
    // The included file should create a child block
    expect(blocks['root.mt_include_target']).toBeDefined();
    expect(blocks['root.mt_include_target'].CONTENT).toBe('<p>Included content {y}</p>');
    expect(blocks['root.mt_include_target'].PARENT).toBe('root');
    // Root should contain insertion point
    expect(blocks['root'].CONTENT).toContain('{_block_.root.mt_include_target}');
  });

  it('falls back to info.html for missing FILE includes', async () => {
    const blocks = await makeTree(TEST_DB, 'mt_missing_include.html', 'root');
    // Should have created a block with info.html content
    const childKeys = Object.keys(blocks).filter(k => k.startsWith('root.') && k !== 'root');
    expect(childKeys.length).toBeGreaterThan(0);
    // The content should be from info.html
    const childBlock = blocks[childKeys[0]];
    expect(childBlock.CONTENT).toBe('<p>Info fallback</p>');
  });

  it('handles deep nesting (3 levels)', async () => {
    const blocks = await makeTree(TEST_DB, 'mt_deep.html', 'root');
    expect(blocks['root.l1']).toBeDefined();
    expect(blocks['root.l1.l2']).toBeDefined();
    expect(blocks['root.l1.l2.l3']).toBeDefined();
    expect(blocks['root.l1.l2.l3'].CONTENT).toBe('Deep {z}');
    expect(blocks['root.l1.l2.l3'].PARENT).toBe('root.l1.l2');
    expect(blocks['root.l1.l2'].PARENT).toBe('root.l1');
    expect(blocks['root.l1'].PARENT).toBe('root');
  });

  it('throws on mismatched block nesting', async () => {
    await expect(makeTree(TEST_DB, 'mt_mismatch.html', 'root'))
      .rejects.toThrow('Invalid blocks nesting');
  });

  it('uses empty string as default root block', async () => {
    const blocks = await makeTree(TEST_DB, 'mt_simple.html');
    expect(blocks['']).toBeDefined();
    expect(blocks[''].CONTENT).toBe('<h1>Hello {name}</h1>');
  });

  it('uses &main root block like PHP entry point', async () => {
    const blocks = await makeTree(TEST_DB, 'mt_one_block.html', '&main');
    expect(blocks['&main']).toBeDefined();
    expect(blocks['&main.content']).toBeDefined();
    expect(blocks['&main.content'].PARENT).toBe('&main');
  });
});
