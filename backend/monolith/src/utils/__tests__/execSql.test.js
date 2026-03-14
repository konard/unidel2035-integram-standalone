/**
 * execSql() — PHP Exec_sql equivalent (Issue #309)
 *
 * Unit tests with a mocked mysql2 pool.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSql, queryStats } from '../execSql.js';

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
