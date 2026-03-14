// execSql.js — Query wrapper equivalent to PHP Exec_sql (Issue #309)
// Wraps pool.query() with error handling, timing, audit logging, and query counting.

import { performance } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createLogger } from './logger.js';

const sqlLogger = createLogger('sql');

/**
 * Regex to detect mutating SQL statements that should be audit-logged.
 * Matches INSERT, UPDATE, DELETE, REPLACE, ALTER, DROP, CREATE, TRUNCATE.
 * SELECT, SET, SHOW, DESCRIBE, EXPLAIN are excluded.
 */
const MUTATING_SQL_RE = /^\s*(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE|TRUNCATE)\b/i;

/**
 * AsyncLocalStorage instance for request-scoped query statistics.
 * Each HTTP request runs inside its own storage context so counters
 * are isolated and never interleave between concurrent requests.
 */
export const queryStatsStorage = new AsyncLocalStorage();

/**
 * Module-level fallback query statistics for non-request contexts
 * (e.g. CLI scripts, tests that don't use runWithQueryStats).
 * Kept for backwards compatibility.
 */
export const queryStats = {
  count: 0,
  totalTime: 0,
  /** Reset counters (call at the start of each HTTP request). */
  reset() {
    this.count = 0;
    this.totalTime = 0;
  },
};

/**
 * Run a function within an isolated query-stats context.
 * All execSql() calls inside `fn` will accumulate stats in a
 * fresh per-invocation object instead of the shared module-level one.
 *
 * @param {function} fn - Async (or sync) function to run in the scoped context
 * @returns {Promise<*>} The return value of `fn`
 */
export function runWithQueryStats(fn) {
  const store = { count: 0, totalTime: 0 };
  return queryStatsStorage.run(store, fn);
}

/**
 * Retrieve the current request's query statistics.
 * Returns the AsyncLocalStorage store if running inside runWithQueryStats(),
 * otherwise falls back to the module-level queryStats singleton.
 *
 * @returns {{ count: number, totalTime: number }}
 */
export function getQueryStats() {
  return queryStatsStorage.getStore() ?? queryStats;
}

/**
 * Execute a SQL query with PHP Exec_sql-equivalent behaviour.
 *
 * @param {import('mysql2/promise').Pool} pool - mysql2 connection pool
 * @param {string} sql - SQL statement (may contain `?` placeholders)
 * @param {Array}  [params=[]] - Bind parameters for `?` placeholders
 * @param {object} [options={}]
 * @param {string} [options.label]    - Human-readable label for logs (PHP's $err_msg)
 * @param {boolean} [options.log=true]  - Whether to audit-log mutating queries
 * @param {boolean} [options.fatal=true] - If true, throw on error; if false, return error string
 * @param {string} [options.username]  - Current user login (for audit log)
 * @param {string} [options.ip]        - Client IP address (for audit log)
 * @param {string} [options.db]        - Database/table name (used in ER_NO_SUCH_TABLE response)
 * @returns {Promise<{rows: Array, fields: Array, timing: number, insertId: number|null}|{error: string, db: string}|string>}
 */
export async function execSql(pool, sql, params = [], options = {}) {
  const {
    label = '',
    log = true,
    fatal = true,
    username = '',
    ip = '',
    db = '',
  } = options;

  const t0 = performance.now();

  let rows, fields, rawResult;
  try {
    [rawResult, fields] = await pool.query(sql, params);
    rows = rawResult;
  } catch (err) {
    const timing = performance.now() - t0;

    // MySQL error 1146 — ER_NO_SUCH_TABLE
    if (err.errno === 1146 || err.code === 'ER_NO_SUCH_TABLE') {
      return { error: 'DB_NOT_FOUND', db };
    }

    const msg = `Couldn't execute query [${label}] ${err.message} (${sql})`;
    if (!fatal) {
      sqlLogger.warn(msg, { timing: timing.toFixed(4), label });
      return msg;
    }
    // Fatal — re-throw with enriched message
    const wrapped = new Error(msg);
    wrapped.cause = err;
    throw wrapped;
  }

  const timing = performance.now() - t0;

  // Query counting (PHP: $GLOBALS["sqls"]++ / $GLOBALS["sql_time"])
  // Prefer request-scoped store; fall back to module-level singleton.
  const stats = queryStatsStorage.getStore() ?? queryStats;
  stats.count += 1;
  stats.totalTime += timing;

  // Determine insertId for INSERT statements
  const insertId = rawResult?.insertId ?? null;

  // Audit logging for mutating queries (PHP: wlog)
  if (log && MUTATING_SQL_RE.test(sql)) {
    const logEntry = {
      user: username,
      ip,
      timing: timing.toFixed(4),
      sql,
      label,
    };
    if (insertId) {
      logEntry.insertId = insertId;
    }
    sqlLogger.info(logEntry, 'sql-audit');
  }

  // Trace logging for all queries (PHP: trace)
  sqlLogger.debug({
    timing: timing.toFixed(4),
    sql,
    label,
  }, 'sql-trace');

  return { rows, fields, timing, insertId };
}
