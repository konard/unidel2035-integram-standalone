/**
 * execSql() — PHP Exec_sql equivalent (Issue #309)
 *
 * Unit tests with a mocked mysql2 pool.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  execSql,
  queryStats,
  queryStatsStorage,
  runWithQueryStats,
  getQueryStats,
} from '../execSql.js';

/** Helper: create a mock pool whose .query() resolves with given data. */
function mockPool(result, fields = []) {
  return { query: vi.fn().mockResolvedValue([result, fields]) };
}

/** Helper: create a mock pool whose .query() rejects. */
function errorPool(err) {
  return { query: vi.fn().mockRejectedValue(err) };
}

describe('execSql — query wrapper', () => {
  beforeEach(() => queryStats.reset());

  it('returns rows, fields, timing, and insertId for a SELECT', async () => {
    const fakeRows = [{ id: 1, val: 'hello' }];
    const pool = mockPool(fakeRows);

    const result = await execSql(pool, 'SELECT * FROM t WHERE id = ?', [1], { label: 'test' });

    expect(result).toHaveProperty('rows', fakeRows);
    expect(result).toHaveProperty('fields');
    expect(result).toHaveProperty('timing');
    expect(typeof result.timing).toBe('number');
    expect(result.timing).toBeGreaterThanOrEqual(0);
    expect(result.insertId).toBeNull();
  });

  it('returns insertId for INSERT statements', async () => {
    const pool = mockPool({ insertId: 42, affectedRows: 1 });

    const result = await execSql(pool, 'INSERT INTO t (val) VALUES (?)', ['x'], { label: 'ins' });

    expect(result.insertId).toBe(42);
  });

  it('increments queryStats on each call', async () => {
    const pool = mockPool([]);

    await execSql(pool, 'SELECT 1');
    await execSql(pool, 'SELECT 2');

    expect(queryStats.count).toBe(2);
    expect(queryStats.totalTime).toBeGreaterThanOrEqual(0);
  });

  it('returns DB_NOT_FOUND for ER_NO_SUCH_TABLE (errno 1146)', async () => {
    const err = Object.assign(new Error('Table does not exist'), { errno: 1146, code: 'ER_NO_SUCH_TABLE' });
    const pool = errorPool(err);

    const result = await execSql(pool, 'SELECT * FROM missing', [], { db: 'mydb' });

    expect(result).toEqual({ error: 'DB_NOT_FOUND', db: 'mydb' });
  });

  it('returns error string in non-fatal mode', async () => {
    const err = new Error('syntax error near foo');
    err.errno = 1064;
    const pool = errorPool(err);

    const result = await execSql(pool, 'SELCT bad', [], { fatal: false, label: 'bad-query' });

    expect(typeof result).toBe('string');
    expect(result).toContain('syntax error near foo');
    expect(result).toContain('bad-query');
  });

  it('throws in fatal mode (default)', async () => {
    const err = new Error('access denied');
    err.errno = 1045;
    const pool = errorPool(err);

    await expect(execSql(pool, 'SELECT 1', [], { label: 'perm' }))
      .rejects.toThrow('access denied');
  });

  it('passes params to pool.query', async () => {
    const pool = mockPool([]);

    await execSql(pool, 'SELECT * FROM t WHERE id = ? AND val = ?', [5, 'x']);

    expect(pool.query).toHaveBeenCalledWith('SELECT * FROM t WHERE id = ? AND val = ?', [5, 'x']);
  });
});

describe('execSql — request-scoped queryStats (AsyncLocalStorage)', () => {
  beforeEach(() => queryStats.reset());

  it('getQueryStats() returns module-level stats outside of runWithQueryStats', () => {
    expect(getQueryStats()).toBe(queryStats);
  });

  it('getQueryStats() returns scoped store inside runWithQueryStats', async () => {
    await runWithQueryStats(async () => {
      const stats = getQueryStats();
      expect(stats).not.toBe(queryStats);
      expect(stats).toHaveProperty('count', 0);
      expect(stats).toHaveProperty('totalTime', 0);
    });
  });

  it('execSql increments scoped stats inside runWithQueryStats', async () => {
    const pool = mockPool([]);

    const scopedStats = await runWithQueryStats(async () => {
      await execSql(pool, 'SELECT 1');
      await execSql(pool, 'SELECT 2');
      await execSql(pool, 'SELECT 3');
      return getQueryStats();
    });

    expect(scopedStats.count).toBe(3);
    expect(scopedStats.totalTime).toBeGreaterThanOrEqual(0);
    // Module-level stats should remain untouched
    expect(queryStats.count).toBe(0);
    expect(queryStats.totalTime).toBe(0);
  });

  it('falls back to module-level stats outside runWithQueryStats', async () => {
    const pool = mockPool([]);

    await execSql(pool, 'SELECT 1');

    expect(queryStats.count).toBe(1);
  });

  it('concurrent requests have isolated stats', async () => {
    // Simulate two concurrent requests with interleaved queries
    const pool = mockPool([]);

    const request1 = runWithQueryStats(async () => {
      await execSql(pool, 'SELECT 1');
      // Yield to let request2 interleave
      await new Promise((r) => setTimeout(r, 5));
      await execSql(pool, 'SELECT 2');
      await execSql(pool, 'SELECT 3');
      return getQueryStats();
    });

    const request2 = runWithQueryStats(async () => {
      await execSql(pool, 'SELECT a');
      await new Promise((r) => setTimeout(r, 5));
      await execSql(pool, 'SELECT b');
      return getQueryStats();
    });

    const [stats1, stats2] = await Promise.all([request1, request2]);

    // Each request sees only its own queries
    expect(stats1.count).toBe(3);
    expect(stats2.count).toBe(2);

    // Module-level stats unaffected
    expect(queryStats.count).toBe(0);
  });

  it('many concurrent requests all stay isolated', async () => {
    const pool = mockPool([]);
    const NUM_REQUESTS = 20;

    const promises = Array.from({ length: NUM_REQUESTS }, (_, i) =>
      runWithQueryStats(async () => {
        const numQueries = i + 1;
        for (let q = 0; q < numQueries; q++) {
          await execSql(pool, `SELECT ${q}`);
        }
        return { expected: numQueries, actual: getQueryStats().count };
      }),
    );

    const results = await Promise.all(promises);

    for (const { expected, actual } of results) {
      expect(actual).toBe(expected);
    }

    // Module-level stats should be untouched
    expect(queryStats.count).toBe(0);
  });

  it('queryStatsStorage is an AsyncLocalStorage instance', () => {
    expect(queryStatsStorage).toBeDefined();
    expect(typeof queryStatsStorage.run).toBe('function');
    expect(typeof queryStatsStorage.getStore).toBe('function');
  });

  it('runWithQueryStats returns the value from the callback', async () => {
    const result = await runWithQueryStats(async () => 'hello');
    expect(result).toBe('hello');
  });
});
