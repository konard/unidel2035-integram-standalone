/**
 * Unit tests for calcOrder, getRefOrd, isDbVacant, removeMasks, and localize.
 *
 * These functions were identified as having zero test coverage (issue #338).
 * calcOrder and isDbVacant use execSql (from utils/execSql.js) which wraps
 * pool.query and returns { rows, fields, timing, insertId }.
 * getRefOrd calls pool.query directly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── mock mysql2/promise ─────────────────────────────────────────────────────
let mockQueryFn = vi.fn();

vi.mock('mysql2/promise', () => ({
  default: {
    createPool: vi.fn(() => ({
      query: (...args) => mockQueryFn(...args),
    })),
  },
}));

// ─── mock logger (used by execSql and legacy-compat) ─────────────────────────
vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

// ─── mock cookie-parser ──────────────────────────────────────────────────────
vi.mock('cookie-parser', () => ({
  default: () => (_req, _res, next) => next(),
}));

// ─── import after mocks ─────────────────────────────────────────────────────
const {
  calcOrder,
  getRefOrd,
  isDbVacant,
  removeMasks,
  localize,
} = await import('../legacy-compat.js');

const DB = 'testdb';

// Helper: build a mock pool whose .query returns the given responses in order
function makePool(...responses) {
  let idx = 0;
  return {
    query: vi.fn(async () => {
      const resp = responses[idx] ?? responses[responses.length - 1];
      idx++;
      return resp;
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// calcOrder
// ─────────────────────────────────────────────────────────────────────────────

describe('calcOrder', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns next_ord from DB when rows exist', async () => {
    // execSql calls pool.query and returns { rows, ... }
    // pool.query returns [rows, fields]
    const pool = makePool([[{ next_ord: 5 }], []]);
    const result = await calcOrder(pool, DB, 1, 8);
    expect(result).toBe(5);
  });

  it('returns 1 when MAX(ord) is NULL (no existing rows)', async () => {
    // COALESCE(MAX(ord)+1, 1) returns 1 when there are no matching rows
    const pool = makePool([[{ next_ord: 1 }], []]);
    const result = await calcOrder(pool, DB, 0, 8);
    expect(result).toBe(1);
  });

  it('returns correct value for large order numbers', async () => {
    const pool = makePool([[{ next_ord: 999 }], []]);
    const result = await calcOrder(pool, DB, 10, 13);
    expect(result).toBe(999);
  });

  it('throws when query returns empty rows', async () => {
    // execSql returns { rows: [] } when DB returns empty result set
    const pool = makePool([[], []]);
    await expect(calcOrder(pool, DB, 1, 8)).rejects.toThrow();
  });

  it('throws when pool.query rejects (fatal by default)', async () => {
    const pool = {
      query: vi.fn(async () => { throw new Error('Connection lost'); }),
    };
    await expect(calcOrder(pool, DB, 1, 8)).rejects.toThrow();
  });

  it('passes type and parent as bind params', async () => {
    const pool = makePool([[{ next_ord: 3 }], []]);
    await calcOrder(pool, DB, 42, 13);
    // pool.query is called by execSql with (sql, params)
    expect(pool.query).toHaveBeenCalled();
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('WHERE t = ? AND up = ?');
    expect(params).toEqual([13, 42]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRefOrd
// ─────────────────────────────────────────────────────────────────────────────

describe('getRefOrd', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns next_ord from DB when rows exist', async () => {
    // getRefOrd calls pool.query directly, returns [rows]
    const pool = makePool([[{ next_ord: 4 }]]);
    const result = await getRefOrd(pool, DB, 10, 8);
    expect(result).toBe(4);
  });

  it('returns 1 when no existing rows (COALESCE default)', async () => {
    const pool = makePool([[{ next_ord: 1 }]]);
    const result = await getRefOrd(pool, DB, 0, 8);
    expect(result).toBe(1);
  });

  it('returns 1 when query returns empty result set', async () => {
    const pool = makePool([[]]);
    const result = await getRefOrd(pool, DB, 10, 8);
    expect(result).toBe(1);
  });

  it('returns 1 when next_ord is null/undefined', async () => {
    const pool = makePool([[{ next_ord: null }]]);
    const result = await getRefOrd(pool, DB, 10, 8);
    expect(result).toBe(1);
  });

  it('returns 1 when next_ord is 0 (falsy)', async () => {
    const pool = makePool([[{ next_ord: 0 }]]);
    const result = await getRefOrd(pool, DB, 10, 8);
    expect(result).toBe(1);
  });

  it('returns 1 on query error (catch block)', async () => {
    const pool = {
      query: vi.fn(async () => { throw new Error('DB error'); }),
    };
    const result = await getRefOrd(pool, DB, 10, 8);
    expect(result).toBe(1);
  });

  it('passes parent and typ as bind params', async () => {
    const pool = makePool([[{ next_ord: 2 }]]);
    await getRefOrd(pool, DB, 42, 99);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('WHERE up = ? AND val = ?');
    expect(params).toEqual([42, '99']);
  });

  it('converts typ to string for val comparison', async () => {
    const pool = makePool([[{ next_ord: 3 }]]);
    await getRefOrd(pool, DB, 1, 55);
    const [, params] = pool.query.mock.calls[0];
    expect(params[1]).toBe('55');
    expect(typeof params[1]).toBe('string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isDbVacant
// ─────────────────────────────────────────────────────────────────────────────

describe('isDbVacant', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns true when DB name is not in use (empty result)', async () => {
    // execSql returns { rows: [] }
    const pool = makePool([[], []]);
    const result = await isDbVacant(pool, 'master', 'newdb');
    expect(result).toBe(true);
  });

  it('returns false when DB name already exists', async () => {
    // execSql returns { rows: [{ 1: 1 }] }
    const pool = makePool([[{ 1: 1 }], []]);
    const result = await isDbVacant(pool, 'master', 'existing');
    expect(result).toBe(false);
  });

  it('returns false when multiple rows match', async () => {
    const pool = makePool([[{ 1: 1 }, { 1: 1 }], []]);
    const result = await isDbVacant(pool, 'master', 'dup');
    expect(result).toBe(false);
  });

  it('passes dbName as bind parameter', async () => {
    const pool = makePool([[], []]);
    await isDbVacant(pool, 'master', 'checkme');
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('WHERE val = ?');
    expect(params).toContain('checkme');
  });

  it('uses masterDb for table identifier', async () => {
    const pool = makePool([[], []]);
    await isDbVacant(pool, 'master', 'test');
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain('`master`');
  });

  it('throws on query failure (fatal default in execSql)', async () => {
    const pool = {
      query: vi.fn(async () => { throw new Error('Connection refused'); }),
    };
    await expect(isDbVacant(pool, 'master', 'test')).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// removeMasks
// ─────────────────────────────────────────────────────────────────────────────

describe('removeMasks', () => {
  it('removes :!NULL: mask', () => {
    expect(removeMasks(':!NULL:')).toBe('');
  });

  it('removes :MULTI: mask', () => {
    expect(removeMasks(':MULTI:')).toBe('');
  });

  it('removes :ALIAS=value: mask', () => {
    expect(removeMasks(':ALIAS=Name:')).toBe('');
  });

  it('removes :ALIAS= with special characters in value', () => {
    expect(removeMasks(':ALIAS=Foo Bar:')).toBe('');
  });

  it('removes multiple masks from a single string', () => {
    expect(removeMasks(':!NULL::MULTI::ALIAS=Test:')).toBe('');
  });

  it('preserves non-mask content', () => {
    expect(removeMasks('prefix:!NULL:suffix')).toBe('prefixsuffix');
  });

  it('preserves non-mask content with multiple masks', () => {
    expect(removeMasks('A:!NULL:B:MULTI:C:ALIAS=X:D')).toBe('ABCD');
  });

  it('returns empty string for null input', () => {
    expect(removeMasks(null)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(removeMasks(undefined)).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(removeMasks('')).toBe('');
  });

  it('returns empty string for 0 (falsy)', () => {
    expect(removeMasks(0)).toBe('');
  });

  it('returns string unchanged when no masks present', () => {
    expect(removeMasks('plain text')).toBe('plain text');
  });

  it('handles repeated masks', () => {
    expect(removeMasks(':!NULL::!NULL:')).toBe('');
  });

  it('handles :ALIAS= with empty value', () => {
    expect(removeMasks(':ALIAS=:')).toBe('');
  });

  it('does not remove partial mask patterns', () => {
    // :!NUL: is not :!NULL: -- but the pattern is :!NULL: exactly
    expect(removeMasks(':!NUL:')).toBe(':!NUL:');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// localize
// ─────────────────────────────────────────────────────────────────────────────

describe('localize', () => {
  it('extracts EN text from t9n block', () => {
    const text = '<t9n>[EN]Hello[RU]Привет</t9n>';
    expect(localize(text, 'EN')).toBe('Hello');
  });

  it('extracts RU text from t9n block', () => {
    const text = '<t9n>[EN]Hello[RU]Привет</t9n>';
    expect(localize(text, 'RU')).toBe('Привет');
  });

  it('defaults to EN when no locale given', () => {
    const text = '<t9n>[EN]Hello[RU]Привет</t9n>';
    expect(localize(text)).toBe('Hello');
  });

  it('returns empty string when requested locale is missing', () => {
    const text = '<t9n>[EN]Hello</t9n>';
    expect(localize(text, 'FR')).toBe('');
  });

  it('handles multiple t9n blocks', () => {
    const text = 'Prefix <t9n>[EN]A[RU]Б</t9n> middle <t9n>[EN]B[RU]В</t9n> suffix';
    expect(localize(text, 'EN')).toBe('Prefix A middle B suffix');
  });

  it('preserves text outside t9n tags', () => {
    const text = 'Hello <t9n>[EN]World[RU]Мир</t9n>!';
    expect(localize(text, 'EN')).toBe('Hello World!');
  });

  it('returns original text when no t9n tags present', () => {
    expect(localize('no tags here', 'EN')).toBe('no tags here');
  });

  it('returns empty string for null input', () => {
    expect(localize(null, 'EN')).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(localize(undefined, 'EN')).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(localize('', 'EN')).toBe('');
  });

  it('is case-insensitive for locale parameter', () => {
    const text = '<t9n>[EN]Hello</t9n>';
    expect(localize(text, 'en')).toBe('Hello');
  });

  it('handles multiline content in t9n blocks', () => {
    const text = '<t9n>[EN]Line1\nLine2[RU]Строка</t9n>';
    expect(localize(text, 'EN')).toBe('Line1\nLine2');
  });

  it('handles t9n block with only one locale', () => {
    const text = '<t9n>[EN]Only English</t9n>';
    expect(localize(text, 'EN')).toBe('Only English');
  });

  it('handles empty t9n block', () => {
    const text = '<t9n></t9n>';
    expect(localize(text, 'EN')).toBe('');
  });

  it('handles three locales', () => {
    const text = '<t9n>[EN]Hi[RU]Привет[DE]Hallo</t9n>';
    expect(localize(text, 'DE')).toBe('Hallo');
  });
});
