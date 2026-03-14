/**
 * parseBlock — Recursive Template Block Renderer tests (Issue #302, #328)
 *
 * Port of PHP Parse_block() (index.php:7148).
 * Tests placeholder replacement, global vars, recursive child blocks,
 * multi-row iteration, structural blocks, depth limiting, and all
 * 8 PHP parity features from issue #328.
 */

import { describe, it, expect, vi } from 'vitest';
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

  // ══════════════════════════════════════════════════════════════════════
  // Issue #328 — PHP parity features
  // ══════════════════════════════════════════════════════════════════════

  // ── Feature 1: _parent_ namespace ──────────────────────────────────────

  describe('_parent_ namespace (feature #1)', () => {
    it('resolves {_parent_.varname} from parent block row data', () => {
      const blocks = {
        '&main': { CONTENT: '{_block_.&main.child}' },
        '&main.child': { CONTENT: 'parent={_parent_.name}', PARENT: '&main' },
      };
      const reportData = {
        '&main': [{ name: 'Alice' }],
      };
      expect(parseBlock(blocks, '&main', reportData, {}))
        .toBe('parent=Alice');
    });

    it('resolves _parent_ across multiple parent rows', () => {
      const blocks = {
        '&main': { CONTENT: '{_block_.&main.child}' },
        '&main.child': { CONTENT: '[{_parent_.id}]', PARENT: '&main' },
      };
      const reportData = {
        '&main': [{ id: '1' }, { id: '2' }],
      };
      expect(parseBlock(blocks, '&main', reportData, {}))
        .toBe('[1][2]');
    });

    it('leaves {_parent_.xxx} unresolved when no parent vars', () => {
      const blocks = {
        '&main': { CONTENT: '{_parent_.missing}' },
      };
      expect(parseBlock(blocks, '&main', {}, {}))
        .toBe('{_parent_.missing}');
    });

    it('resolves _parent_ with null value as empty string', () => {
      const blocks = {
        '&main': { CONTENT: '{_block_.&main.child}' },
        '&main.child': { CONTENT: 'val={_parent_.x}', PARENT: '&main' },
      };
      const reportData = { '&main': [{ x: null }] };
      expect(parseBlock(blocks, '&main', reportData, {}))
        .toBe('val=');
    });
  });

  // ── Feature 2: _request_ namespace ─────────────────────────────────────

  describe('_request_ namespace (feature #2)', () => {
    it('resolves {_request_.varname} from requestVars option', () => {
      const blocks = {
        '&main': { CONTENT: 'page={_request_.page}' },
      };
      const options = { requestVars: { page: '3' } };
      expect(parseBlock(blocks, '&main', {}, {}, 0, options))
        .toBe('page=3');
    });

    it('resolves multiple _request_ placeholders', () => {
      const blocks = {
        '&main': { CONTENT: '{_request_.sort}:{_request_.order}' },
      };
      const options = { requestVars: { sort: 'name', order: 'asc' } };
      expect(parseBlock(blocks, '&main', {}, {}, 0, options))
        .toBe('name:asc');
    });

    it('leaves {_request_.xxx} unresolved when no requestVars', () => {
      const blocks = {
        '&main': { CONTENT: '{_request_.missing}' },
      };
      expect(parseBlock(blocks, '&main', {}, {}))
        .toBe('{_request_.missing}');
    });

    it('_request_ values are HTML-escaped to prevent injection', () => {
      const blocks = {
        '&main': { CONTENT: '{_request_.q}' },
      };
      const options = { requestVars: { q: '{_global_.db}' } };
      // The { is escaped to &#123; during substitution, preventing recursive
      // placeholder resolution. At root level, &#123; is unescaped back to {.
      // The key point: {_global_.db} is NOT resolved even if db is in globalVars.
      expect(parseBlock(blocks, '&main', {}, { db: 'LEAKED' }, 0, options))
        .toBe('{_global_.db}');
    });
  });

  // ── Feature 3: resolveBuiltIn() fallback in _global_ ──────────────────

  describe('resolveBuiltIn fallback in _global_ (feature #3)', () => {
    it('resolves {_global_.date} via resolveBuiltIn when not in globalVars', () => {
      const blocks = {
        '&main': { CONTENT: '{_global_.date}' },
      };
      // Don't pass 'date' in globalVars — resolveBuiltIn should handle %DATE%
      const result = parseBlock(blocks, '&main', {}, {});
      // Should resolve to a date string (dd.mm.yyyy format)
      expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    });

    it('prefers explicit globalVars over resolveBuiltIn', () => {
      const blocks = {
        '&main': { CONTENT: '{_global_.date}' },
      };
      expect(parseBlock(blocks, '&main', {}, { date: 'custom-date' }))
        .toBe('custom-date');
    });

    it('leaves unresolvable _global_ placeholders intact', () => {
      const blocks = {
        '&main': { CONTENT: '{_global_.nonexistent_xyz}' },
      };
      expect(parseBlock(blocks, '&main', {}, {}))
        .toBe('{_global_.nonexistent_xyz}');
    });
  });

  // ── Feature 4: HTML escaping of data values ────────────────────────────

  describe('HTML escaping (feature #4)', () => {
    it('escapes { in row data values to prevent recursive injection', () => {
      const blocks = {
        '&main': { CONTENT: '{val}' },
      };
      const reportData = {
        '&main': [{ val: '{_global_.db}' }],
      };
      // The { should be escaped to &#123; during substitution,
      // then unescaped at root level back to {
      expect(parseBlock(blocks, '&main', reportData, {}))
        .toBe('{_global_.db}');
    });

    it('escaping prevents recursive placeholder resolution', () => {
      const blocks = {
        '&main': { CONTENT: '{val}' },
      };
      const reportData = {
        '&main': [{ val: '{_global_.secret}' }],
      };
      // Even with secret in globalVars, it should NOT be resolved because
      // the { was escaped before the _global_ pass
      const result = parseBlock(blocks, '&main', reportData, { secret: 'LEAKED' });
      expect(result).toBe('{_global_.secret}');
      expect(result).not.toContain('LEAKED');
    });

    it('escapes { in global var values too', () => {
      const blocks = {
        '&main': { CONTENT: '{_global_.x}' },
      };
      const result = parseBlock(blocks, '&main', {}, { x: 'a{b' });
      expect(result).toBe('a{b');
    });
  });

  // ── Feature 5: Dequeuing iteration model ───────────────────────────────

  describe('dequeuing iteration model (feature #5)', () => {
    it('processes rows by shifting from queue (array_shift parity)', () => {
      const blocks = {
        '&main': { CONTENT: '{n}' },
      };
      const reportData = {
        '&main': [{ n: '1' }, { n: '2' }, { n: '3' }],
      };
      expect(parseBlock(blocks, '&main', reportData, {}))
        .toBe('123');
    });

    it('does not mutate original reportData arrays', () => {
      const blocks = {
        '&main': { CONTENT: '{v}' },
      };
      const rows = [{ v: 'a' }, { v: 'b' }];
      const reportData = { '&main': rows };
      parseBlock(blocks, '&main', reportData, {});
      expect(rows).toHaveLength(2);
    });
  });

  // ── Feature 6: Early-exit on missing data ──────────────────────────────

  describe('early-exit on missing data (feature #6)', () => {
    it('stops iteration when a row is missing a placeholder key', () => {
      const blocks = {
        '&main': { CONTENT: '{a}-{b}' },
      };
      // First row has both keys, second row is missing 'b'
      const reportData = {
        '&main': [
          { a: '1', b: '2' },
          { a: '3' }, // missing 'b' → early exit
          { a: '5', b: '6' },
        ],
      };
      // Should render first row, then stop at second (missing 'b')
      expect(parseBlock(blocks, '&main', reportData, {}))
        .toBe('1-2');
    });

    it('renders all rows when all placeholders are satisfied', () => {
      const blocks = {
        '&main': { CONTENT: '{x}' },
      };
      const reportData = {
        '&main': [{ x: 'a' }, { x: 'b' }, { x: 'c' }],
      };
      expect(parseBlock(blocks, '&main', reportData, {}))
        .toBe('abc');
    });

    it('does not early-exit for structural blocks with no row data', () => {
      const blocks = {
        '&main': { CONTENT: '<div>{unresolved}</div>' },
      };
      // Empty row ({}) means structural block — no early exit
      expect(parseBlock(blocks, '&main', {}, {}))
        .toBe('<div>{unresolved}</div>');
    });
  });

  // ── Feature 7: Root-level unescape ─────────────────────────────────────

  describe('root-level unescape (feature #7)', () => {
    it('restores &#123; to { at root level (depth 0)', () => {
      const blocks = {
        '&main': { CONTENT: '{val}' },
      };
      const reportData = {
        '&main': [{ val: 'curly{brace' }],
      };
      expect(parseBlock(blocks, '&main', reportData, {}))
        .toBe('curly{brace');
    });

    it('child blocks do NOT unescape — only root does', () => {
      // The child renders at depth 1, so &#123; stays encoded until
      // root merges it and then unescapes.
      const blocks = {
        '&main': { CONTENT: '{_block_.&main.child}' },
        '&main.child': { CONTENT: '{val}', PARENT: '&main' },
      };
      const reportData = {
        '&main.child': [{ val: 'x{y' }],
      };
      // Root call (depth 0) should unescape the final output
      expect(parseBlock(blocks, '&main', reportData, {}))
        .toBe('x{y');
    });
  });

  // ── Feature 8: getBlockData integration ────────────────────────────────

  describe('getBlockData integration (feature #8)', () => {
    it('calls getBlockData when reportData has no rows for a block', () => {
      const blocks = {
        '&main': { CONTENT: '{name}' },
      };
      const getBlockData = vi.fn().mockReturnValue([{ name: 'Dynamic' }]);
      const options = { getBlockData };
      expect(parseBlock(blocks, '&main', {}, {}, 0, options))
        .toBe('Dynamic');
      expect(getBlockData).toHaveBeenCalledWith('&main');
    });

    it('does NOT call getBlockData when reportData already has rows', () => {
      const blocks = {
        '&main': { CONTENT: '{name}' },
      };
      const reportData = { '&main': [{ name: 'Static' }] };
      const getBlockData = vi.fn();
      const options = { getBlockData };
      expect(parseBlock(blocks, '&main', reportData, {}, 0, options))
        .toBe('Static');
      expect(getBlockData).not.toHaveBeenCalled();
    });

    it('getBlockData works for child blocks', () => {
      const blocks = {
        '&main': { CONTENT: '{_block_.&main.detail}' },
        '&main.detail': { CONTENT: '{info}', PARENT: '&main' },
      };
      const getBlockData = vi.fn((path) => {
        if (path === '&main.detail') return [{ info: 'loaded' }];
        return [];
      });
      const options = { getBlockData };
      expect(parseBlock(blocks, '&main', {}, {}, 0, options))
        .toBe('loaded');
    });

    it('handles getBlockData returning non-array gracefully', () => {
      const blocks = {
        '&main': { CONTENT: 'fallback' },
      };
      const getBlockData = vi.fn().mockReturnValue(null);
      const options = { getBlockData };
      expect(parseBlock(blocks, '&main', {}, {}, 0, options))
        .toBe('fallback');
    });
  });
});
