/**
 * parseBlock — Recursive Template Block Renderer tests (Issue #302)
 *
 * Port of PHP Parse_block() (index.php:7148).
 * Tests placeholder replacement, global vars, recursive child blocks,
 * multi-row iteration, structural blocks, and depth limiting.
 */

import { describe, it, expect } from 'vitest';
import { parseBlock } from '../legacy-compat.js';

describe('parseBlock', () => {
  // ── Basic placeholder replacement ──────────────────────────────────────

  it('replaces {colname} placeholders with row data', () => {
    const blocks = {
      '&main': { CONTENT: '<p>{name} is {age}</p>' },
    };
    const reportData = {
      '&main': [{ name: 'Alice', age: 30 }],
    };
    expect(parseBlock(blocks, '&main', reportData, {}))
      .toBe('<p>Alice is 30</p>');
  });

  it('replaces {_global_.varname} with global variables', () => {
    const blocks = {
      '&main': { CONTENT: '<h1>{_global_.db}</h1><p>{_global_.user}</p>' },
    };
    expect(parseBlock(blocks, '&main', {}, { db: 'mydb', user: 'admin' }))
      .toBe('<h1>mydb</h1><p>admin</p>');
  });

  it('replaces both data and global placeholders in same content', () => {
    const blocks = {
      '&main': { CONTENT: '{name} on {_global_.db}' },
    };
    const reportData = { '&main': [{ name: 'Alice' }] };
    expect(parseBlock(blocks, '&main', reportData, { db: 'testdb' }))
      .toBe('Alice on testdb');
  });

  // ── Multi-row iteration ────────────────────────────────────────────────

  it('concatenates output for multiple data rows', () => {
    const blocks = {
      '&main': { CONTENT: '<li>{item}</li>' },
    };
    const reportData = {
      '&main': [{ item: 'A' }, { item: 'B' }, { item: 'C' }],
    };
    expect(parseBlock(blocks, '&main', reportData, {}))
      .toBe('<li>A</li><li>B</li><li>C</li>');
  });

  // ── Structural blocks (no data) ───────────────────────────────────────

  it('renders block once with global vars when no data rows exist', () => {
    const blocks = {
      '&main': { CONTENT: '<div>{_global_.version}</div>' },
    };
    expect(parseBlock(blocks, '&main', {}, { version: '1.0' }))
      .toBe('<div>1.0</div>');
  });

  it('renders block once preserving unreplaced data placeholders when no data', () => {
    const blocks = {
      '&main': { CONTENT: '<p>{unknown}</p>' },
    };
    expect(parseBlock(blocks, '&main', {}, {}))
      .toBe('<p>{unknown}</p>');
  });

  // ── Child blocks (recursive rendering) ────────────────────────────────

  it('renders child blocks and inserts at {_block_.*} points', () => {
    const blocks = {
      '&main': {
        CONTENT: '<div>{_block_.&main.header}</div><div>{_block_.&main.footer}</div>',
      },
      '&main.header': { CONTENT: '<h1>Header</h1>', PARENT: '&main' },
      '&main.footer': { CONTENT: '<p>Footer</p>', PARENT: '&main' },
    };
    expect(parseBlock(blocks, '&main', {}, {}))
      .toBe('<div><h1>Header</h1></div><div><p>Footer</p></div>');
  });

  it('renders nested child blocks recursively', () => {
    const blocks = {
      '&main': { CONTENT: '{_block_.&main.list}' },
      '&main.list': { CONTENT: '<ul>{_block_.&main.list.item}</ul>', PARENT: '&main' },
      '&main.list.item': { CONTENT: '<li>{val}</li>', PARENT: '&main.list' },
    };
    const reportData = {
      '&main.list.item': [{ val: 'X' }, { val: 'Y' }],
    };
    expect(parseBlock(blocks, '&main', reportData, {}))
      .toBe('<ul><li>X</li><li>Y</li></ul>');
  });

  it('child blocks receive global vars', () => {
    const blocks = {
      '&main': { CONTENT: '{_block_.&main.child}' },
      '&main.child': { CONTENT: 'db={_global_.db}', PARENT: '&main' },
    };
    expect(parseBlock(blocks, '&main', {}, { db: 'testdb' }))
      .toBe('db=testdb');
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it('returns empty string for missing block path', () => {
    expect(parseBlock({}, '&missing', {}, {})).toBe('');
  });

  it('returns empty string when block has null CONTENT', () => {
    const blocks = { '&main': { CONTENT: null } };
    expect(parseBlock(blocks, '&main', {}, {})).toBe('');
  });

  it('handles null values in row data by replacing with empty string', () => {
    const blocks = { '&main': { CONTENT: '{a}' } };
    const reportData = { '&main': [{ a: null }] };
    expect(parseBlock(blocks, '&main', reportData, {})).toBe('');
  });

  it('handles null global var values by replacing with empty string', () => {
    const blocks = { '&main': { CONTENT: '{_global_.x}' } };
    expect(parseBlock(blocks, '&main', {}, { x: null })).toBe('');
  });

  it('handles numeric zero in row data correctly', () => {
    const blocks = { '&main': { CONTENT: '{count}' } };
    const reportData = { '&main': [{ count: 0 }] };
    expect(parseBlock(blocks, '&main', reportData, {})).toBe('0');
  });

  it('works with null reportData', () => {
    const blocks = { '&main': { CONTENT: 'static' } };
    expect(parseBlock(blocks, '&main', null, {})).toBe('static');
  });

  it('works with null globalVars', () => {
    const blocks = { '&main': { CONTENT: '{val}' } };
    const reportData = { '&main': [{ val: 'ok' }] };
    expect(parseBlock(blocks, '&main', reportData, null)).toBe('ok');
  });

  // ── Depth limit ────────────────────────────────────────────────────────

  it('throws when recursion depth exceeds MAX_PARSE_DEPTH', () => {
    // Build a chain deeper than 100
    const blocks = {};
    let path = '&root';
    blocks[path] = { CONTENT: '' };
    for (let i = 0; i < 102; i++) {
      const child = path + '.c';
      blocks[path].CONTENT = `{_block_.${child}}`;
      blocks[child] = { CONTENT: '', PARENT: path };
      path = child;
    }
    blocks[path].CONTENT = 'leaf';

    expect(() => parseBlock(blocks, '&root', {}, {}))
      .toThrow(/maximum recursion depth/);
  });
});
