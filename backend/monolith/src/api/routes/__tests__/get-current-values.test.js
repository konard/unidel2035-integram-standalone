/**
 * getCurrentValues — unit tests (Issue #298)
 *
 * Tests the Get_Current_Values port directly by calling the exported function
 * with a mocked MySQL pool.
 *
 * Verifies:
 *   - loads field definitions (Query 1) and stored values (Query 2)
 *   - populates NOT_NULL markers from attrs
 *   - resolves REFERENCE fields via refTyps
 *   - resolves ARRAY/multiselect fields via arrTyps
 *   - tracks BOOLEAN fields separately
 *   - returns correct { reqs, reqTyps, notNull, revBt, booleans }
 */

import { describe, it, expect, vi } from 'vitest';

// ─── mock cookie-parser ────────────────────────────────────────────────────
vi.mock('cookie-parser', () => ({
  default: () => (_req, _res, next) => next(),
}));

// ─── mock mysql2/promise ─────────────────────────────────────────────────────
let mockQueryFn = vi.fn();

vi.mock('mysql2/promise', () => ({
  default: {
    createPool: vi.fn(() => ({
      query: (...args) => mockQueryFn(...args),
    })),
  },
}));

// ─── mock logger ─────────────────────────────────────────────────────────────
vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  },
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

// ─── mock nodemailer ────────────────────────────────────────────────────────
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: vi.fn() })) },
}));

// ─── mock t9n ──────────────────────────────────────────────────────────────
vi.mock('../../../utils/t9n.js', () => ({
  t9n: (key) => key,
  getLocale: () => 'en',
}));

// ─── import getCurrentValues and logger AFTER mocks ──────────────────────────
const { getCurrentValues } = await import('../legacy-compat.js');
const logger = (await import('../../../utils/logger.js')).default;

// Build a fake pool that delegates to mockQueryFn
function fakePool() {
  return { query: (...args) => mockQueryFn(...args) };
}

describe('getCurrentValues', () => {
  it('loads field definitions and stored values for a SHORT field', async () => {
    let callIdx = 0;
    mockQueryFn.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        // Query 1: field definitions
        return [[
          { req_id: 200, ref_id: null, attrs: '', ord: 1, base_typ: 3, type_val: 'Name', arr_id: null },
        ], []];
      }
      // Query 2: stored values
      return [[
        { id: 500, val: 'Hello', ord: 1, t: 200, arr_num: 1, bt: 3, ref_val: null },
      ], []];
    });

    const reqs = {};
    const refTyps = {};
    const arrTyps = {};
    const revBt = {};

    const result = await getCurrentValues(fakePool(), 'testdb', 50, 100, reqs, refTyps, arrTyps, revBt);

    expect(result.reqs['200']).toBe('Hello');
    expect(result.reqTyps['200']).toBe('500');
    expect(result.revBt['200']).toBe('SHORT');
    expect(Object.keys(result.notNull)).toHaveLength(0);
    expect(Object.keys(result.booleans)).toHaveLength(0);
  });

  it('populates NOT_NULL markers from attrs', async () => {
    let callIdx = 0;
    mockQueryFn.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        return [[
          { req_id: 300, ref_id: null, attrs: ':!NULL:', ord: 1, base_typ: 3, type_val: 'Required', arr_id: null },
          { req_id: 301, ref_id: null, attrs: '', ord: 2, base_typ: 3, type_val: 'Optional', arr_id: null },
        ], []];
      }
      return [[
        { id: 600, val: 'val1', ord: 1, t: 300, arr_num: 1, bt: 3, ref_val: null },
      ], []];
    });

    const result = await getCurrentValues(fakePool(), 'testdb', 50, 100, {}, {}, {}, {});

    expect(result.notNull).toHaveProperty('300');
    expect(result.notNull).not.toHaveProperty('301');
  });

  it('tracks BOOLEAN fields in booleans map when value is 1', async () => {
    let callIdx = 0;
    mockQueryFn.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        return [[
          { req_id: 400, ref_id: null, attrs: '', ord: 1, base_typ: 11, type_val: 'Active', arr_id: null },
          { req_id: 401, ref_id: null, attrs: '', ord: 2, base_typ: 11, type_val: 'Inactive', arr_id: null },
        ], []];
      }
      return [[
        { id: 700, val: '1', ord: 1, t: 400, arr_num: 1, bt: 11, ref_val: null },
        { id: 701, val: '0', ord: 2, t: 401, arr_num: 1, bt: 11, ref_val: null },
      ], []];
    });

    const result = await getCurrentValues(fakePool(), 'testdb', 50, 100, {}, {}, {}, {});

    expect(result.booleans['400']).toBe(1);
    expect(result.booleans).not.toHaveProperty('401');
    expect(result.revBt['400']).toBe('BOOLEAN');
    expect(result.revBt['401']).toBe('BOOLEAN');
  });

  it('resolves REFERENCE fields via refTyps mapping', async () => {
    let callIdx = 0;
    mockQueryFn.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        // ref_id=55 means this is a reference field
        return [[
          { req_id: 500, ref_id: 55, attrs: '', ord: 1, base_typ: 55, type_val: 'Category', arr_id: null },
        ], []];
      }
      // The stored value has t=55 (the ref type id)
      return [[
        { id: 800, val: '42', ord: 1, t: 55, arr_num: 1, bt: null, ref_val: 'SomeCat' },
      ], []];
    });

    const refTyps = {};
    const result = await getCurrentValues(fakePool(), 'testdb', 50, 100, {}, refTyps, {}, {});

    // refTyps should be populated
    expect(refTyps['500']).toBe('55');
    // The value should be resolved via the ref type
    expect(result.reqs['500']).toBe('42');
    expect(result.reqTyps['500']).toBe('800');
    expect(result.revBt['500']).toBe('REFERENCE');
  });

  it('resolves ARRAY/multiselect fields via arrTyps mapping', async () => {
    let callIdx = 0;
    mockQueryFn.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        // arr_id=99 means this is an array/multiselect field
        return [[
          { req_id: 600, ref_id: null, attrs: ':MULTI:', ord: 1, base_typ: 3, type_val: 'Tags', arr_id: 99 },
        ], []];
      }
      // The stored rows have t=99 (the arr sub-type id) with arr_num=3
      return [[
        { id: 900, val: 'tag1', ord: 1, t: 99, arr_num: 3, bt: 3, ref_val: null },
      ], []];
    });

    const arrTyps = {};
    const result = await getCurrentValues(fakePool(), 'testdb', 50, 100, {}, {}, arrTyps, {});

    // arrTyps should be populated
    expect(arrTyps['600']).toBe('99');
    // The value should be the arr_num count
    expect(result.reqs['600']).toBe(3);
  });

  it('sets empty values for fields without stored data', async () => {
    let callIdx = 0;
    mockQueryFn.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        return [[
          { req_id: 700, ref_id: null, attrs: '', ord: 1, base_typ: 3, type_val: 'Empty', arr_id: null },
        ], []];
      }
      // No stored values
      return [[], []];
    });

    const result = await getCurrentValues(fakePool(), 'testdb', 50, 100, {}, {}, {}, {});

    expect(result.reqs['700']).toBe('');
    expect(result.reqTyps['700']).toBe('');
  });

  it('skips self-type key (key === typ)', async () => {
    let callIdx = 0;
    mockQueryFn.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        // A field whose req_id happens to equal the object type (100)
        return [[
          { req_id: 100, ref_id: null, attrs: '', ord: 1, base_typ: 3, type_val: 'Self', arr_id: null },
        ], []];
      }
      return [[], []];
    });

    const reqs = {};
    const result = await getCurrentValues(fakePool(), 'testdb', 50, 100, reqs, {}, {}, {});

    // Should NOT set reqs['100'] to empty (skip self-type)
    expect(result.reqs).not.toHaveProperty('100');
    expect(result.reqTyps).not.toHaveProperty('100');
  });

  it('handles empty field definitions gracefully', async () => {
    mockQueryFn.mockImplementation(async () => [[], []]);

    const result = await getCurrentValues(fakePool(), 'testdb', 50, 100, {}, {}, {}, {});

    expect(result.reqs).toEqual({});
    expect(result.reqTyps).toEqual({});
    expect(result.notNull).toEqual({});
    expect(result.booleans).toEqual({});
  });

  it('uses simpler Query 2 (no GROUP BY) when no array types exist', async () => {
    const queries = [];
    let callIdx = 0;
    mockQueryFn.mockImplementation(async (sql, ...rest) => {
      callIdx++;
      queries.push(sql);
      if (callIdx === 1) {
        // No arr_id — no array types
        return [[
          { req_id: 200, ref_id: null, attrs: '', ord: 1, base_typ: 3, type_val: 'Name', arr_id: null },
        ], []];
      }
      return [[
        { id: 500, val: 'Hello', ord: 1, t: 200, arr_num: 1, bt: 3, ref_val: null },
      ], []];
    });

    await getCurrentValues(fakePool(), 'testdb', 50, 100, {}, {}, {}, {});

    // Query 2 should NOT contain GROUP BY when no array types exist
    expect(queries).toHaveLength(2);
    expect(queries[1]).not.toMatch(/GROUP BY/i);
  });

  it('uses GROUP BY in Query 2 when array types exist', async () => {
    const queries = [];
    let callIdx = 0;
    mockQueryFn.mockImplementation(async (sql, ...rest) => {
      callIdx++;
      queries.push(sql);
      if (callIdx === 1) {
        // arr_id=99 means this is an array/multiselect field
        return [[
          { req_id: 600, ref_id: null, attrs: ':MULTI:', ord: 1, base_typ: 3, type_val: 'Tags', arr_id: 99 },
        ], []];
      }
      return [[
        { id: 900, val: 'tag1', ord: 1, t: 99, arr_num: 3, bt: 3, ref_val: null },
      ], []];
    });

    await getCurrentValues(fakePool(), 'testdb', 50, 100, {}, {}, {}, {});

    // Query 2 should contain GROUP BY when array types exist
    expect(queries).toHaveLength(2);
    expect(queries[1]).toMatch(/GROUP BY/i);
  });

  it('logs a warning when base type mapping falls back to empty string', async () => {
    logger.warn.mockClear();
    let callIdx = 0;
    mockQueryFn.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        // base_typ: 9999 — not in REV_BASE_TYPE, will fall back to ''
        return [[
          { req_id: 999, ref_id: null, attrs: '', ord: 1, base_typ: 9999, type_val: 'Unknown', arr_id: null },
        ], []];
      }
      return [[], []];
    });

    const revBt = {};
    await getCurrentValues(fakePool(), 'testdb', 50, 100, {}, {}, {}, revBt);

    expect(revBt['999']).toBe('');
    expect(logger.warn).toHaveBeenCalledWith(
      '[getCurrentValues] Unknown base type mapping — falling back to empty string',
      expect.objectContaining({ db: 'testdb', reqKey: '999', baseTypId: 9999 }),
    );
  });

  it('mutates passed-in refTyps, arrTyps, and revBt objects', async () => {
    let callIdx = 0;
    mockQueryFn.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        return [[
          { req_id: 800, ref_id: 60, attrs: '', ord: 1, base_typ: 60, type_val: 'Ref', arr_id: null },
          { req_id: 801, ref_id: null, attrs: '', ord: 2, base_typ: 3, type_val: 'Normal', arr_id: 77 },
        ], []];
      }
      return [[], []];
    });

    const refTyps = {};
    const arrTyps = {};
    const revBt = {};

    await getCurrentValues(fakePool(), 'testdb', 50, 100, {}, refTyps, arrTyps, revBt);

    expect(refTyps['800']).toBe('60');
    expect(arrTyps['801']).toBe('77');
    expect(revBt['800']).toBe('REFERENCE');
    expect(revBt['801']).toBe('SHORT');
  });
});
