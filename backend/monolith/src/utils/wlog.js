// wlog.js — Per-database SQL audit log + debug trace accumulator (Issue #309)
// Port of PHP wlog() and trace() functions.

import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = process.env.LOG_DIR || path.resolve('backend/monolith/logs');

// Ensure log directory exists once at startup
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
  // Silently ignore — appendFile will fail later with a clear error
}

/**
 * Format current date as YYYY-MM-DD HH:MM:SS (matching PHP date("Y-m-d H:i:s")).
 * @returns {string}
 */
function formatDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() + '-' +
    pad(d.getMonth() + 1) + '-' +
    pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' +
    pad(d.getMinutes()) + ':' +
    pad(d.getSeconds())
  );
}

/**
 * Append a timestamped line to `logs/{db}_{type}.log`.
 * Non-blocking — fire-and-forget; errors are logged to stderr.
 *
 * @param {string} db   - Database name (becomes part of the filename)
 * @param {string} msg  - Log message
 * @param {string} [type='sql'] - Log type suffix
 */
export function wlog(db, msg, type = 'sql') {
  const file = path.join(LOG_DIR, `${db}_${type}.log`);
  const line = `${formatDate()} ${msg}\n`;
  fs.appendFile(file, line, (err) => {
    if (err) {
      process.stderr.write(`wlog write error (${file}): ${err.message}\n`);
    }
  });
}

// ---------------------------------------------------------------------------
// Trace accumulator — collects debug messages for the current request.
// In a multi-request environment, attach traceStore to each req object
// or use AsyncLocalStorage. For now, a simple module-level accumulator.
// ---------------------------------------------------------------------------

let _trace = '';

/**
 * Append a debug trace message (PHP: $GLOBALS["trace"] .= $msg . "<br>\n").
 * @param {string} msg
 */
export function trace(msg) {
  _trace += msg + '<br>\n';
}

/**
 * Return accumulated trace output.
 * @returns {string}
 */
export function getTrace() {
  return _trace;
}

/**
 * Clear the trace accumulator (call at start of each request).
 */
export function resetTrace() {
  _trace = '';
}
