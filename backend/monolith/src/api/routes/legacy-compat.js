// Legacy PHP Backend Compatibility Layer
// Allows legacy HTML frontend (integram-server/) to work with new Node.js backend
// Maps old PHP URL patterns to new API endpoints

import express from 'express';
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import zlib from 'zlib';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { fileURLToPath } from 'url';
import logger from '../../utils/logger.js';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { phpJsonMiddleware } from '../../utils/jsonSortKeys.js';
import { isAbnPostProcessFunction, applyAbnFunction, isAbnFunction, ABN_SQL_FIELD_FUNCS, getJsonVal, checkJson } from '../utils/report-functions.js';
import { t9n, getLocale } from '../../utils/t9n.js';
import { execSql } from '../../utils/execSql.js';

// ── SQL Injection Guards (Issue #308) ────────────────────────────────────────

/**
 * Validate and quote a SQL identifier (table name, column name).
 * Rejects anything that is not a simple alphanumeric/underscore name.
 * Returns the identifier wrapped in backticks for safe interpolation.
 *
 * @param {string} name - The identifier to validate
 * @returns {string} Backtick-quoted identifier, e.g. `` `myTable` ``
 * @throws {Error} If the identifier contains disallowed characters
 */
function sanitizeIdentifier(name) {
  if (typeof name !== 'string' || !name) {
    throw new Error('SQL identifier must be a non-empty string');
  }
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid SQL identifier: "${name}" — only alphanumeric and underscore allowed`);
  }
  return `\`${name}\``;
}

// PHP's original checkInjection (index.php:617) blocks only 3 keywords:
//   FROM, SELECT, TABLE
// The Node port intentionally expands this to 15 keywords as defense-in-depth
// security hardening. The broader list protects against a wider range of SQL
// injection patterns (e.g. UNION-based, stacked queries, DDL attacks).
//
// Tradeoff: the expanded list increases false-positive risk for legitimate
// search values that happen to contain whole words like "where", "union",
// "create", etc. Word-boundary matching (\b) mitigates this — substrings
// inside longer words (e.g. "timetable", "autoupdate") are NOT flagged.
// If false positives arise, callers can pass strictMode=true to fall back
// to the original PHP 3-keyword list.

/** @type {RegExp} Expanded 15-keyword SQL injection pattern (Node hardening) */
const SQL_KEYWORDS_EXPANDED_RE = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|UNION|FROM|TABLE|WHERE|INTO|EXEC|EXECUTE|CREATE|TRUNCATE)\b/i;

/** @type {RegExp} Original PHP 3-keyword SQL injection pattern */
const SQL_KEYWORDS_STRICT_RE = /\b(FROM|SELECT|TABLE)\b/i;

/**
 * Check user-supplied search values for SQL injection attempts.
 * Port of PHP checkInjection() (index.php:617) with expanded keyword list.
 *
 * The PHP original checks only 3 SQL keywords: `FROM`, `SELECT`, `TABLE`.
 * This Node port intentionally expands the list to 15 keywords for broader
 * defense-in-depth protection. All matching is word-boundary delimited to
 * avoid false positives on substrings (e.g. "information" won't match "from").
 *
 * @param {string} value - The user-supplied value to check
 * @param {object} [options] - Optional configuration
 * @param {boolean} [options.strictMode=false] - When true, use the original
 *   PHP 3-keyword list (FROM, SELECT, TABLE) for backward compatibility.
 *   Useful when the expanded list causes false positives on legitimate values.
 * @returns {string} The original value if safe
 * @throws {Error} If a SQL keyword is detected
 */
function checkInjection(value, options) {
  if (typeof value !== 'string') return value;
  const re = options && options.strictMode
    ? SQL_KEYWORDS_STRICT_RE
    : SQL_KEYWORDS_EXPANDED_RE;
  const match = value.match(re);
  if (match) {
    throw new Error(`No SQL clause allowed in search fields. Found: ${match[0]}`);
  }
  return value;
}

// ── Template File Loader (Issue #307) ────────────────────────────────────────

/**
 * Port of PHP Get_file() (index.php:1492).
 * Loads a template file with DB-specific override support.
 *
 * Priority chain:
 *   1. templates/custom/{db}/{file}   (DB-specific override)
 *   2. templates/{file}               (default template)
 *
 * @param {string} db    - Database name (used for custom override directory)
 * @param {string} file  - Template filename to load
 * @param {boolean} [fatal=true] - If true, throw when not found; if false, return false
 * @returns {Promise<string|false>} File contents, or false if non-fatal and not found
 * @throws {Error} If file is not provided, contains path traversal, or is not found (fatal mode)
 */
const TEMPLATES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../public/templates'
);

async function getFile(db, file, fatal = true) {
  if (!file || typeof file !== 'string') {
    throw new Error('Set file name!');
  }

  // Path traversal protection: reject ".." or absolute paths
  if (file.includes('..') || path.isAbsolute(file)) {
    throw new Error(`Invalid template path: "${file}"`);
  }

  // Sanitize db as well — it becomes a directory component
  if (db && (String(db).includes('..') || String(db).includes('/'))) {
    throw new Error(`Invalid database name: "${db}"`);
  }

  // 1. Check DB-specific override: templates/custom/{db}/{file}
  if (db) {
    const customPath = path.join(TEMPLATES_DIR, 'custom', String(db), file);
    try {
      return await fsPromises.readFile(customPath, 'utf-8');
    } catch {
      // Fall through to default
    }
  }

  // 2. Check default: templates/{file}
  const defaultPath = path.join(TEMPLATES_DIR, file);
  try {
    return await fsPromises.readFile(defaultPath, 'utf-8');
  } catch {
    if (!fatal) return '';
    throw new Error(`Template ${file} is not found!`);
  }
}

// ── HTML Template Parser (Issue #301) ────────────────────────────────────────

const MAX_INCLUDE_DEPTH = 20;

async function makeTreeInner(blocks, text, curBlock, db, params = {}, depth = 0) {
  if (depth > MAX_INCLUDE_DEPTH) {
    throw new Error(`Make_tree: maximum include depth (${MAX_INCLUDE_DEPTH}) exceeded — possible circular FILE include`);
  }

  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  } else if (text.length >= 3 &&
             text.charCodeAt(0) === 0xEF &&
             text.charCodeAt(1) === 0xBB &&
             text.charCodeAt(2) === 0xBF) {
    text = text.slice(3);
  }

  const BEGIN_DELIMITER = '<!-- ';
  const parts = text.split(BEGIN_DELIMITER);
  const patt = /^(begin:|end:|file:)\s*(&?[\w\u0400-\u04FF ]+)\s*-->([\s\S]*)$/i;

  if (!blocks[curBlock]) {
    blocks[curBlock] = {};
  }
  blocks[curBlock].CONTENT = '';

  for (let key = 0; key < parts.length; key++) {
    const a = parts[key];
    const m = patt.exec(a);

    if (m) {
      const directive = m[1].toLowerCase();
      const blockName = m[2].trim().toLowerCase();
      const rest      = m[3];

      if (directive === 'begin:') {
        const fullPath = curBlock + '.' + blockName;
        if (!blocks[fullPath]) blocks[fullPath] = {};
        blocks[fullPath].PARENT = curBlock;
        curBlock = fullPath;
        blocks[curBlock].CONTENT = rest;

      } else if (directive === 'end:') {
        const expected = blocks[curBlock].PARENT + '.' + blockName;
        if (expected !== curBlock) {
          throw new Error(`Invalid blocks nesting (${expected} - ${curBlock})!`);
        }
        const insertionPoint = `{_block_.${curBlock}}`;
        curBlock = blocks[curBlock].PARENT;
        blocks[curBlock].CONTENT += insertionPoint + rest;

      } else if (directive === 'file:') {
        let fileContent;
        if (blockName.trim() === 'a' && params.action) {
          fileContent = await getFile(db, params.action + '.html', false);
        } else if (params[blockName.trim()]) {
          fileContent = await getFile(db, params[blockName.trim()] + '.html', false);
        } else {
          fileContent = await getFile(db, blockName.trim() + '.html', false);
        }
        if (!fileContent || fileContent.length === 0) {
          fileContent = await getFile(db, 'info.html');
        }

        const resolvedName = params[blockName.trim()] || blockName.trim();
        const fileBlock = curBlock + '.' + resolvedName;
        const insertionPoint = `{_block_.${fileBlock}}`;
        if (!blocks[fileBlock]) blocks[fileBlock] = {};
        blocks[fileBlock].PARENT = curBlock;

        await makeTreeInner(blocks, fileContent, fileBlock, db, params, depth + 1);

        blocks[curBlock].CONTENT += insertionPoint + rest;
      }
    } else if (a) {
      if (key !== 0) {
        blocks[curBlock].CONTENT += BEGIN_DELIMITER + a;
      } else {
        blocks[curBlock].CONTENT = a;
      }
    }
  }
}

/**
 * Parse an HTML template file into a block tree.
 * Port of PHP Make_tree() (index.php:7082-7145).
 *
 * @param {string} db           - Database name
 * @param {string} templateFile - Template filename (e.g. "main.html")
 * @param {string} [rootBlock=''] - Root block name
 * @param {object} [params={}]  - Request parameters for FILE directive resolution
 * @returns {Promise<object>}   - Flat block dictionary keyed by dot-paths
 */
async function makeTree(db, templateFile, rootBlock = '', params = {}) {
  const text = await getFile(db, templateFile);
  const blocks = {};
  await makeTreeInner(blocks, text, rootBlock, db, params, 0);
  return blocks;
}

const router = express.Router();

// Apply PHP JSON key sorting middleware to achieve byte-for-byte parity (Issue #173)
// PHP's json_encode() sorts keys alphabetically, while Node.js preserves insertion order.
// This middleware ensures all JSON responses have keys sorted alphabetically.
router.use(phpJsonMiddleware());

// Skip API v2 paths — let them fall through to the V2 router mounted in start.js.
// Without this, the legacy /:db/auth and /:db POST handlers intercept
// /api/v2/auth (where db="v2") and fail with "v2 does not exist".
router.use((req, res, next) => {
  if (req.path.startsWith('/v2/') || req.path === '/v2') {
    return next('router');
  }
  next();
});

// Get the directory path for serving static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const legacyPath = path.resolve(__dirname, '../../../../../integram-server');

// PHP isAPI: any of JSON/JSON_DATA/JSON_KV/JSON_CR/JSON_HR triggers API mode
// Step 4 enhancement: Also detect JSON from headers (Accept, Content-Type, X-Requested-With)
function isApiRequest(req) {
  const q = req.query;

  // Check query params (original PHP behavior)
  if (q.JSON !== undefined || q.json !== undefined ||
      q.JSON_DATA !== undefined || q.JSON_KV !== undefined ||
      q.JSON_CR !== undefined || q.JSON_HR !== undefined) {
    return true;
  }

  // Step 4: Also detect JSON requests from headers
  const acceptHeader = req.headers['accept'] || '';
  const contentType = req.headers['content-type'] || '';
  const xRequestedWith = req.headers['x-requested-with'] || '';

  // Accept: application/json
  if (acceptHeader.includes('application/json')) {
    return true;
  }

  // Content-Type: application/json (for POST requests)
  if (contentType.includes('application/json')) {
    return true;
  }

  // X-Requested-With: XMLHttpRequest (AJAX requests)
  if (xRequestedWith.toLowerCase() === 'xmlhttprequest') {
    return true;
  }

  return false;
}

/**
 * Extract Bearer/plain token from request headers and cookie.
 * @param {object} req - Express request
 * @param {string} db  - database name (cookie key)
 * @returns {string}   - token or ''
 */
function extractToken(req, db) {
  const authHeader  = req.headers.authorization   || '';
  const xAuthHeader = req.headers['x-authorization'] || '';
  return req.cookies?.[db] ||
    (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader) ||
    (xAuthHeader.startsWith('Bearer ') ? xAuthHeader.slice(7) : xAuthHeader) ||
    '';
}

/**
 * Build &main.myrolemenu.
 * PHP approach: runs the 'MyRoleMenu' report from the DB (Get_block_data('MyRoleMenu')
 * looks up val='MyRoleMenu' AND t=REPORT, then runs Compile_Report).
 * Fallback: query role row's SHORT-typed children with Address child hrefs.
 *
 * @param {object} pool      - MySQL pool
 * @param {string} db        - database name
 * @param {number} roleObjId - ID of the role OBJECT, NOT the assignment row
 * @returns {object} {href: [...], name: [...]}
 */
async function buildMyrolemenu(pool, db, roleObjId) {
  const empty = { href: [], name: [] };

  // Primary: run the 'MyRoleMenu' report from the DB (matches PHP Get_block_data behavior)
  try {
    const { rows: repRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE val = 'MyRoleMenu' AND t = ${TYPE.REPORT} LIMIT 1`, [], { label: 'buildMyrolemenu_select' });
    if (repRows.length > 0) {
      const report = await compileReport(pool, db, repRows[0].id);
      if (report && report.columns.length > 0) {
        const results = await executeReport(pool, db, report, {}, 500, 0);
        // PHP template uses {HREF} and {Name} block variables (case-insensitive match)
        const hrefCol = report.columns.find(c => c.name.toLowerCase() === 'href');
        const nameCol = report.columns.find(c => c.name.toLowerCase() === 'name');
        if (hrefCol && nameCol) {
          const hrefs = [], names = [];
          for (const row of results.data) {
            const h = row[hrefCol.alias] || '';
            const n = row[nameCol.alias] || '';
            if (h || n) { hrefs.push(h); names.push(n); }
          }
          return { href: hrefs, name: names };
        }
      }
    }
  } catch (_e) { /* fall through to custom query */ }

  // Fallback: query role row's SHORT-typed children with Address child hrefs
  if (!roleObjId) return empty;
  try {
    // Get menu items: children of role row whose type has base SHORT (t=3)
    const { rows: menuItems } = await execSql(pool, `SELECT m.id, m.val AS name
       FROM \`${db}\` m
       JOIN \`${db}\` menu_typ ON menu_typ.id = m.t AND menu_typ.t = ${TYPE.SHORT}
       WHERE m.up = ? AND m.val != ''
       ORDER BY m.ord`, [roleObjId], { label: 'buildMyrolemenu_select' });
    if (menuItems.length === 0) return empty;
    const mIds = menuItems.map(m => m.id);
    const ph   = mIds.map(() => '?').join(',');
    // Get Address children (first non-empty non-type child of each menu item)
    const { rows: addrRows } = await execSql(pool, `SELECT a.up, a.val AS href
       FROM \`${db}\` a
       WHERE a.up IN (${ph}) AND a.id != a.t AND a.val != ''
       ORDER BY a.up, a.ord`, mIds, { label: 'buildMyrolemenu_select' });
    const hrefByParent = {};
    for (const a of addrRows) {
      if (hrefByParent[a.up] === undefined) hrefByParent[a.up] = a.href;
    }
    const items = menuItems.filter(m => hrefByParent[m.id] !== undefined);
    if (items.length === 0) return empty;
    return {
      href: items.map(m => hrefByParent[m.id]),
      name: items.map(m => m.name),
    };
  } catch (_e) {
    return empty;
  }
}

/**
 * Resolve myrolemenu for a session token (Basic or bearer/cookie).
 * Returns {href:[], name:[]} – same shape as buildMyrolemenu.
 */
async function getMenuForToken(pool, db, token) {
  const empty = { href: [], name: [] };
  if (!token) return empty;
  try {
    let uRows;
    if (token.startsWith('Basic ')) {
      const decoded  = Buffer.from(token.slice(6), 'base64').toString('utf8');
      const colonIdx = decoded.indexOf(':');
      if (colonIdx <= 0) return empty;
      const basicLogin = decoded.slice(0, colonIdx);
      const basicPwd   = decoded.slice(colonIdx + 1);
      const pwdHash    = phpCompatibleHash(basicLogin, basicPwd, db);
      uRows = (await execSql(pool, `SELECT role_def.id AS role_obj_id
         FROM \`${db}\` u
         JOIN \`${db}\` pwd ON pwd.up = u.id AND pwd.t = ${TYPE.PASSWORD} AND pwd.val = ?
         LEFT JOIN (\`${db}\` r CROSS JOIN \`${db}\` role_def)
           ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
         WHERE u.t = ${TYPE.USER} AND u.val = ? LIMIT 1`, [pwdHash, basicLogin], { label: 'getMenuForToken_select' })).rows;
    } else {
      uRows = (await execSql(pool, `SELECT role_def.id AS role_obj_id
         FROM \`${db}\` u
         JOIN \`${db}\` tok ON tok.up = u.id AND tok.t = ${TYPE.TOKEN} AND tok.val = ?
         LEFT JOIN (\`${db}\` r CROSS JOIN \`${db}\` role_def)
           ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
         WHERE u.t = ${TYPE.USER} LIMIT 1`, [token], { label: 'getMenuForToken_select' })).rows;
    }
    if (uRows && uRows.length > 0) {
      return buildMyrolemenu(pool, db, uRows[0].role_obj_id || null);
    }
  } catch (_e) { /* ignore */ }
  return empty;
}

/**
 * Build &main.&top_menu block.
 * PHP: index.php case "&top_menu" always includes "dict"/"Таблицы", and conditionally
 * "edit_types"/"Структура" and "dir_admin"/"Файлы" based on grants.
 * For the compat layer we always include all 3 items (matches full-access user).
 */
function buildTopMenu() {
  return {
    top_menu_href: ['dict', 'edit_types', 'dir_admin'],
    top_menu:      ['Таблицы', 'Структура', 'Файлы'],
  };
}

/**
 * PHP-compatible mutation response helper.
 * – JSON API requests (?JSON / ?JSON_DATA etc.): return JSON
 * – Plain form POSTs: redirect to next_act URL (mirrors PHP index.php lines 9169-9180)
 *
 * @param {object} req
 * @param {object} res
 * @param {string} db   - database name (for redirect URL)
 * @param {object} data - { id, obj, next_act, args, warnings, [extra] }
 */
function legacyRespond(req, res, db, data) {
  const { id, obj, next_act, args, warnings, ...extra } = data;

  if (isApiRequest(req)) {
    return res.json({ id, obj, next_act, args: args || '', warnings: warnings || '', ...extra });
  }

  // Non-JSON: PHP redirects to /{db}/{next_act}/{id}?{args}#{obj}
  // The form may override next_act via the request parameter
  const reqNextAct = req.body?.next_act || req.query?.next_act;
  const effectiveNextAct = reqNextAct || next_act || '';

  if (effectiveNextAct === 'nul') return res.send('');

  // Build redirect URL: /{db}/{next_act}/{id}[?args][#obj]
  const idPart  = id  ? `/${id}`   : '';
  const argPart = args && String(args).length ? `?${args}` : '';
  const hashPart = obj != null ? `#${obj}` : '';
  return res.redirect(`/${db}/${effectiveNextAct}${idPart}${argPart}${hashPart}`);
}

// Parse cookies for token handling
router.use(cookieParser());

// Parse multipart/form-data (for legacy PHP frontend)
// Using multer to handle form submissions without files.
// Skipped for upload routes which use their own disk-storage multer.
const upload = multer({ storage: multer.memoryStorage() });
router.use((req, res, next) => {
  // Skip global form parser for file-upload routes; they have their own multer
  if (/\/upload\b/.test(req.path)) return next();
  if (/\/_m_new(\/|$)/.test(req.path)) return next();
  if (/\/_m_save(\/|$)/.test(req.path)) return next();
  if (/\/_m_set(\/|$)/.test(req.path)) return next();
  upload.none()(req, res, next);
});

// Database connection pool (lazy initialization)
let pool = null;

/**
 * Get or create database connection pool
 */
function getPool() {
  if (!pool) {
    const config = {
      host: process.env.INTEGRAM_DB_HOST || process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.INTEGRAM_DB_PORT || process.env.MYSQL_PORT || '3306'),
      user: process.env.INTEGRAM_DB_USER || process.env.MYSQL_USER || 'root',
      password: process.env.INTEGRAM_DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
      // PHP connects to single MySQL database 'integram'; tables = integram "dbs"
      database: process.env.INTEGRAM_DB_NAME || 'integram',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    };

    pool = mysql.createPool(config);
    logger.info('[Legacy Compat] Database pool created', { host: config.host, port: config.port });
  }
  return pool;
}

/**
 * sendMail — general-purpose mail sender (PHP parity: smtpmail/mysendmail).
 *
 * Mirrors PHP smtpmail() + mysendmail() from index.php lines 7263-7368.
 * Translates SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and FROM_*
 * env vars into a nodemailer transport.
 *
 * If SMTP_HOST is not set, logs to console instead of sending (dev mode).
 *
 * @param {object} opts
 * @param {string}        opts.to          — recipient email address (required)
 * @param {string}        opts.subject     — email subject (required)
 * @param {string}        [opts.text]      — plain text body
 * @param {string}        [opts.html]      — HTML body
 * @param {string}        [opts.from]      — override "Name <addr>" sender
 * @param {Array}         [opts.attachments] — nodemailer attachments array
 * @param {string}        [opts.tag]       — log prefix tag, e.g. '[Legacy GetCode]'
 * @param {object}        [opts.devLog]    — extra fields to log in dev mode (no SMTP)
 * @returns {Promise<boolean>} true if sent (or logged in dev mode), false on error
 */
async function sendMail({ to, subject, text, html, from, attachments, tag = '[Mail]', devLog = {} }) {
  const smtpHostRaw = process.env.SMTP_HOST || 'ssl://smtp.yandex.ru';
  const smtpPort    = parseInt(process.env.SMTP_PORT || '465', 10);
  const smtpUser    = process.env.SMTP_USER    || 'abc@tryjob.ru';
  const smtpPass    = process.env.SMTP_PASSWORD || 'CoffeeClick';
  const fromEmail   = process.env.FROM_EMAIL    || smtpUser;
  const fromName    = process.env.FROM_NAME     || 'Integram';
  const smtpHost    = smtpHostRaw.replace(/^(ssl|tls):\/\//, '');
  const smtpSecure  = smtpHostRaw.startsWith('ssl://') || smtpPort === 465;

  const defaultFrom = `"${fromName}" <${fromEmail}>`;

  if (!process.env.SMTP_HOST) {
    logger.info(`${tag} (no SMTP configured — dev mode)`, { to, subject, ...devLog });
    return true;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost, port: smtpPort, secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });
    const mailOpts = {
      from: from || defaultFrom,
      to,
      subject,
    };
    if (html) mailOpts.html = html;
    if (text) mailOpts.text = text;
    if (attachments && attachments.length) mailOpts.attachments = attachments;
    await transporter.sendMail(mailOpts);
    logger.info(`${tag} email sent`, { to });
    return true;
  } catch (err) {
    logger.error(`${tag} SMTP error`, { to, err: err.message, ...devLog });
    return false;
  }
}

/**
 * sendOtpEmail — one-time-password email sender.
 * Wrapper around sendMail() for OTP codes.
 *
 * PHP message format (index.php lines 7732-7738):
 *   Subject: "Одноразовый пароль <email>"
 *   Body:    "Ваш код для входа: <XXXX>\r\n\r\n<unsubscribe footer>"
 */
async function sendOtpEmail(email, code, db, host) {
  const unsubUrl = `https://${host || 'localhost'}/${db}/register?optout=${encodeURIComponent(email)}`;
  const subject  = `Одноразовый пароль ${email}`;
  const text     = `Ваш код для входа: ${code.toUpperCase()}\r\n\r\nЕсли вы не хотите получать от нас писем, связанных с регистрацией ${email}, вы можете отписаться от оповещений:\r\n${unsubUrl}`;

  await sendMail({
    to: email,
    subject,
    text,
    tag: '[Legacy GetCode]',
    devLog: { email, code: code.toUpperCase() },
  });
}

// PHP SALT constant — must match integram-server/include/connection.php define("SALT", ...)
const PHP_SALT = process.env.INTEGRAM_PHP_SALT || 'DronedocSalt2025';

/**
 * PHP Salt() function equivalent
 * PHP: function Salt($u, $val) { global $z; $u=strtoupper($u); return SALT."$u$z$val"; }
 * General form: phpSalt(a, b, db) = SALT + a.toUpperCase() + db + b
 *
 * Call sites:
 *   Normal login:   phpSalt(token, db, db)        → xsrf($token, $z) where $z=db
 *   2FA checkcode:  phpSalt(token, email, db)      → xsrf($token, $u) where $u=email
 *   Secret auth:    phpSalt(secret, username, db)  → xsrf($tok, $username)
 *   Guest:          phpSalt("gtuoeksetn", "guest", db)
 */
function phpSalt(a, b, db) {
  return PHP_SALT + a.toUpperCase() + db + b;
}

/**
 * PHP-compatible password hashing (single SHA1 with Salt)
 * PHP: $pwd = sha1(Salt($u, $p))
 * where Salt($u, $p) = SALT + strtoupper($u) + $z(db) + $p
 */
function phpCompatibleHash(username, password, db) {
  const saltedValue = PHP_SALT + username.toUpperCase() + db + password;
  return crypto.createHash('sha1').update(saltedValue).digest('hex');
}

/**
 * Generate token (like PHP's md5(microtime(TRUE)))
 */
function generateToken() {
  const microtime = Date.now() / 1000;
  return crypto.createHash('md5').update(microtime.toString() + Math.random().toString()).digest('hex');
}

/**
 * Generate XSRF token matching PHP's xsrf() function exactly:
 * PHP: function xsrf($a, $b){ return substr(sha1(Salt($a, $b)), 0, 22); }
 * Salt($a, $b) = SALT + a.toUpperCase() + db + b
 *
 * @param {string} a     - first arg (token, secret, or "gtuoeksetn" for guest)
 * @param {string} b     - second arg (db for normal login, email for 2FA, username for secret)
 * @param {string} db    - database name (used as $z in PHP's global $z)
 */
function generateXsrf(a, b, db) {
  return crypto.createHash('sha1').update(phpSalt(a, b, db)).digest('hex').substring(0, 22);
}

/**
 * Refresh auth token and activity timestamp after authentication.
 * Port of PHP updateTokens() (index.php:363).
 *
 * Generates cryptographically random token and XSRF (32 bytes hex each),
 * updates or inserts the token row, creates or updates the XSRF row, and
 * updates the activity timestamp to current epoch seconds.
 *
 * @param {import('mysql2/promise').Pool} pool - MySQL connection pool
 * @param {string} db   - database (table) name
 * @param {object} row  - auth query result with at least:
 *   {number}      row.uid  - id of the user row (required)
 *   {number|null} row.tok  - id of the token row (null → insert)
 *   {number|null} row.xsrf - id of the XSRF row (null → insert)
 *   {number|null} row.act  - id of the activity row (null → insert)
 * @returns {Promise<{token: string, xsrf: string}>} the newly generated token and xsrf values
 */
async function updateTokens(pool, db, row) {
  const safeDb = sanitizeIdentifier(db);
  const token = crypto.randomBytes(32).toString('hex');
  const xsrf  = crypto.randomBytes(32).toString('hex');

  // Update or insert token row
  if (row.tok) {
    await execSql(pool,
      `UPDATE ${safeDb} SET val = ? WHERE id = ?`,
      [token, row.tok],
      { label: 'Update Token' }
    );
  } else {
    await execSql(pool,
      `INSERT INTO ${safeDb} (up, ord, t, val) VALUES (?, 1, ?, ?)`,
      [row.uid, TYPE.TOKEN, token],
      { label: 'Insert Token' }
    );
  }

  // Create or update XSRF row
  if (row.xsrf) {
    await execSql(pool,
      `UPDATE ${safeDb} SET val = ? WHERE id = ?`,
      [xsrf, row.xsrf],
      { label: 'Update XSRF' }
    );
  } else {
    await execSql(pool,
      `INSERT INTO ${safeDb} (up, ord, t, val) VALUES (?, 1, ?, ?)`,
      [row.uid, TYPE.XSRF, xsrf],
      { label: 'Insert XSRF' }
    );
  }

  // Update activity timestamp to current epoch seconds
  const nowSec = String(Date.now() / 1000);
  if (row.act) {
    await execSql(pool,
      `UPDATE ${safeDb} SET val = ? WHERE id = ?`,
      [nowSec, row.act],
      { label: 'Update Activity Timestamp' }
    );
  } else {
    await execSql(pool,
      `INSERT INTO ${safeDb} (up, ord, t, val) VALUES (?, 1, ?, ?)`,
      [row.uid, TYPE.ACTIVITY, nowSec],
      { label: 'Insert Activity Timestamp' }
    );
  }

  return { token, xsrf };
}

/**
 * Safe path resolution — prevents directory traversal including URL-encoded variants.
 * Resolves userInput relative to base and verifies result stays within base.
 */
function safePath(base, userInput) {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(base, userInput);
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    throw new Error('Invalid path');
  }
  return resolved;
}

/**
 * Extract locale-specific text from inline <t9n> translation tags in HTML.
 * PHP parity: index.php line 7245 — function localize($text).
 *
 * Format: <t9n>[RU]Русский текст[EN]English text</t9n>
 * Given locale="EN", returns the string with <t9n> blocks replaced by "English text".
 * If no <t9n> tags are present, returns the text unchanged.
 *
 * @param {string} text   - HTML string potentially containing <t9n> tags
 * @param {string} locale - locale code: 'RU', 'EN', etc.
 * @returns {string} text with <t9n> tags resolved to the requested locale
 */
function localize(text, locale) {
  if (!text || !text.includes('<t9n>')) return text || '';
  const loc = (locale || 'EN').toUpperCase();
  const re = new RegExp(`<t9n>(?:(?!</?t9n>).)*?\\[${loc}\\]((?:(?!\\[[A-Z]{2}\\])(?!</t9n>).)*)(?:\\[[A-Z]{2}\\](?:(?!</t9n>).)*)?</t9n>`, 'gs');
  // Two-pass: extract locale content, then strip any unmatched <t9n> blocks
  const result = text.replace(re, '$1');
  return result.replace(/<t9n>.*?<\/t9n>/gs, '');
}

/**
 * Port of PHP Parse_block() (index.php:7148).
 *
 * Recursively renders a template block tree (produced by makeTree / issue #301)
 * by substituting placeholder tokens with data values, global variables, and
 * recursively rendered child blocks.
 *
 * PHP globals mapped to function parameters:
 *   $blocks      -> blocks      (flat dict keyed by dot-paths, each with CONTENT / PARENT)
 *   $REPORT_DATA -> reportData  (dict keyed by block path -> array of row objects)
 *   $CUR_VARS    -> (local per-row binding)
 *
 * @param {object}  blocks      - Block tree from makeTree (flat dict, dot-path keys)
 * @param {string}  blockPath   - Current block dot-path (e.g. "&main" or "&main.detail")
 * @param {object}  reportData  - Dataset rows keyed by block path
 * @param {object}  globalVars  - Global template variables (db, user, token, etc.)
 * @param {number}  [depth=0]   - Current recursion depth (infinite-loop guard)
 * @param {object}  [options={}] - Additional options for PHP parity
 * @param {object}  [options.requestVars]  - $_GET/$_POST vars for {_request_.xxx} namespace
 * @param {object}  [options.parentVars]   - Parent block's current row vars for {_parent_.xxx}
 * @param {Function} [options.getBlockData] - Callback(blockPath) returning array of row objects
 * @returns {string} Rendered HTML for this block (all iterations concatenated)
 */
const MAX_PARSE_DEPTH = 100;

function parseBlock(blocks, blockPath, reportData, globalVars, depth = 0, options = {}) {
  if (depth > MAX_PARSE_DEPTH) {
    throw new Error(
      `Parse_block: maximum recursion depth (${MAX_PARSE_DEPTH}) exceeded at "${blockPath}"`
    );
  }

  const block = blocks[blockPath];
  if (!block || block.CONTENT == null) {
    return '';
  }

  const { requestVars, parentVars, getBlockData } = options;

  // 1. Get data rows for this block from reportData, with getBlockData fallback
  //    PHP calls Get_block_data() dynamically when data is not pre-populated.
  let rows = (reportData && reportData[blockPath]) || [];
  if (rows.length === 0 && typeof getBlockData === 'function') {
    const dynamicRows = getBlockData(blockPath);
    if (Array.isArray(dynamicRows)) {
      rows = dynamicRows;
    }
  }

  // Use dequeuing model (array_shift) — PHP uses while(!isset($end)) with array_shift.
  // Clone the array so we can shift from it without mutating the original.
  const queue = rows.length > 0 ? [...rows] : null;

  // 2. Identify child blocks — any block whose PARENT equals this blockPath
  const childPaths = Object.keys(blocks).filter(
    (key) => blocks[key].PARENT === blockPath
  );

  let output = '';

  // PHP dequeuing model: shift rows one at a time; if no rows, render once with empty row
  if (queue) {
    while (queue.length > 0) {
      const row = queue.shift();
      const rendered = _renderIteration(
        block, blocks, blockPath, row, globalVars, childPaths,
        reportData, depth, options
      );
      if (rendered === null) break; // early-exit on missing placeholder
      output += rendered;
    }
  } else {
    // Structural / layout blocks with no data — render once
    const rendered = _renderIteration(
      block, blocks, blockPath, {}, globalVars, childPaths,
      reportData, depth, options
    );
    if (rendered !== null) {
      output += rendered;
    }
  }

  // Root-level unescape: restore &#123; → { when processing &main or root block (depth === 0)
  if (depth === 0) {
    output = output.replace(/&#123;/g, '{');
  }

  return output;
}

/**
 * Render a single iteration of a block with the given row data.
 * Returns null if a data placeholder is missing (early-exit signal).
 * @private
 */
function _renderIteration(
  block, blocks, blockPath, row, globalVars, childPaths,
  reportData, depth, options
) {
  const { requestVars, parentVars, getBlockData } = options;
  let content = block.CONTENT;
  let missingPlaceholder = false;

  // 2a. Replace {colname} data placeholders from the current row.
  //     Also handles {_parent_.xxx} and {_request_.xxx} namespaces.
  //     HTML-escape `{` in data values → &#123; to prevent recursive placeholder injection.
  content = content.replace(/\{([^{}]+)\}/g, (match, key) => {
    // Skip namespace-prefixed placeholders handled separately
    if (key.startsWith('_global_.') || key.startsWith('_block_.')) {
      return match;
    }

    // {_parent_.varname} — resolve from parent block's variables
    if (key.startsWith('_parent_.')) {
      const parentKey = key.slice('_parent_.'.length);
      if (parentVars && Object.prototype.hasOwnProperty.call(parentVars, parentKey)) {
        const val = parentVars[parentKey];
        return val != null ? String(val).replace(/\{/g, '&#123;') : '';
      }
      return match;
    }

    // {_request_.varname} — resolve from $_GET/$_POST equivalent
    if (key.startsWith('_request_.')) {
      const reqKey = key.slice('_request_.'.length);
      if (requestVars && Object.prototype.hasOwnProperty.call(requestVars, reqKey)) {
        const val = requestVars[reqKey];
        return val != null ? String(val).replace(/\{/g, '&#123;') : '';
      }
      return match;
    }

    // Replace with row value if present, otherwise signal missing placeholder
    if (row && Object.prototype.hasOwnProperty.call(row, key)) {
      const val = row[key];
      // HTML-escape { in values to prevent recursive placeholder injection
      return val != null ? String(val).replace(/\{/g, '&#123;') : '';
    }

    // Early-exit: if row has data (non-empty) but this key is missing, break
    if (row && Object.keys(row).length > 0) {
      missingPlaceholder = true;
    }
    return match;
  });

  // Early-exit on missing data placeholder (PHP breaks on first missing)
  if (missingPlaceholder) {
    return null;
  }

  // 2b. Replace {_global_.varname} with global variables, with resolveBuiltIn fallback
  if (globalVars || true) {
    content = content.replace(/\{_global_\.([^{}]+)\}/g, (match, varName) => {
      if (globalVars && Object.prototype.hasOwnProperty.call(globalVars, varName)) {
        const val = globalVars[varName];
        return val != null ? String(val).replace(/\{/g, '&#123;') : '';
      }
      // BuiltIn() fallback: call resolveBuiltIn for system variables like today, now, etc.
      const builtInResult = resolveBuiltIn(`%${varName.toUpperCase()}%`, {}, '', 0, '', {});
      // If resolveBuiltIn resolved it (returned something different from the input), use it
      if (builtInResult !== `%${varName.toUpperCase()}%`) {
        return String(builtInResult).replace(/\{/g, '&#123;');
      }
      return match;
    });
  }

  // 2c. Recursively render child blocks and insert at {_block_.childpath} points
  //     Pass current row as parentVars so children can use {_parent_.xxx}
  for (const childPath of childPaths) {
    const childOptions = {
      ...options,
      parentVars: row, // current row becomes parent vars for child blocks
    };
    const childHtml = parseBlock(
      blocks, childPath, reportData, globalVars, depth + 1, childOptions
    );
    const insertionPoint = `{_block_.${childPath}}`;
    content = content.split(insertionPoint).join(childHtml);
  }

  return content;
}

/**
 * Render main.html template with PHP-style global variables.
 * PHP replaces {_global_.xxx} placeholders before serving the template.
 */
async function renderMainPage(db, token, locale) {
  const mainPage = path.join(legacyPath, 'templates/main.html');
  if (!fs.existsSync(mainPage)) return null;

  let html = fs.readFileSync(mainPage, 'utf8');

  // Fetch user data for template variables
  let user = '', userId = 0, xsrf = '', action = '';
  try {
    const pool = getPool();
    const { rows: rows } = await execSql(pool, `SELECT u.id uid, u.val uname, x.val xsrf_val
       FROM \`${db}\` u
       JOIN \`${db}\` tok ON tok.up = u.id AND tok.t = ${TYPE.TOKEN} AND tok.val = ?
       LEFT JOIN \`${db}\` x ON x.up = u.id AND x.t = ${TYPE.XSRF}
       WHERE u.t = ${TYPE.USER} LIMIT 1`, [token], { label: 'renderMainPage_select' });
    if (rows.length > 0) {
      userId = rows[0].uid;
      user   = rows[0].uname || '';
      xsrf   = rows[0].xsrf_val || generateXsrf(token, db, db);
    }
  } catch (e) {
    xsrf = generateXsrf(token, db, db);
  }

  const version = Date.now();

  // Replace {_global_.xxx} placeholders
  html = html
    .replace(/\{_global_\.z\}/g,       db)
    .replace(/\{_global_\.xsrf\}/g,    xsrf)
    .replace(/\{_global_\.token\}/g,   token)
    .replace(/\{_global_\.user_id\}/g, String(userId))
    .replace(/\{_global_\.user\}/g,    user)
    .replace(/\{_global_\.id\}/g,      String(userId))
    .replace(/\{_global_\.action\}/g,  action)
    .replace(/\{_global_\.version\}/g, String(version));

  // Remove PHP template loop blocks (leave empty arrays)
  html = html.replace(/<!--\s*Begin:[^>]*-->[^]*?<!--\s*End:[^>]*-->/g, '');

  // Resolve inline <t9n> translation tags (PHP parity: localize())
  html = localize(html, locale || 'RU');

  return html;
}

// PHP Type constants (matching index.php)
const TYPE = {
  // Base types
  HTML: 2,
  SHORT: 3,
  DATETIME: 4,
  GRANT: 5,
  PWD: 6,
  BUTTON: 7,
  CHARS: 8,
  DATE: 9,
  FILE: 10,
  BOOLEAN: 11,
  MEMO: 12,
  NUMBER: 13,
  SIGNED: 14,
  CALCULATABLE: 15,
  REPORT_COLUMN: 16,
  PATH: 17,

  // User types
  USER: 18,
  PASSWORD: 20,
  REPORT: 22,
  REP_COLS: 28,
  PHONE: 30,
  XSRF: 40,
  EMAIL: 41,
  ROLE: 42,
  REP_JOIN: 44,
  LEVEL: 47,
  MASK: 49,
  EXPORT: 55,
  DELETE: 56,

  ROLE_OBJECT: 116,
  ACTIVITY: 124,
  TOKEN: 125,
  SECRET: 130,

  REP_HREFS: 95,
  REP_URL: 97,
  REP_IFNULL: 113,
  REP_LIMIT: 134,
  REP_WHERE: 262,
  REP_ALIAS: 265,
  REP_JOIN_ON: 266,

  CONNECT: 226,
  SETTINGS: 269,
  DATABASE: 271,
  SETTINGS_TYPE: 271,
  SETTINGS_VAL: 273,
};

// Reverse mapping for base types (for Format_Val functions)
const REV_BASE_TYPE = {
  [TYPE.HTML]: 'HTML',
  [TYPE.SHORT]: 'SHORT',
  [TYPE.DATETIME]: 'DATETIME',
  [TYPE.GRANT]: 'GRANT',
  [TYPE.PWD]: 'PWD',
  [TYPE.BUTTON]: 'BUTTON',
  [TYPE.CHARS]: 'CHARS',
  [TYPE.DATE]: 'DATE',
  [TYPE.FILE]: 'FILE',
  [TYPE.BOOLEAN]: 'BOOLEAN',
  [TYPE.MEMO]: 'MEMO',
  [TYPE.NUMBER]: 'NUMBER',
  [TYPE.SIGNED]: 'SIGNED',
  [TYPE.CALCULATABLE]: 'CALCULATABLE',   // 15 – PHP $GLOBALS["basics"] includes these
  [TYPE.REPORT_COLUMN]: 'REPORT_COLUMN', // 16
  [TYPE.PATH]: 'PATH',                   // 17
};

// ── isDbVacant — database name uniqueness check (Issue #303) ────────────
// PHP: isDbVacant($db) — index.php:7493
// Returns true if `dbName` is not yet registered in the master table, false if taken.

/**
 * Check whether a database name is available (not already registered).
 *
 * Port of PHP isDbVacant($db) — queries the master management table
 * for an existing row with val=dbName AND t=DATABASE.
 *
 * @param {import('mysql2/promise').Pool} pool   - MySQL connection pool
 * @param {string} masterDb - Master/management table name (e.g. 'my')
 * @param {string} dbName   - Database name to check
 * @returns {Promise<boolean>} true if the name is available, false if taken
 */
async function isDbVacant(pool, masterDb, dbName) {
  const z = sanitizeIdentifier(masterDb);
  const { rows } = await execSql(
    pool,
    `SELECT 1 FROM ${z} WHERE val = ? AND t = ${TYPE.DATABASE} LIMIT 1`,
    [dbName],
    { label: 'Check DB name uniquity' }
  );
  return rows.length === 0;
}

// ── Mask constants & removeMasks (PHP index.php:7553-7557) ──────────────
const NOT_NULL_MASK = /:!NULL:/g;
const MULTI_MASK    = /:MULTI:/g;
const ALIAS_MASK    = /:ALIAS=[^:]*:/g;

/**
 * Strip mask markers from an attrs/val string.
 * PHP: removeMasks($attrs) — strips NOT_NULL_MASK, MULTI_MASK, ALIAS_MASK.
 */
function removeMasks(attrs) {
  if (!attrs) return '';
  return attrs
    .replace(NOT_NULL_MASK, '')
    .replace(MULTI_MASK, '')
    .replace(ALIAS_MASK, '');
}

// Format a raw DB value for PHP-compatible object list display
function formatObjVal(base, rawVal) {
  if (rawVal === null || rawVal === undefined) return '';
  const v = String(rawVal);
  if (base === 'DATE') {
    if (/^\d{8}$/.test(v)) return `${v.slice(6,8)}.${v.slice(4,6)}.${v.slice(0,4)}`;
    const num = parseFloat(v);
    if (!isNaN(num) && v.length > 8) {
      const d = new Date(Math.floor(num) * 1000);
      return `${String(d.getUTCDate()).padStart(2,'0')}.${String(d.getUTCMonth()+1).padStart(2,'0')}.${d.getUTCFullYear()}`;
    }
    return v;
  }
  if (base === 'DATETIME') {
    const num = parseFloat(v);
    if (!isNaN(num)) {
      const d = new Date(Math.floor(num) * 1000);
      const p = n => String(n).padStart(2, '0');
      return `${p(d.getUTCDate())}.${p(d.getUTCMonth()+1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
    }
    return v;
  }
  if (base === 'PWD') return '******';
  return v;
}

// HTML-escape special chars (PHP htmlspecialchars equivalent)
/**
 * Decode JSON-style \uXXXX escape sequences that PHP stores literally in DB
 * and then outputs verbatim into manually-built JSON strings, making the JSON
 * parser decode them as Unicode. Node.js JSON.stringify re-escapes the backslash,
 * so we must decode them first to match PHP's output.
 */
function decodeJsonEscapes(str) {
  if (!str || !str.includes('\\u')) return str;
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function htmlEsc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── BKI delimiter helpers (PHP index.php lines 1619-1634) ──────────────
// MaskDelimiters:   escape  \  →  \\   then  :  →  \:   then  ;  →  \;
function MaskDelimiters(v) {
  if (!v && v !== 0) return '';
  return String(v).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/;/g, '\\;');
}
// HideDelimiters:   \\  →  %5C   \:  →  %3A   \;  →  %3B   \,  →  %2C
function HideDelimiters(v) {
  if (!v && v !== 0) return '';
  return String(v).replace(/\\\\/g, '%5C').replace(/\\:/g, '%3A').replace(/\\;/g, '%3B').replace(/\\,/g, '%2C');
}
// UnHideDelimiters: reverse of HideDelimiters
function UnHideDelimiters(v) {
  if (!v && v !== 0) return '';
  return String(v).replace(/%5C/g, '\\\\').replace(/%3A/g, '\\:').replace(/%3B/g, '\\;').replace(/%2C/g, '\\,');
}
// UnMaskDelimiters: unhide first, then unescape  \\  →  \   \:  →  :   \;  →  ;
function UnMaskDelimiters(v) {
  if (!v && v !== 0) return '';
  const s = UnHideDelimiters(String(v));
  return s.replace(/\\;/g, ';').replace(/\\:/g, ':').replace(/\\\\/g, '\\');
}

// ── Semicolon escaping helpers (PHP index.php lines 3940-3947) ─────────
// Slash_semi:   \;  →  \$L3sH   (protect escaped semicolons before splitting)
function Slash_semi(str) {
  if (!str && str !== 0) return '';
  return String(str).replace(/\\;/g, '\\$L3sH');
}
// UnSlash_semi: \$L3sH  →  ;   (restore semicolons after splitting)
function UnSlash_semi(str) {
  if (!str && str !== 0) return '';
  return String(str).replace(/\\\$L3sH/g, ';');
}

// PHP GetSha(i) = sha1(Salt(z, i)) = sha1(SALT + z.toUpperCase() + z + i)
function fileGetSha(db, i) {
  return crypto.createHash('sha1').update(phpSalt(db, String(i), db)).digest('hex');
}

// Build PHP-compatible file download link for object list view
// PHP: <a target="_blank" href="/GetSubdir(id)/GetFilename(id).ext">filename</a>
function buildObjFileLink(db, rowId, val) {
  if (!val) return '';
  const fileId = Number(rowId);
  if (!fileId || isNaN(fileId)) return String(val);
  const ext = val.includes('.') ? val.split('.').pop() : '';
  const folderNum = Math.floor(fileId / 1000);
  const folder = `${folderNum}${fileGetSha(db, folderNum).slice(0, 8)}`;
  const fileNum = ('00' + fileId).slice(-3);
  const filename = `${fileNum}${fileGetSha(db, fileId).slice(0, 8)}`;
  return `<a target="_blank" href="/download/${db}/${folder}/${filename}.${ext}">${val}</a>`;
}

// Store for grants per request (thread-local simulation)
const grantStore = new Map();

// ============================================================================
// Grant/Permission System (Phase 4 - remaining 10%)
// ============================================================================

/**
 * Load grants for a user's role from database
 * Matches PHP's getGrants() function
 * @param {Object} pool - MySQL pool
 * @param {string} db - Database name
 * @param {number} roleId - User's role ID
 * @param {Object} [userCtx] - User context for BuiltIn resolution { username, uid, role, roleId, tzone, ip }
 * @returns {Object} grants object
 */
async function getGrants(pool, db, roleId, userCtx) {
  const grants = {};
  const z = sanitizeIdentifier(db);

  try {
    const query = `
      SELECT
        gr.val AS obj,
        COALESCE(def.val, '') AS lev,
        mask.val AS mask,
        exp.val AS exp,
        del.val AS del
      FROM ${z} gr
      LEFT JOIN (${z} lev CROSS JOIN ${z} def) ON lev.up = gr.id AND def.id = lev.t AND def.t = ${TYPE.LEVEL}
      LEFT JOIN ${z} mask ON mask.up = gr.id AND mask.t = ${TYPE.MASK}
      LEFT JOIN ${z} exp ON exp.up = gr.id AND exp.t = ${TYPE.EXPORT}
      LEFT JOIN ${z} del ON del.up = gr.id AND del.t = ${TYPE.DELETE}
      WHERE gr.up = ? AND gr.t = ${TYPE.ROLE_OBJECT}
    `;

    const { rows: rows } = await execSql(pool, query, [roleId], { label: 'getGrants_query' });

    for (const row of rows) {
      if (row.lev && row.lev.length > 0) {
        grants[row.obj] = row.lev;
      }
      if (row.mask && row.mask.length > 0) {
        if (!grants.mask) grants.mask = {};
        if (!grants.mask[row.obj]) grants.mask[row.obj] = {};
        // PHP parity: resolve [USER], [ROLE], etc. in mask values (index.php:1296-1310)
        const resolvedMask = userCtx ? resolveMaskBuiltIn(row.mask, userCtx) : row.mask;
        grants.mask[row.obj][resolvedMask] = row.lev;
      }
      if (row.exp && row.exp.length > 0) {
        if (!grants.EXPORT) grants.EXPORT = {};
        grants.EXPORT[row.obj] = '1';
      }
      if (row.del && row.del.length > 0) {
        if (!grants.DELETE) grants.DELETE = {};
        grants.DELETE[row.obj] = '1';
      }
    }

    logger.debug('[Grants] Loaded grants', { db, roleId, count: Object.keys(grants).length });
  } catch (error) {
    logger.error('[Grants] Error loading grants', { error: error.message, db, roleId });
  }

  return grants;
}

/**
 * Check grant for an object/type
 * Matches PHP's Check_Grant() function
 * @param {Object} pool - MySQL pool
 * @param {string} db - Database name
 * @param {Object} grants - Loaded grants object
 * @param {number} id - Object ID
 * @param {number} t - Type ID (default: 0)
 * @param {string} grant - Required grant level ("READ" or "WRITE", default: "WRITE")
 * @param {string} username - Current username (admin bypasses checks)
 * @returns {boolean} true if granted
 */
async function checkGrant(pool, db, grants, id, t = 0, grant = 'WRITE', username = '') {
  // Admin always has access
  if (username.toLowerCase() === 'admin') {
    return true;
  }

  // Check explicit grant for type
  if (t !== 0 && grants[t]) {
    if (grants[t] === grant || grants[t] === 'WRITE') {
      return true;
    }
    return false;
  }

  // Check explicit grant for object ID
  if (grants[id]) {
    if (grants[id] === grant || grants[id] === 'WRITE') {
      return true;
    }
    return false;
  }

  // Need to check parent chain
  try {
    let query;
    if (t === 0) {
      query = `
        SELECT
          obj.t,
          COALESCE(par.t, 1) AS par_typ,
          COALESCE(par.id, 1) AS par_id,
          COALESCE(arr.id, -1) AS arr,
          obj.val AS ref
        FROM ${db} obj
        LEFT JOIN ${db} par ON obj.up > 1 AND par.id = obj.up
        LEFT JOIN ${db} arr ON arr.up = par.t AND arr.t = obj.t
        WHERE obj.id = ?
        LIMIT 1
      `;
    } else if (id !== 1) {
      query = `
        SELECT
          obj.t,
          COALESCE(par.t, 1) AS par_typ,
          COALESCE(par.id, 1) AS par_id,
          COALESCE(arr.id, -1) AS arr,
          -1 AS ref
        FROM ${db} obj
        JOIN ${db} par ON obj.up > 1 AND (par.t = obj.up OR par.id = obj.up)
        LEFT JOIN ${db} arr ON arr.up = par.t AND arr.t = obj.t
        WHERE par.id = ? AND (obj.t = ? OR obj.id = ?)
        LIMIT 1
      `;
    } else {
      // First level object
      return grants[t] === grant || grants[t] === 'WRITE' || grants[1] === grant || grants[1] === 'WRITE';
    }

    const params = t === 0 ? [id] : [id, t, t];
    const { rows: rows } = await execSql(pool, query, params, { label: 'checkGrant_query' });

    if (rows.length > 0) {
      const row = rows[0];

      // Check object type
      if (grants[row.t]) {
        if (grants[row.t] === grant || grants[row.t] === 'WRITE') {
          return true;
        }
      }
      // Check array membership
      else if (grants[row.arr]) {
        if (grants[row.arr] === grant || grants[row.arr] === 'WRITE') {
          return true;
        }
      }
      // Check reference
      else if (grants[row.ref] && row.t !== TYPE.REP_COLS && row.t !== TYPE.ROLE_OBJECT) {
        if (grants[row.ref] === grant || grants[row.ref] === 'WRITE') {
          return true;
        }
      }
      // Check parent type
      else if (grants[row.par_typ]) {
        if (grants[row.par_typ] === grant || grants[row.par_typ] === 'WRITE') {
          return true;
        }
      }
      // Check parent ID
      else if (grants[row.par_id]) {
        if (grants[row.par_id] === grant || grants[row.par_id] === 'WRITE') {
          return true;
        }
      }
      // Recursively check parent
      else if (row.par_id > 1) {
        return await checkGrant(pool, db, grants, row.par_id, 0, grant, username);
      }
    }
  } catch (error) {
    logger.error('[Grants] Error checking grant', { error: error.message, db, id, t });
  }

  return false;
}

/**
 * Check grant to the file repository.
 * Matches PHP RepoGrant() (index.php:6826-6834).
 *
 * Logic:
 *   1. If grants[TYPE.FILE] is set explicitly → return that level (READ / WRITE)
 *   2. Else if the user is admin (username === db owner OR username === 'admin') → WRITE
 *   3. Otherwise → BARRED
 *
 * @param {Object} grants - Loaded grants object
 * @param {string} db - Database (schema) name — doubles as the owner username
 * @param {string} username - Current user's username
 * @returns {string} 'READ' | 'WRITE' | 'BARRED'
 */
function repoGrant(grants, db, username) {
  // 1. Explicit grant on the FILE base-type
  if (grants && grants[TYPE.FILE]) {
    return grants[TYPE.FILE]; // 'READ' or 'WRITE'
  }
  // 2. Admin / DB-owner override
  if (username && (username.toLowerCase() === 'admin' || username === db)) {
    return 'WRITE';
  }
  // 3. No access
  return 'BARRED';
}

/**
 * Check grant for first-level (root) children
 * Matches PHP's Grant_1level() function
 */
async function grant1Level(pool, db, grants, id, username = '') {
  if (username.toLowerCase() === 'admin') {
    return 'WRITE';
  }

  // Explicit rights
  if (grants[id]) {
    if (grants[id] === 'READ' || grants[id] === 'WRITE') {
      return grants[id];
    }
  }

  // ROOT rights
  if (grants[1]) {
    if (grants[1] === 'READ' || grants[1] === 'WRITE') {
      return grants[1];
    }
  }

  // Check parent of this as ref
  try {
    const query = `
      SELECT req.up
      FROM ${db} ref
      LEFT JOIN ${db} req ON req.t = ref.id
      WHERE ref.t = ? AND ref.up = 0
    `;
    const { rows: rows } = await execSql(pool, query, [id], { label: 'grant1Level_query' });

    for (const row of rows) {
      if (grants[row.up]) {
        if (grants[row.up] === 'READ' || grants[row.up] === 'WRITE') {
          return 'READ';
        }
      }
    }
  } catch (error) {
    logger.error('[Grants] Error in grant1Level', { error: error.message, db, id });
  }

  return false;
}

/**
 * Build SQL WHERE fragment from a mask pattern (simplified for mask checking).
 * Port of PHP Construct_WHERE() — only the subset needed by Fetch_WHERE_for_mask.
 * Called with key=typeId, mask=pattern, always with cur_typ=1 (fake) and join=false.
 * Returns raw WHERE string starting with " AND ".
 */
function constructWhereForMask(key, mask) {
  let value = mask;
  let NOT = '';
  let NOT_EQ = '';
  let EQ = '=';
  let NOT_flag = false;
  const params = [];

  // Handle ! prefix
  if (value.startsWith('!')) {
    NOT = 'NOT';
    NOT_EQ = '!';
    value = value.substring(1);
    NOT_flag = true;
  } else if (value.trimStart().startsWith('>=') || value.trimStart().startsWith('<=')) {
    NOT_EQ = value.trimStart().substring(0, 2);
    value = value.trimStart().substring(2);
    EQ = '';
  } else if (value.trim().startsWith('>') || value.trim().startsWith('<')) {
    NOT_EQ = value.trimStart().substring(0, 1);
    value = value.trimStart().substring(1);
    EQ = '';
  } else {
    NOT_EQ = '';
  }

  // @ prefix — ID match (parameterized)
  if (value.startsWith('@')) {
    const idVal = parseInt(value.substring(1).replace(/ /g, ''), 10);
    if (isNaN(idVal)) {
      throw new Error(`Invalid ID in mask: ${value}`);
    }
    params.push(idVal);
    return { sql: ` AND a${key}.id${NOT_EQ}${EQ}? `, params };
  }

  // % alone — NULL check
  if (value === '%') {
    const search_val = `IS ${NOT_flag ? '' : 'NOT '}NULL`;
    return { sql: ` AND a${key}.val ${search_val} `, params };
  }

  // Range: value1..value2 (parameterized)
  if (value.includes('..')) {
    const parts = value.split('..');
    const from = parseFloat(parts[0].replace(/ /g, ''));
    const to = parseFloat(parts[1].replace(/ /g, ''));
    if (!isNaN(from) && !isNaN(to)) {
      params.push(from, to);
      return { sql: ` AND a${key}.val BETWEEN ? AND ? `, params };
    }
  }

  // Parameterized value comparison
  let search_val;
  if (!value.includes('%')) {
    search_val = `${NOT_EQ}${EQ}?`;
    params.push(value);
  } else {
    search_val = `${NOT} LIKE ?`;
    params.push(value);
  }

  if (NOT_flag) {
    return { sql: ` AND (a${key}.val ${search_val} OR a${key}.val IS NULL) `, params };
  }
  return { sql: ` AND a${key}.val ${search_val} `, params };
}

/**
 * Build a parameterized SQL expression to test a value against a mask.
 * Port of PHP Fetch_WHERE_for_mask() (index.php:888-893).
 * Returns { sql, params } for use with pool.query(`SELECT ${sql}`, params).
 *
 * The SQL expression evaluates to 1 (match) or 0 (no match) when used in SELECT.
 *
 * @param {number} t - Type ID key
 * @param {string|null} val - Value to test
 * @param {string} mask - Mask pattern from grants
 * @returns {{ sql: string, params: Array }}
 */
function fetchWhereForMask(t, val, mask) {
  const { sql: whereSql, params: maskParams } = constructWhereForMask(t, mask);
  // Strip " AND " prefix (5 chars) to get a standalone expression
  const stripped = whereSql.substring(5);

  // The stripped SQL contains:
  // 1. References like a{t}.val or a{t}.id — replaced with ? and val pushed to params
  // 2. Existing ? placeholders from maskParams — interleaved in order
  //
  // We process left-to-right, building the final SQL and params array.
  const aliasRe = new RegExp(`a${t}\\.(val|id)`, 'g');
  const finalParams = [];
  let result = '';
  let cursor = 0;
  let maskParamIdx = 0;
  let aliasMatch;

  while ((aliasMatch = aliasRe.exec(stripped)) !== null) {
    // Segment between cursor and this alias may contain ? from maskParams
    const segment = stripped.substring(cursor, aliasMatch.index);
    for (const ch of segment) {
      if (ch === '?') {
        finalParams.push(maskParams[maskParamIdx++]);
      }
    }
    result += segment;
    // Replace alias reference with parameterized placeholder
    result += '?';
    finalParams.push(val === null || val === undefined ? null : String(val));
    cursor = aliasMatch.index + aliasMatch[0].length;
  }

  // Handle remaining text after last alias match
  const remaining = stripped.substring(cursor);
  for (const ch of remaining) {
    if (ch === '?') {
      finalParams.push(maskParams[maskParamIdx++]);
    }
  }
  result += remaining;

  return { sql: result, params: finalParams };
}

/**
 * Check value-level grant by mask.
 * Port of PHP Check_Val_granted() (index.php:921-966).
 * @param {Object} pool - MySQL pool
 * @param {string} db - Database name
 * @param {Object} grants - Loaded grants object
 * @param {number} t - Type ID to check masks for
 * @param {string} val - Value to check
 * @param {number} id - Object ID (default: 0)
 * @returns {string|boolean|undefined} grant level, true, 'BARRED', or undefined
 */
async function checkValGranted(pool, db, grants, t, val, id = 0) {
  if (!grants || !grants.mask || !grants.mask[t]) {
    return undefined;
  }

  let ok;
  for (const [mask, level] of Object.entries(grants.mask[t])) {
    if (level === '') continue;

    // Empty value check
    if (!String(val || '').length) {
      if (mask === '!%') {
        if (level === 'BARRED') {
          ok = 'BARRED';
          break;
        } else {
          ok = level;
        }
      } else {
        continue;
      }
    }

    // @ prefix — ID match (handled directly, not via SQL)
    if (mask.startsWith('@')) {
      const maskId = parseInt(mask.substring(1), 10);
      if (parseInt(id, 10) === maskId || parseInt(id, 10) === 0) {
        if (level !== 'BARRED') {
          ok = 'BARRED';
          break;
        }
        break;
      }
      continue;
    }

    // SQL mask check via fetchWhereForMask (parameterized)
    const { sql: maskSql, params: maskParams } = fetchWhereForMask(t, val, mask);
    if (maskSql === '') return undefined;

    try {
      const { rows: rows } = await execSql(pool, `SELECT ${maskSql}`, maskParams, { label: 'checkValGranted_select' });
      if (rows.length > 0) {
        const firstVal = rows[0][Object.keys(rows[0])[0]];
        if (firstVal) {
          if (level === 'BARRED') {
            ok = 'BARRED';
            break;
          } else {
            ok = level;
          }
        }
      }
    } catch (error) {
      logger.error('[Grants] Error in checkValGranted SQL', { error: error.message, db, t, mask });
    }
  }

  if (ok === undefined) {
    // PHP: return isset($GLOBALS["GRANTS"][$t]) ? isset($GLOBALS["GRANTS"][$t]) : "BARRED";
    return grants[t] ? true : 'BARRED';
  }

  if (ok === 'BARRED') {
    // PHP calls my_die() here — we return 'BARRED' and let the caller handle it
    return 'BARRED';
  }

  return ok;
}

/**
 * Check if a value is barred by mask-level write restrictions.
 * Port of PHP Val_barred_by_mask() (index.php:896-919).
 *
 * Returns true if the value is barred (should not be written), false otherwise.
 * Throws an error if a required mask exists but the value doesn't match any.
 *
 * @param {Object} pool - MySQL pool
 * @param {string} db - Database name
 * @param {Object} grants - Loaded grants object
 * @param {number} t - Type ID (requisite type) to check masks for
 * @param {string|null} val - Value to check
 * @returns {Promise<boolean>} true if barred, false if allowed
 */
async function valBarredByMask(pool, db, grants, t, val) {
  if (!grants || !grants.mask || !grants.mask[t]) {
    return false;
  }

  let reqMask = false;

  for (const [grant, mask] of Object.entries(grants.mask[t])) {
    logger.debug('[Grants] valBarredByMask checking', { t, grant, mask });

    if (mask === '') {
      // No level defined — required mask: value must match at least one such pattern
      reqMask = true;
      const { sql: grantSql, params: grantParams } = fetchWhereForMask(t, val, grant);
      try {
        const { rows: rows } = await execSql(pool, `SELECT ${grantSql}`, grantParams, { label: 'valBarredByMask_select' });
        if (rows.length > 0 && rows[0][Object.keys(rows[0])[0]]) {
          return false; // Value matches required mask — not barred
        }
      } catch (error) {
        logger.error('[Grants] Error in valBarredByMask SQL', { error: error.message, db, t, grant });
      }
    } else {
      // Level defined — check if value matches the level pattern
      const { sql: lvlSql, params: lvlParams } = fetchWhereForMask(t, val, mask);
      try {
        const { rows: rows } = await execSql(pool, `SELECT ${lvlSql}`, lvlParams, { label: 'valBarredByMask_select' });
        if (rows.length > 0 && rows[0][Object.keys(rows[0])[0]]) {
          return grant !== 'WRITE'; // Barred unless grant key is "WRITE"
        }
      } catch (error) {
        logger.error('[Grants] Error in valBarredByMask SQL', { error: error.message, db, t, mask });
      }
    }
  }

  if (reqMask) {
    // PHP calls my_die() — all required masks failed to match
    const err = new Error(`Not granted by requisite mask (${t})`);
    err.isMaskError = true;
    throw err;
  }

  return false;
}

/**
 * Check grant for report column operations.
 * Port of PHP CheckRepColGranted() (index.php:7476-7492).
 * @param {Object} pool - MySQL pool
 * @param {string} db - Database name
 * @param {Object} grants - Loaded grants object
 * @param {number} id - Object ID (type ID for the report column)
 * @param {number|string} level - 0 for READ, non-zero for WRITE
 * @param {string} username - Current username
 * @returns {boolean} true if granted, throws/returns error message if not
 */
async function checkRepColGranted(pool, db, grants, id, level = 0, username = '') {
  const { rows: rows } = await execSql(pool, `SELECT obj.up, req.id req FROM \`${db}\` obj
     LEFT JOIN (\`${db}\` req CROSS JOIN \`${db}\` par)
       ON req.t = obj.id AND par.up = 0 AND req.up = par.id
     WHERE obj.id = ?`, [id], { label: 'checkRepColGranted_select' });

  if (rows.length === 0) return true;
  const row = rows[0];

  if (level !== 0) {
    // WRITE check
    if (parseInt(row.up, 10) === 0) {
      const g = await grant1Level(pool, db, grants, id, username);
      if (!g) {
        return 'NOT_GRANTED';
      }
    } else {
      if (!await checkGrant(pool, db, grants, row.up, id, 'WRITE', username)) {
        return 'NOT_GRANTED';
      }
    }
  } else {
    // READ check
    const checkId = parseInt(row.up, 10) === 0 ? id : row.up;
    const g1 = await grant1Level(pool, db, grants, checkId, username);
    const g2 = row.req ? await grant1Level(pool, db, grants, row.req, username) : false;
    if (!g1 && !g2) {
      return 'NOT_GRANTED';
    }
  }

  return true;
}

// ============================================================================
// Value Formatting Functions (Phase 4 - remaining 10%)
// ============================================================================

/**
 * Format value for storage (input validation)
 * Matches PHP's Format_Val() function
 */
function formatVal(typeId, val, tzone = 0) {
  if (val === 'NULL' || val === null) {
    return val;
  }

  const baseType = REV_BASE_TYPE[typeId];
  if (!baseType) {
    return val;
  }

  switch (baseType) {
    case 'DATE':
      if (val && !val.startsWith('[') && !val.startsWith('_request_.')) {
        val = String(val).trim();
        // ISO format YYYY[-/.]MM[-/.]DD
        const isoMatch = val.match(/^(\d{4})[-\/.]?(\d{2})[-\/.]?(\d{2})/);
        if (isoMatch) {
          return isoMatch[1] + isoMatch[2] + isoMatch[3];
        }
        // DD/MM/YYYY format
        const parts = val.split(/[\/., ]/);
        const dy = parts[2] ? (parts[2].length === 4 ? parseInt(parts[2]) : 2000 + parseInt(parts[2])) : new Date().getFullYear();
        const dm = parts[1] ? parseInt(parts[1]) : new Date().getMonth() + 1;
        const dd = parseInt(parts[0]) || 1;
        return String(dy) + String(dm).padStart(2, '0') + String(dd).padStart(2, '0');
      }
      break;

    case 'NUMBER': {
      // PHP: if ($val != 0) $val = (int)$val;
      // PHP loose comparison: "" == 0, "abc" == 0, so only truly numeric non-zero values get cast.
      // NaN must not leak through — treat NaN and non-numeric input like PHP does (fall through).
      const numVal = parseInt(String(val).replace(/,/g, '.').replace(/ /g, ''), 10);
      if (!isNaN(numVal) && numVal !== 0) {
        return numVal;
      }
      break;
    }

    case 'BOOLEAN':
      if (val === '' || String(val).toLowerCase() === 'false' || val === '-1' || val === ' ') {
        return '';
      }
      return '1';

    case 'SIGNED': {
      // PHP: if ($val != 0) $val = (double)str_replace(",",".",$val);
      // Same NaN guard as NUMBER — non-numeric / empty strings fall through.
      const signedVal = parseFloat(String(val).replace(/,/g, '.').replace(/ /g, '').replace(/\u00A0/g, ''));
      if (!isNaN(signedVal) && signedVal !== 0) {
        return signedVal;
      }
      break;
    }

    case 'DATETIME':
      if (val && !String(val).startsWith('[')) {
        val = String(val).trim();
        if (parseInt(val) > 10000) {
          // Already a timestamp
          return parseInt(val) - tzone;
        }
        const parsed = Date.parse(val);
        if (!isNaN(parsed)) {
          return Math.floor(parsed / 1000) - tzone;
        }
      }
      break;
  }

  return val;
}

/**
 * Format value for display (output formatting)
 * Matches PHP's Format_Val_View() function
 */
function formatValView(typeId, val, tzone = 0) {
  if (val === '' || val === null) {
    return '';
  }

  const baseType = REV_BASE_TYPE[typeId];
  if (!baseType) {
    return val;
  }

  switch (baseType) {
    case 'DATE':
      if (val) {
        const valStr = String(val);
        if (valStr.length > 8) {
          // DATETIME stored as timestamp
          const date = new Date((parseInt(val) + tzone) * 1000);
          return date.toLocaleDateString('ru-RU');
        }
        // YYYYMMDD format
        return valStr.slice(6, 8) + '.' + valStr.slice(4, 6) + '.' + valStr.slice(0, 4);
      }
      break;

    case 'DATETIME':
      if (val) {
        const date = new Date((parseInt(val) + tzone) * 1000);
        return date.toLocaleString('ru-RU');
      }
      break;

    case 'BOOLEAN':
      return val ? 'X' : '';

    case 'NUMBER':
      if (val !== 0) {
        return String(parseInt(val));
      }
      break;

    case 'SIGNED':
      if (val !== 0) {
        return String(parseFloat(val));
      }
      break;

    case 'FILE': {
      // PHP: if val contains ":", format is "id:filename" — extract filename for display.
      // Actual link wrapping is done at call sites via buildObjFileLink().
      const valStr = String(val);
      if (valStr.includes(':')) {
        return valStr.slice(valStr.indexOf(':') + 1);
      }
      return valStr;
    }

    case 'PATH': {
      // PHP: val format is "id:filename.ext" — extract filename portion.
      // Full path construction (with getSubdir/getFilename) is handled at call sites.
      const valStr = String(val);
      if (valStr.includes(':')) {
        return valStr.slice(valStr.indexOf(':') + 1);
      }
      return valStr;
    }

    case 'GRANT':
      // PHP: 0 → TYPE_EDITOR, 1 → ALL_OBJECTS, 10 → FILES
      if (val == 0) return '*** Type editor ***';
      if (val == 1) return '*** All objects ***';
      if (val == 10) return '*** Files ***';
      return String(val);

    case 'REPORT_COLUMN':
      // PHP: "0" → CUSTOM_REP_COL ("Calculatable"); full DB lookup handled at call sites.
      if (val === '0' || val === 0) return 'Calculatable';
      return String(val);

    case 'PWD':
      // PHP: strlen($val) ? PASSWORDSTARS : ""
      return String(val).length > 0 ? '******' : '';
  }

  return val;
}

/**
 * Get alignment for column based on type
 * Matches PHP's Get_Align() function
 */
function getAlign(typeId) {
  const baseType = REV_BASE_TYPE[typeId];
  switch (baseType) {
    case 'PWD':
    case 'DATE':
    case 'BOOLEAN':
      return 'CENTER';
    case 'NUMBER':
    case 'SIGNED':
      return 'RIGHT';
    default:
      return 'LEFT';
  }
}

// ============================================================================
// Construct_WHERE — Full PHP-parity filter engine (Issue #215)
// Ports PHP Construct_WHERE (index.php:624-886) to Node.js.
// ============================================================================

/**
 * Format a date value for DB storage (YYYYMMDD).
 * Port of PHP Format_Val() for DATE type only.
 *   dd.mm.yyyy / dd/mm/yyyy → yyyymmdd
 *   yyyy-mm-dd / yyyy/mm/dd → yyyymmdd
 */
function formatDateForStorage(val) {
  if (!val || val === '' || val === 'NULL') return val;
  val = String(val).trim();
  if (val.startsWith('[') || val.startsWith('_request_.')) return val;
  // ISO: YYYY[-/.]MM[-/.]DD
  const iso = val.match(/^(\d{4})[-\/.]?(\d{2})[-\/.]?(\d{2})/);
  if (iso) return iso[1] + iso[2] + iso[3];
  // dd/mm/yyyy or dd.mm.yyyy etc
  const parts = val.replace(/[.,\s]/g, '/').split('/');
  const dd = parseInt(parts[0], 10);
  const mm = parts[1] ? parseInt(parts[1], 10) : new Date().getMonth() + 1;
  const rawYr = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
  const dy = String(parts[2] || '').length === 4 ? rawYr : 2000 + rawYr;
  return String(dy) + String(mm).padStart(2, '0') + String(dd).padStart(2, '0');
}

/**
 * Core filter engine — port of PHP Construct_WHERE().
 *
 * @param {string|number} key   - Requisite type ID being filtered
 * @param {object} filter       - {F: 'value', FR: 'from', TO: 'to'}
 * @param {string|number} curTyp - Parent type ID (main object type)
 * @param {string|number|false} joinReq - Requisite ID for JOIN context, or false/0
 * @param {object} ctx          - { revBT, refTyps, multi, db }
 *   revBT   — { [typeId]: 'DATE'|'NUMBER'|... } (maps type IDs to base type names)
 *   refTyps — { [typeId]: refTargetTypeId } (reference type targets)
 *   multi   — Set or object of array/multi type IDs
 *   db      — database name
 * @returns {{ where: string, join: string, params: any[], distinct: boolean }}
 */
function constructWhere(key, filter, curTyp, joinReq, ctx) {
  key = String(key);
  curTyp = String(curTyp);
  const join = joinReq && joinReq !== '0' && joinReq !== 0;
  const db = ctx.db || '';
  const z = db ? sanitizeIdentifier(db) : 'db';
  let whereStr = '';
  let joinStr = '';
  const params = [];
  let distinct = false;

  if (ctx.multi && (ctx.multi instanceof Set ? ctx.multi.has(key) : ctx.multi[key])) {
    distinct = true;
  }

  for (const f of Object.keys(filter)) {
    let value = String(filter[f]);
    // PHP parity (index.php:535-558): USE INDEX (PRIMARY) hint for CROSS JOINs
    // when the filter is non-selective (negation, wildcard, or empty).
    const useIdx = hintNeeded(String(filter[f])) ? ' USE INDEX (PRIMARY)' : '';
    let NOT_flag = false;
    let NOT = '';
    let NOT_EQ = '';
    let EQ = '=';
    let LTGT = false;

    // Parse prefix operators
    if (value.startsWith('!')) {
      NOT = 'NOT';
      NOT_EQ = '!';
      value = value.slice(1);
      NOT_flag = true;
    } else if (/^\s*(>=|<=)/.test(value)) {
      const m = value.match(/^\s*(>=|<=)/);
      NOT_EQ = m[1];
      value = value.replace(/^\s*(>=|<=)/, '');
      EQ = '';
    } else if (/^\s*[><]/.test(value)) {
      const m = value.match(/^\s*([><])/);
      NOT_EQ = m[1];
      LTGT = true;
      value = value.replace(/^\s*[><]/, '');
      EQ = '';
    }

    // resolveBuiltIn substitution (needs user context; skip if unavailable)
    if (ctx.user) {
      value = resolveBuiltIn(value, ctx.user, db, ctx.tzone || 0, '', ctx.reqHeaders || {});
    }

    let search_val = '';
    let inFlag = false;
    let inIDFlag = false;

    if (value === '%') {
      // NULL check: % means IS NOT NULL; !% means IS NULL
      search_val = `IS ${NOT_flag ? '' : 'NOT '}NULL`;
    } else if (/^\s*IN\s*\(/i.test(value) && value.trimEnd().endsWith(')')) {
      // IN(1,2,3)
      inFlag = true;
      const inner = value.replace(/^\s*IN\s*\(/i, '').slice(0, -1);
      const items = inner.split(',').map(s => s.trim());
      const placeholders = items.map(() => '?').join(',');
      search_val = `${NOT} IN (${placeholders})`;
      params.push(...items);
    } else if (/^\s*@IN\s*\(/i.test(value) && value.trimEnd().endsWith(')')) {
      // @IN(1,2,3) — ID-based IN
      inIDFlag = true;
      const inner = value.replace(/^\s*@IN\s*\(/i, '').slice(0, -1);
      const items = inner.split(',').map(s => s.trim());
      for (const v of items) {
        if (!/^\d+$/.test(v)) {
          throw new Error('Non-numeric IDs are not allowed');
        }
      }
      const placeholders = items.map(() => '?').join(',');
      search_val = `${NOT} IN (${placeholders})`;
      params.push(...items.map(Number));
      EQ = '';
    } else {
      // Standard value comparison
      if (!value.includes('%')) {
        search_val = `${NOT_EQ}${EQ}?`;
        params.push(value);
      } else {
        search_val = `${NOT} LIKE ?`;
        params.push(value);
      }
    }

    // ── @-ID search: @999 or !@999 ──
    if (ctx.revBT && ctx.revBT[key] === 'ARRAY') {
      distinct = true;
    }

    if (value.startsWith('@') && !inIDFlag) {
      // Single ID search
      const idVal = parseInt(value.slice(1).replace(/ /g, ''), 10);
      if (key === curTyp) {
        whereStr += ` AND vals.id${NOT_EQ}${EQ}?`;
        params.push(idVal);
      } else {
        if (ctx.revBT && ctx.revBT[key] === 'ARRAY') distinct = true;
        let joinTable, joinCond;
        if (NOT_flag) {
          if (ctx.refTyps && ctx.refTyps[key]) {
            joinTable = `LEFT JOIN (${z} r${key} CROSS JOIN ${z} a${key}${useIdx}) ON r${key}.up=vals.id AND a${key}.t=${ctx.refTyps[key]}`;
            joinCond = ` AND r${key}.t=a${key}.id AND r${key}.val=?`;
            params.push(joinReq);
          } else {
            joinTable = `LEFT JOIN ${z} a${key} ON a${key}.up=vals.id AND a${key}.t=?`;
            joinCond = '';
            params.push(parseInt(key, 10));
          }
          whereStr += ` AND (a${key}.id!=? OR a${key}.id IS NULL)`;
          params.push(idVal);
        } else {
          if (ctx.refTyps && ctx.refTyps[key]) {
            joinTable = ` JOIN (${z} r${key} CROSS JOIN ${z} a${key}${useIdx}) ON r${key}.up=vals.id AND r${key}.t=a${key}.id AND r${key}.val=?`;
            joinCond = ` AND r${key}.t=?`;
            params.push(joinReq, idVal);
          } else {
            joinTable = ` JOIN ${z} a${key} ON a${key}.up=vals.id`;
            joinCond = ` AND a${key}.id=?`;
            params.push(parseInt(key, 10));
            // push idVal for the WHERE
          }
          whereStr += ` AND a${key}.id=?`;
          params.push(idVal);
        }
        if (join && !joinStr.includes(`a${key}`)) {
          joinStr += `${joinTable}${joinCond}`;
        }
      }
      break;
    }

    if (inIDFlag) {
      // @IN() already handled search_val; apply to id column
      if (key === curTyp) {
        whereStr += ` AND vals.id ${search_val}`;
      } else {
        let joinTable, joinCond;
        if (NOT_flag) {
          if (ctx.refTyps && ctx.refTyps[key]) {
            joinTable = `LEFT JOIN (${z} r${key} CROSS JOIN ${z} a${key}${useIdx}) ON r${key}.up=vals.id AND a${key}.t=${ctx.refTyps[key]}`;
            joinCond = ` AND r${key}.t=a${key}.id AND r${key}.val=?`;
            params.push(joinReq);
          } else {
            joinTable = `LEFT JOIN ${z} a${key} ON a${key}.up=vals.id AND a${key}.t=?`;
            joinCond = '';
            params.push(parseInt(key, 10));
          }
          whereStr += ` AND (a${key}.id ${search_val} OR a${key}.id IS NULL)`;
        } else {
          if (ctx.refTyps && ctx.refTyps[key]) {
            joinTable = ` JOIN (${z} r${key} CROSS JOIN ${z} a${key}${useIdx}) ON r${key}.up=vals.id AND r${key}.t=a${key}.id AND r${key}.val=?`;
            joinCond = ` AND r${key}.t ${search_val}`;
            params.push(joinReq);
          } else {
            joinTable = ` JOIN ${z} a${key} ON a${key}.up=vals.id`;
            joinCond = '';
          }
          whereStr += ` AND a${key}.id ${search_val}`;
        }
        if (join && !joinStr.includes(`a${key}`)) {
          joinStr += `${joinTable}${joinCond}`;
        }
      }
      break;
    }

    // ── Type-aware WHERE construction ──
    if (ctx.refTyps && ctx.refTyps[key]) {
      // Reference type — CROSS JOIN pattern (PHP parity: USE INDEX hint when non-selective filter)
      if (join) {
        const jt = ` LEFT JOIN (${z} r${key} CROSS JOIN ${z} a${key}${useIdx}) ON r${key}.up=vals.id AND r${key}.t=a${key}.id AND r${key}.val=? AND a${key}.t=?`;
        if (!joinStr.includes(`a${key}`)) {
          joinStr += jt;
          params.push(joinReq, parseInt(ctx.refTyps[key], 10));
        }
      }
      if (NOT_flag) {
        whereStr += ` AND (a${key}.val ${search_val} OR a${key}.val IS NULL)`;
      } else {
        whereStr += ` AND a${key}.val ${search_val}`;
      }
    } else {
      const baseType = (ctx.revBT && ctx.revBT[key]) || 'SHORT';

      // DATE/DATETIME: format values for storage
      const isDate = baseType === 'DATE';
      if ((baseType === 'DATE' || baseType === 'DATETIME') && value !== '%') {
        value = formatDateForStorage(value);
      }

      if (baseType === 'DATE' || baseType === 'DATETIME' ||
          baseType === 'NUMBER' || baseType === 'SIGNED') {
        // Numeric/date types — range support

        // ".." range syntax: 100..500 → BETWEEN
        if (value.includes('..') && value.indexOf('..') > 0 && (filter.FR !== undefined || filter.TO === undefined)) {
          const rangeParts = value.split('..');
          const v0 = parseFloat(String(rangeParts[0]).replace(/ /g, ''));
          const v1 = parseFloat(String(rangeParts[1]).replace(/ /g, ''));
          if (!isNaN(v0) && !isNaN(v1)) {
            if (key === curTyp) {
              whereStr += ` AND vals.val BETWEEN ? AND ?`;
            } else {
              if (join) {
                const jt = ` JOIN ${z} a${key} ON a${key}.up=vals.id AND a${key}.t=?`;
                if (!joinStr.includes(`a${key}`)) {
                  joinStr += jt;
                  params.push(parseInt(key, 10));
                }
              }
              whereStr += ` AND a${key}.val BETWEEN ? AND ?`;
            }
            params.push(v0, v1);
            break;
          }
        }

        // Strip spaces from numeric values
        const numericClean = parseFloat(String(value).replace(/ /g, ''));
        if (numericClean !== 0 && !isNaN(numericClean)) {
          value = String(value).replace(/ /g, '');
        }

        // Single-border or exact match (no full range)
        if (filter.TO === undefined || filter.FR === undefined || value === '%') {
          if (key === curTyp) {
            if (inFlag) {
              whereStr += ` AND vals.val ${search_val}`;
            } else if (value === '%') {
              whereStr += ` AND vals.val ${search_val}`;
            } else if (!value.includes('%')) {
              whereStr += ` AND vals.val${NOT_EQ}${EQ}?`;
              // Re-push the formatted value (remove old unformatted one)
              params.pop(); // remove old value pushed in standard section
              params.push(isDate ? value : value);
            } else {
              whereStr += ` AND vals.val ${NOT} LIKE ?`;
            }
          } else {
            const joinTable = `LEFT JOIN ${z} a${key} ON a${key}.up=vals.id AND a${key}.t=?`;
            if (join && !joinStr.includes(`a${key}`)) {
              joinStr += ` ${joinTable}`;
              params.push(parseInt(key, 10));
            }
            if (value === '%') {
              whereStr += ` AND a${key}.val ${search_val}`;
            } else if (!value.includes('%')) {
              if (NOT_flag) {
                if (inFlag) {
                  whereStr += ` AND (a${key}.val ${search_val} OR a${key}.val IS NULL)`;
                } else {
                  whereStr += ` AND (a${key}.val!=? OR a${key}.val IS NULL)`;
                  params.pop(); // remove old
                  params.push(value);
                }
              } else {
                if (inFlag) {
                  whereStr += ` AND a${key}.val ${search_val}`;
                } else if (!isNaN(parseFloat(value))) {
                  whereStr += ` AND a${key}.val${NOT_EQ}${EQ}?`;
                  params.pop();
                  params.push(value);
                } else {
                  whereStr += ` AND a${key}.val=?`;
                  params.pop();
                  params.push(value);
                }
              }
            } else {
              if (NOT_flag) {
                whereStr += ` AND (a${key}.val NOT LIKE ? OR a${key}.val IS NULL)`;
              } else {
                whereStr += ` AND a${key}.val LIKE ?`;
              }
            }
          }
        } else {
          // Range filter with FR / TO
          let rangeVal;
          if (isDate) {
            rangeVal = value;  // already formatted
          } else if (!value.includes('[') && !value.includes('_')) {
            rangeVal = parseFloat(String(value).replace(/ /g, ''));
          } else {
            rangeVal = value;
          }

          if (f === 'FR') {
            if (key === curTyp) {
              whereStr += ` AND vals.val>=?`;
              params.pop(); // remove standard push
              params.push(rangeVal);
            } else {
              const jt = `JOIN ${z} a${key} ON a${key}.up=vals.id AND a${key}.t=?`;
              if (join && !joinStr.includes(`a${key}`)) {
                joinStr += ` ${jt}`;
                params.push(parseInt(key, 10));
              }
              if (baseType === 'NUMBER' || baseType === 'SIGNED') {
                whereStr += ` AND CAST(a${key}.val AS DECIMAL)>=CAST(? AS DECIMAL)`;
              } else {
                whereStr += ` AND a${key}.val>=?`;
              }
              params.pop();
              params.push(rangeVal);
            }
          } else if (f === 'TO') {
            if (key === curTyp) {
              whereStr += ` AND vals.val<=?`;
              params.pop();
              params.push(rangeVal);
            } else {
              whereStr += ` AND a${key}.val<=?`;
              params.pop();
              params.push(rangeVal);
            }
          }
        }
      } else {
        // DEFAULT: SHORT, CHARS, HTML, etc.
        if (key === curTyp) {
          whereStr += ` AND vals.val ${search_val}`;
        } else {
          if (baseType === 'ARRAY') distinct = true;
          const joinTable = `LEFT JOIN ${z} a${key} ON a${key}.up=vals.id AND a${key}.t=?`;
          if (join && !joinStr.includes(`a${key}`)) {
            joinStr += ` ${joinTable}`;
            params.push(parseInt(key, 10));
          }
          if (NOT_flag) {
            whereStr += ` AND (a${key}.val ${search_val} OR a${key}.val IS NULL)`;
          } else {
            whereStr += ` AND a${key}.val ${search_val}`;
          }
        }
      }
    }
  }

  return { where: whereStr, join: joinStr, params, distinct };
}

// ============================================================================
// buildPostFields — multipart/form-data builder for connector POST (PHP parity)
// PHP: build_post_fields() — index.php lines 3883–3911
// Parses URL-encoded POST body, detects file references (=@/path or =@http://),
// downloads remote files or reads local uploads, returns FormData-ready object.
// Used by _connect and report curl_exec when POST data contains file references.
// ============================================================================

/**
 * Build multipart/form-data fields from a URL-encoded POST string.
 *
 * PHP parity: build_post_fields($data) — index.php:3883-3911
 *
 * The PHP function:
 *   1. Splits the data on "&"
 *   2. For each key=value pair, checks if value starts with "@"
 *   3. If "@/upload_dir/..." → local file upload via curl_file_create
 *   4. If "@http..." → downloads the remote file to a temp path, then curl_file_create
 *   5. Otherwise, just a plain string value
 *
 * In Node.js we return a FormData instance (global in Node 20+, undici fallback)
 * that can be passed directly to fetch() as the body.
 *
 * @param {string} data - URL-encoded POST string, e.g. "key1=val1&file=@/download/db/photo.jpg"
 * @param {string} db   - Database name (for resolving local upload paths)
 * @param {number} [userId=0] - Current user ID (for temp file naming)
 * @returns {Promise<FormData>} FormData ready to be used as fetch() body
 */
async function buildPostFields(data, db, userId = 0) {
  // Node.js 20+ has global FormData and File; fall back to undici for older runtimes
  const _FormData = typeof FormData !== 'undefined' ? FormData : (await import('undici')).FormData;
  const _File = typeof File !== 'undefined' ? File : (await import('undici')).File;
  const formData = new _FormData();
  const pairs = data.split('&');
  let tempIdx = 0;

  const uploadBase = path.join(legacyPath, 'download', db);

  for (const pair of pairs) {
    const eqPos = pair.indexOf('=');
    if (eqPos === -1) continue;

    const key = decodeURIComponent(pair.substring(0, eqPos));
    let val = decodeURIComponent(pair.substring(eqPos + 1));

    if (val.startsWith('@')) {
      // File reference — strip the "@"
      const filePath = val.substring(1);

      // Extract filename from path (last segment)
      const fileName = filePath.split('/').pop();

      if (filePath.startsWith('/download/') || filePath.startsWith('download/')) {
        // Local file upload — resolve relative to legacy server root
        // PHP: if(strpos($v, "/".UPLOAD_DIR) === 0) → local file
        const localPath = filePath.startsWith('/')
          ? path.join(legacyPath, filePath)
          : path.join(legacyPath, filePath);

        if (!fs.existsSync(localPath)) {
          throw new Error(`File not found ${localPath}`);
        }
        const fileBuffer = fs.readFileSync(localPath);
        const file = new _File([fileBuffer], fileName);
        formData.set(key, file, fileName);
      } else if (filePath.toLowerCase().startsWith('http')) {
        // Remote file — download to temp, then attach
        // PHP: file_put_contents(UPLOAD_DIR.$localTemp, file_get_contents($v))
        const localTemp = `tmp_${tempIdx++}_${userId}`;
        const tempPath = path.join(uploadBase, localTemp);

        // Ensure upload directory exists
        fs.mkdirSync(uploadBase, { recursive: true });

        const response = await fetch(filePath);
        if (!response.ok) {
          throw new Error(`Failed to download file from ${filePath}: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Write temp file (PHP parity: file_put_contents)
        fs.writeFileSync(tempPath, buffer);

        const file = new _File([buffer], fileName);
        formData.set(key, file, fileName);
      } else {
        // Not a valid file path — PHP dies with "Forbidden path"
        throw new Error(`Forbidden path ${filePath}, use http(s) or /download/`);
      }
    } else {
      // Plain string value
      formData.set(key, val);
    }
  }

  logger.debug('[buildPostFields] Built form data', {
    db,
    fieldCount: [...formData.keys()].length,
  });

  return formData;
}

/**
 * Check if a URL-encoded POST body contains file references that require
 * multipart/form-data handling (PHP parity: index.php line 3440).
 *
 * PHP: strpos($post, "=@/") || strpos($post, "=@http")
 *
 * @param {string} postData - URL-encoded POST string
 * @returns {boolean} true if multipart handling is needed
 */
function needsMultipartPost(postData) {
  if (!postData || typeof postData !== 'string') return false;
  return postData.includes('=@/') || postData.includes('=@http');
}

// ============================================================================
// Phase 1 — New Helper Functions (PHP parity)
// ============================================================================

/**
 * Legacy auth middleware — centralizes token-based authentication.
 * PHP checks auth inline in every handler; this middleware does it once.
 *
 * Populates req.legacyUser = {uid, username, xsrf, role, roleId, grants}
 * Returns 401 on failure.
 */
async function legacyAuthMiddleware(req, res, next) {
  const db = req.params.db;
  const locale = getLocale(req, db);
  if (!db || !isValidDbName(db)) {
    return res.status(401).json([{ error: t9n('invalid_database', locale) }]);
  }

  const token = extractToken(req, db);

  try {
    const pool = getPool();

    // --- Attempt token-based authentication ---
    if (token) {
      const { rows: rows } = await execSql(pool, `SELECT u.id uid, u.val uname, xsrf.val xsrf_val,
                role_def.val role_val, role_def.id roleId
         FROM ${db} u
         JOIN ${db} tok ON tok.up=u.id AND tok.t=${TYPE.TOKEN} AND tok.val=?
         LEFT JOIN ${db} xsrf ON xsrf.up=u.id AND xsrf.t=${TYPE.XSRF}
         LEFT JOIN (${db} r CROSS JOIN ${db} role_def)
           ON r.up=u.id AND role_def.id=r.t AND role_def.t=${TYPE.ROLE}
         WHERE u.t=${TYPE.USER}
         LIMIT 1`, [token], { label: 'legacyAuthMiddleware_select' });

      if (rows.length > 0) {
        const user = rows[0];
        const xsrf = user.xsrf_val || generateXsrf(token, db, db);
        const roleId = user.roleId || 0;
        const grants = roleId ? await getGrants(pool, db, roleId, {
          username: user.uname, uid: user.uid, role: (user.role_val || '').toLowerCase(), roleId,
        }) : {};

        req.legacyUser = {
          uid: user.uid,
          username: user.uname,
          xsrf,
          role: (user.role_val || '').toLowerCase(),
          roleId,
          grants,
        };

        return next();
      }
    }

    // --- Guest fallback (PHP parity: lines 1213–1243) ---
    // When no valid token/auth is provided, look for a 'guest' user in the DB.
    // PHP uses hardcoded token "gtuoeksetn" and generates xsrf via xsrf("gtuoeksetn","guest").
    const GUEST_TOKEN = 'gtuoeksetn';
    const { rows: guestRows } = await execSql(pool, `SELECT u.id uid, u.val uname, tok.val tok_val, tok.id tok_id,
              xsrf.id xsrf_id, role_def.id roleId, role_def.val role_val
       FROM ${db} u
       LEFT JOIN ${db} tok ON tok.up=u.id AND tok.t=${TYPE.TOKEN}
       LEFT JOIN ${db} xsrf ON xsrf.up=u.id AND xsrf.t=${TYPE.XSRF}
       LEFT JOIN (${db} r CROSS JOIN ${db} role_def)
         ON r.up=u.id AND role_def.id=r.t AND role_def.t=${TYPE.ROLE}
       WHERE u.t=${TYPE.USER} AND u.val='guest'
       LIMIT 1`, [], { label: 'legacyAuthMiddleware_select' });

    if (guestRows.length > 0) {
      const guest = guestRows[0];
      const guestXsrf = generateXsrf(GUEST_TOKEN, 'guest', db);

      // Ensure the guest user has a token row (PHP: Insert if missing)
      if (!guest.tok_val) {
        await execSql(pool, `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 0, ${TYPE.TOKEN}, ?)`, [guest.uid, GUEST_TOKEN], { label: 'legacyAuthMiddleware_insert' });
      }

      // Ensure the guest user has an xsrf row (PHP: Insert if missing)
      if (!guest.xsrf_id) {
        await execSql(pool, `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 0, ${TYPE.XSRF}, ?)`, [guest.uid, guestXsrf], { label: 'legacyAuthMiddleware_insert' });
      } else {
        await execSql(pool, `UPDATE ${db} SET val=? WHERE id=?`, [guestXsrf, guest.xsrf_id], { label: 'legacyAuthMiddleware_update' });
      }

      const roleId = guest.roleId || 0;
      const grants = roleId ? await getGrants(pool, db, roleId, {
        username: 'guest', uid: guest.uid, role: (guest.role_val || '').toLowerCase(), roleId,
      }) : {};

      req.legacyUser = {
        uid: guest.uid,
        username: 'guest',
        xsrf: guestXsrf,
        role: (guest.role_val || '').toLowerCase(),
        roleId,
        grants,
        isGuest: true,
      };

      // Set guest cookie (PHP: 30-day expiry via COOKIES_EXPIRE)
      res.cookie(db, GUEST_TOKEN, { maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' });

      return next();
    }

    // No guest user defined — reject
    return res.status(401).json([{ error: t9n(token ? 'invalid_token' : 'auth_required', locale) }]);
  } catch (error) {
    logger.error({ error: error.message, db }, '[legacyAuthMiddleware] Error');
    return res.status(401).json([{ error: t9n('auth_failed', locale) }]);
  }
}

/**
 * Legacy XSRF check middleware.
 * For POST requests: check req.body._xsrf === req.legacyUser.xsrf
 * Returns error with HTTP 200 matching PHP my_die() behavior.
 *
 * PHP parity: PHP checks $_POST["_xsrf"] === $_SESSION["xsrf"] in every write handler.
 */
function legacyXsrfCheck(req, res, next) {
  if (req.method !== 'POST') {
    return next();
  }

  const xsrf = req.legacyUser && req.legacyUser.xsrf;
  const bodyXsrf = req.body && req.body._xsrf;

  if (!xsrf || bodyXsrf !== xsrf) {
    // HTTP 200 matching PHP my_die() behavior
    const locale = getLocale(req, req.params.db);
    return res.status(200).json([{ error: t9n('invalid_csrf', locale) }]);
  }

  next();
}

/**
 * Check Types Grant — authorization gate for type/metadata operations.
 * Port of PHP Check_Types_Grant() (index.php:967).
 *
 * Admin users always get 'WRITE'. Otherwise, checks grants[0] (the type-system
 * grant at ID 0) for 'READ' or 'WRITE'. When fatal is true, returns an error
 * object with HTTP 200 status and JSON error body (matching PHP's die() behavior).
 *
 * @param {Object} grants   - Loaded grants object (from loadGrants)
 * @param {string} username - Current username
 * @param {boolean} [fatal=true] - If true, return error object on insufficient grant
 * @param {string} [role=''] - Current user role name (included in error message for PHP parity)
 * @returns {string|{error: string, status: number}|undefined} 'READ' or 'WRITE', error object when fatal, or undefined when non-fatal
 */
function checkTypesGrant(grants, username, fatal = true, role = '') {
  // Admin always has WRITE access — mirrors PHP: if($GLOBALS["GLOBAL_VARS"]["user"] == "admin") return "WRITE"
  // PHP uses exact match (==) against "admin", no case folding
  if (username && username === 'admin') {
    return 'WRITE';
  }

  // Check grant ID 0 (type-system grant) — mirrors PHP: if(isset($GLOBALS["GRANTS"][0]))
  if (grants && grants[0] !== undefined) {
    if (grants[0] === 'READ' || grants[0] === 'WRITE') {
      return grants[0];
    }
  }

  // No valid grant found — mirrors PHP die() which returns HTTP 200 with error JSON body
  if (fatal) {
    const rolePrefix = role ? `[${role}] ` : '';
    return { error: `${rolePrefix}You do not have the grant to view and edit the metadata`, status: 200 };
  }

  return undefined;
}

/**
 * Legacy DDL grant check middleware.
 * Checks WRITE grant on types (root level, id=0, t=0) before any type modification.
 * Uses checkTypesGrant() for PHP-parity authorization.
 *
 * PHP parity: PHP calls Check_Types_Grant() before any type modification.
 */
async function legacyDdlGrantCheck(req, res, next) {
  const db = req.params.db;
  const { grants, username, role } = req.legacyUser || {};

  try {
    const grantLevel = checkTypesGrant(grants || {}, username || '', true, role || '');
    if (grantLevel && typeof grantLevel === 'object' && grantLevel.error) {
      // checkTypesGrant returned an error object (PHP die() parity — HTTP 200 with JSON error body)
      return res.status(200).json([{ error: grantLevel.error }]);
    }
    if (grantLevel !== 'WRITE') {
      const locale = getLocale(req, db);
      return res.status(403).json([{ error: t9n('insufficient_type_mod', locale) }]);
    }
    next();
  } catch (error) {
    logger.error({ error: error.message, db }, '[legacyDdlGrantCheck] Error');
    const locale = getLocale(req, db);
    return res.status(200).json([{ error: t9n('grant_check_failed', locale) }]);
  }
}

/**
 * Replace magic placeholders in values before storage.
 * PHP parity: PHP BuiltIn() function — replaces [TODAY], [USER], etc.
 * This wrapper accepts a full string and replaces all known placeholders.
 *
 * @param {string} val    - value with placeholders
 * @param {object} user   - {uid, username, role, roleId}
 * @param {string} db     - database name
 * @param {number} tzone  - timezone offset in seconds
 * @param {string} ip     - client IP address
 * @returns {string} resolved value
 */
function resolveBuiltIn(val, user, db, tzone = 0, ip = '', reqHeaders = {}) {
  if (!val || typeof val !== 'string') return val;

  const now = new Date(Date.now() + tzone * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (d) => `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  const dateStr = fmtDate(now);
  const timeStr = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  const datetimeStr = `${dateStr} ${timeStr}`;

  // Date-relative helpers (PHP parity: index.php:1584-1593)
  const yesterday = fmtDate(new Date(now.getTime() - 86400000));
  const tomorrow  = fmtDate(new Date(now.getTime() + 86400000));
  const weekAgo   = fmtDate(new Date(now.getTime() - 7 * 86400000));
  const monthAgo  = (() => { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - 1); return fmtDate(d); })();
  const monthPlus = (() => { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() + 1); return fmtDate(d); })();

  // Existing %X% percent-syntax placeholders
  let result = val
    .replace(/%USER%/g, user.username || '')
    .replace(/%USERID%/g, String(user.uid || ''))
    .replace(/%DB%/g, db || '')
    .replace(/%IP%/g, ip)
    .replace(/%DATE%/g, dateStr)
    .replace(/%DATETIME%/g, datetimeStr)
    .replace(/%TIME%/g, timeStr);

  // [X] bracket-syntax placeholders (PHP parity: index.php:1576-1618)
  result = result
    .replace(/\[YESTERDAY\]/g, yesterday)
    .replace(/\[TOMORROW\]/g, tomorrow)
    .replace(/\[MONTH_AGO\]/g, monthAgo)
    .replace(/\[WEEK_AGO\]/g, weekAgo)
    .replace(/\[MONTH_PLUS\]/g, monthPlus)
    .replace(/\[ROLE\]/g, user.role || '')
    .replace(/\[ROLE_ID\]/g, String(user.roleId || ''))
    .replace(/\[TSHIFT\]/g, String(tzone))
    .replace(/\[REMOTE_HOST\]/g, reqHeaders['x-forwarded-host'] || reqHeaders['host'] || '')
    .replace(/\[HTTP_USER_AGENT\]/g, reqHeaders['user-agent'] || '')
    .replace(/\[HTTP_REFERER\]/g, reqHeaders['referer'] || '');

  return result;
}

/**
 * Resolve bracket-syntax BuiltIn placeholders in mask values.
 * Port of PHP BuiltIn() (index.php:1576-1618) — bracket syntax used in getGrants masks.
 *
 * @param {string} val - Mask value potentially containing [PLACEHOLDER]
 * @param {Object} userCtx - User context { username, uid, role, roleId, tzone }
 * @returns {string} Resolved value
 */
function resolveMaskBuiltIn(val, userCtx) {
  if (!val || typeof val !== 'string') return val || '';
  const m = val.match(/(\[.+\])/);
  if (!m) return val;

  const placeholder = m[1];
  const tzone = (userCtx.tzone || 0) * 1000;
  const now = new Date(Date.now() + tzone);
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (d) => `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  const fmtDateTime = (d) => `${fmtDate(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

  let resolved;
  switch (placeholder) {
    case '[TODAY]':       resolved = fmtDate(now); break;
    case '[NOW]':         resolved = fmtDateTime(now); break;
    case '[YESTERDAY]':   resolved = fmtDate(new Date(now.getTime() - 86400000)); break;
    case '[TOMORROW]':    resolved = fmtDate(new Date(now.getTime() + 86400000)); break;
    case '[MONTH_AGO]': {
      const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - 1);
      resolved = fmtDate(d); break;
    }
    case '[WEEK_AGO]':    resolved = fmtDate(new Date(now.getTime() - 7 * 86400000)); break;
    case '[MONTH_PLUS]': {
      const d = new Date(now); d.setUTCMonth(d.getUTCMonth() + 1);
      resolved = fmtDate(d); break;
    }
    case '[USER]':        resolved = userCtx.username || ''; break;
    case '[USER_ID]':     resolved = String(userCtx.uid || ''); break;
    case '[ROLE]':        resolved = userCtx.role || ''; break;
    case '[ROLE_ID]':     resolved = String(userCtx.roleId || ''); break;
    case '[TSHIFT]':      resolved = String(userCtx.tzone || 0); break;
    case '[REMOTE_ADDR]': resolved = userCtx.ip || ''; break;
    case '[REMOTE_HOST]': resolved = userCtx.remoteHost || ''; break;
    case '[HTTP_USER_AGENT]': resolved = userCtx.userAgent || ''; break;
    case '[HTTP_REFERER]':    resolved = userCtx.referer || ''; break;
    default:              return val; // Unresolved — return as-is
  }

  return val.replace(/(\[.+\])/, resolved);
}

/**
 * Resolve ALL bracket-syntax BuiltIn placeholders in a string.
 * Unlike resolveMaskBuiltIn (which handles a single placeholder for mask values),
 * this handles multiple [PLACEHOLDER] occurrences in SQL or filter strings.
 * PHP parity: index.php:2727-2751 uses preg_match_all + loop.
 *
 * @param {string} val - String with potential [PLACEHOLDER] patterns
 * @param {Object} userCtx - User context { username, uid, role, roleId, tzone, ip }
 * @returns {string} String with all known placeholders resolved
 */
function resolveAllBracketBuiltIns(val, userCtx) {
  if (!val || typeof val !== 'string') return val || '';

  // Match individual [WORD] patterns (PHP: /(\[[0-9a-zA-Z\_]+\])/ims)
  return val.replace(/\[([0-9a-zA-Z_]+)\]/g, (match) => {
    // Try resolving via resolveMaskBuiltIn (handles known placeholders)
    const resolved = resolveMaskBuiltIn(match, userCtx);
    // If it resolved (changed), return the resolved value; otherwise keep original
    return resolved !== match ? resolved : match;
  });
}

/**
 * Recursively delete object and all descendants using batch DELETE.
 * PHP parity: PHP BatchDelete() (index.php lines 1529–1573).
 *
 * Instead of deleting one row at a time, this collects all descendant IDs
 * first, then deletes in batches using DELETE ... WHERE id IN (...).
 * Batches flush every BATCH_DELETE_THRESHOLD IDs to bound memory and query size.
 *
 * @param {Object} pool - MySQL pool
 * @param {string} db   - database name
 * @param {number} id   - object ID to delete
 */
const BATCH_DELETE_THRESHOLD = 1000;

async function recursiveDelete(pool, db, id) {
  // Collect all IDs to delete (children-first / bottom-up order)
  const idsToDelete = [];
  await _collectDescendants(pool, db, id, idsToDelete);
  // Root node last
  idsToDelete.push(id);

  // Clean up upload files/directories for all objects being deleted.
  // PHP parity: PHP RemoveDir(GetSubdir($id)."/".GetFilename($id).".".$ext)
  // removes associated files when deleting objects with FILE requisites.
  // Group by subdir (floor(id/1000)) to batch cleanup and avoid redundant checks.
  const subdirsSeen = new Set();
  for (const objId of idsToDelete) {
    const subdir = getSubdir(db, objId);
    const baseName = getFilename(db, objId);
    const uploadDir = path.join(legacyPath, 'download', db, subdir);
    // Remove any files matching this object's baseName pattern (any extension)
    try {
      if (fs.existsSync(uploadDir)) {
        const files = fs.readdirSync(uploadDir);
        for (const file of files) {
          if (file.startsWith(baseName)) {
            removeDir(path.join(uploadDir, file));
          }
        }
      }
    } catch (_e) { /* ignore — dir may not exist */ }
    subdirsSeen.add(uploadDir);
  }

  // Clean up empty subdirectories left behind
  for (const uploadDir of subdirsSeen) {
    try {
      if (fs.existsSync(uploadDir)) {
        const remaining = fs.readdirSync(uploadDir);
        if (remaining.length === 0) {
          removeDir(uploadDir);
        }
      }
    } catch (_e) { /* ignore */ }
  }

  // Delete in batches
  for (let i = 0; i < idsToDelete.length; i += BATCH_DELETE_THRESHOLD) {
    const batch = idsToDelete.slice(i, i + BATCH_DELETE_THRESHOLD);
    const placeholders = batch.map(() => '?').join(',');
    await execSql(pool, `DELETE FROM ${sanitizeIdentifier(db)} WHERE id IN (${placeholders})`, batch, { label: 'batchDeleteObjects', db });
  }
}

/**
 * Recursively collect all descendant IDs (children-first).
 * @param {Object} pool
 * @param {string} db
 * @param {number} parentId
 * @param {number[]} acc - accumulator array, mutated in-place
 */
async function _collectDescendants(pool, db, parentId, acc) {
  const z = sanitizeIdentifier(db);
  const { rows: children } = await execSql(pool, `SELECT id FROM ${z} WHERE up = ?`, [parentId], { label: '_collectDescendants_select' });
  for (const child of children) {
    await _collectDescendants(pool, db, child.id, acc);
    acc.push(child.id);
  }
}

/**
 * Check if parent already has a child with the same type and deduplicate.
 * PHP parity: PHP checkDuplicatedReqs() — keeps the newest, deletes older duplicates.
 *
 * @param {Object} pool     - MySQL pool
 * @param {string} db       - database name
 * @param {number} parentId - parent object ID
 * @param {number} typeId   - type ID to check
 * @returns {boolean} true if duplicate existed (and was cleaned up)
 */
async function checkDuplicatedReqs(pool, db, parentId, typeId) {
  const z = sanitizeIdentifier(db);
  const { rows: rows } = await execSql(pool, `SELECT id FROM ${z} WHERE up = ? AND t = ? ORDER BY id DESC`, [parentId, typeId], { label: 'checkDuplicatedReqs_select' });

  if (rows.length <= 1) return false;

  // Skip the first (newest), delete the rest
  for (let i = 1; i < rows.length; i++) {
    await recursiveDelete(pool, db, rows[i].id);
  }

  return true;
}

/**
 * Check filename extension against upload blacklist.
 * PHP parity: PHP BlackList() — prevents uploading executable files.
 *
 * @param {string} filename - filename to check
 * @returns {boolean} true if blacklisted
 */
function isBlacklisted(filename) {
  if (!filename) return false;
  const ext = filename.split('.').pop().toLowerCase();
  const blacklist = ['php', 'cgi', 'pl', 'fcgi', 'fpl', 'phtml', 'shtml',
    'php2', 'php3', 'php4', 'php5', 'asp', 'jsp'];
  return blacklist.includes(ext);
}

/**
 * Get subdirectory path for file storage.
 * PHP parity: PHP GetSubdir() = UPLOAD_DIR . floor(id/1000) . substr(GetSha(floor(id/1000)), 0, 8)
 *
 * @param {string} db - database name
 * @param {number} id - object ID
 * @returns {string} subdirectory name
 */
function getSubdir(db, id) {
  const folderNum = Math.floor(id / 1000);
  return `${folderNum}${fileGetSha(db, folderNum).slice(0, 8)}`;
}

/**
 * Get filename (without extension) for file storage.
 * PHP parity: PHP GetFilename() = substr("00$id", -3) . substr(GetSha(id), 0, 8)
 *
 * @param {string} db - database name
 * @param {number} id - object ID
 * @returns {string} filename without extension
 */
function getFilename(db, id) {
  const fileNum = ('00' + id).slice(-3);
  return `${fileNum}${fileGetSha(db, id).slice(0, 8)}`;
}

/**
 * Human-readable file size.
 * PHP parity: PHP NormalSize() (index.php lines 7250–7262).
 *
 * @param {number} size - file size in bytes
 * @returns {string} formatted size with unit (B, KB, MB, GB, TB)
 */
function normalSize(size) {
  if (size < 1024) return size + ' B';
  if (size < 1048576) return +(size / 1024).toFixed(2) + ' KB';
  if (size < 1073741824) return +(size / 1048576).toFixed(2) + ' MB';
  if (size < 1099511627776) return +(size / 1073741824).toFixed(2) + ' GB';
  return +(size / 1099511627776).toFixed(2) + ' TB';
}

/**
 * Recursively remove a file or directory from the filesystem.
 * PHP parity: PHP RemoveDir() (index.php lines 596–616).
 *
 * Uses fs.rmSync with recursive+force to mirror the PHP behaviour:
 *  - If path is a directory, remove it and all contents recursively.
 *  - If path is a file, remove the file.
 *  - If path does not exist, silently do nothing (force: true).
 *
 * @param {string} dirPath - absolute path to file or directory to remove
 */
function removeDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (err) {
    logger.warn('[removeDir] Failed to remove path', { dirPath, error: err.message });
  }
}

/**
 * Validate that a reference value exists in the target type.
 * PHP parity: PHP checkNewRef($val, $t) — SELECT 1 FROM db WHERE id=val AND t=t
 *
 * @param {Object} pool      - MySQL pool
 * @param {string} db        - database name
 * @param {number} refTypeId - expected type ID
 * @param {number} value     - object ID to check
 * @returns {boolean} true if reference is valid
 */
async function checkNewRef(pool, db, refTypeId, value) {
  const z = sanitizeIdentifier(db);
  const { rows: rows } = await execSql(pool, `SELECT 1 FROM ${z} WHERE id = ? AND t = ? LIMIT 1`, [value, refTypeId], { label: 'checkNewRef_select' });
  return rows.length > 0;
}

/**
 * Recursively copy all requisites from source to destination object.
 * PHP parity: PHP Populate_Reqs() — deep copy including nested children.
 *
 * @param {Object} pool - MySQL pool
 * @param {string} db   - database name
 * @param {number} srcId - source object ID
 * @param {number} dstId - destination object ID
 */
async function populateReqs(pool, db, srcId, dstId) {
  // PHP parity: SELECT with sub-query to detect children (ch column)
  // Reqs with children or FILE type need individual INSERT (for insertId),
  // leaf reqs are batched via insertBatch() for performance.
  const { rows: children } = await execSql(pool, `SELECT r.id, r.t, r.val, r.ord, typ.t AS base_t,
            (SELECT 1 FROM \`${db}\` ch WHERE ch.up = r.id LIMIT 1) AS ch
     FROM \`${db}\` r
     LEFT JOIN \`${db}\` typ ON typ.id = r.t
     WHERE r.up = ? ORDER BY r.ord`, [srcId], { label: 'populateReqs_select' });

  const uploadDir = path.join(legacyPath, 'download', db);
  const batchRows = []; // accumulate leaf reqs for batch insert

  for (const child of children) {
    let copiedVal = child.val;

    // For FILE-type requisites, physically copy the file to avoid shared reference
    // PHP parity: INSERT first to obtain the new ID, then copy using hash-based paths
    if (child.base_t === TYPE.FILE && child.val && child.val.length > 0) {
      // FILE reqs need insertId for file naming — individual INSERT (before copy, like PHP)
      const { insertId: fileInsertId } = await execSql(pool,
        `INSERT INTO \`${db}\` (up, ord, t, val) VALUES (?, ?, ?, ?)`,
        [dstId, child.ord, child.t, child.val],
        { label: 'populateReqs/file', db }
      );

      // PHP: $orig_path = GetSubdir($ch["id"])."/".GetFilename($ch["id"]).".".ext
      const ext = child.val.includes('.') ? '.' + child.val.split('.').pop() : '';
      const srcSubdir = getSubdir(db, child.id);
      const srcFile = path.join(uploadDir, srcSubdir, getFilename(db, child.id) + ext);

      if (fs.existsSync(srcFile)) {
        // PHP: $new_dir = GetSubdir($id); @mkdir($new_dir);
        const dstSubdir = getSubdir(db, fileInsertId);
        const dstDir = path.join(uploadDir, dstSubdir);
        const dstFile = path.join(dstDir, getFilename(db, fileInsertId) + ext);
        try {
          fs.mkdirSync(dstDir, { recursive: true });
          fs.copyFileSync(srcFile, dstFile);
        } catch (copyErr) {
          logger.warn('[Legacy populateReqs] File copy failed', { srcFile, dstFile, error: copyErr.message });
        }
      }

      await populateReqs(pool, db, child.id, fileInsertId);
    } else if (child.ch === 1) {
      // Req has children — need insertId for recursion, individual INSERT
      const { rows: insertResult } = await execSql(pool, `INSERT INTO \`${db}\` (up, ord, t, val) VALUES (?, ?, ?, ?)`, [dstId, child.ord, child.t, copiedVal], { label: 'populateReqs_insert' });
      await populateReqs(pool, db, child.id, insertResult.insertId);
    } else {
      // Leaf req — accumulate for batch insert (PHP: Insert_batch)
      batchRows.push([dstId, child.ord, child.t, copiedVal]);
    }
  }

  // Flush accumulated leaf reqs in one batch INSERT
  if (batchRows.length > 0) {
    await insertBatch(pool, db, batchRows);
  }
}

/**
 * Validate database name (matches PHP DB_MASK)
 */
function isValidDbName(db) {
  return /^[a-z]\w{1,14}$/i.test(db);
}

/**
 * Check if database table exists
 */
async function dbExists(db) {
  try {
    const pool = getPool();
    // PHP stores each "db" as a TABLE inside the single 'integram' MySQL database
    const dbName = process.env.INTEGRAM_DB_NAME || 'integram';
    logger.info('[dbExists] checking', {
      db, dbName,
      host: process.env.INTEGRAM_DB_HOST,
      user: process.env.INTEGRAM_DB_USER,
      database: process.env.INTEGRAM_DB_NAME,
    });
    const { rows: rows } = await execSql(pool, 'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1', [dbName, db], { label: 'dbExists_select' });
    logger.info('[dbExists] result', { db, found: rows.length > 0 });
    return rows.length > 0;
  } catch (error) {
    logger.error('[dbExists] FAILED', { db, error: error.message, code: error.code });
    return false;
  }
}

/**
 * Secret token authentication — PHP: if(isset($_POST["secret"])) / if(isset($_GET["secret"]))
 * POST /:db/auth?secret=<token>  or  GET /:db/auth?secret=<token>
 *
 * PHP authenticates via TYPE.SECRET=130 token stored in the database:
 *   SELECT u.id, u.val username FROM db u JOIN db tok ON tok.up=u.id AND tok.t=130 AND tok.val=?
 * XSRF is generated as: xsrf($tok, $username) → phpSalt(secret, username, db)
 */
/**
 * GET /:db/auth?JSON - PHP auth status check
 */
router.get('/:db/auth', async (req, res, next) => {
  if (req.query.secret !== undefined) return next();
  const { db } = req.params;
  if (!isApiRequest(req)) return next();
  const locale = getLocale(req, db);
  if (!isValidDbName(db)) return res.status(200).json([{ error: t9n('invalid_database_name', locale) }]);
  const token = extractToken(req, db);
  if (!token) return res.status(200).json([{ error: t9n('not_logged', locale) }]);
  try {
    const pool = getPool();
    const { rows: rows } = await execSql(pool, `SELECT u.id uid, u.val uname, x.val xsrf_val
       FROM \`${db}\` u
       JOIN \`${db}\` tok ON tok.up = u.id AND tok.t = ${TYPE.TOKEN} AND tok.val = ?
       LEFT JOIN \`${db}\` x ON x.up = u.id AND x.t = ${TYPE.XSRF}
       WHERE u.t = ${TYPE.USER} LIMIT 1`, [token], { label: 'get_db_auth_select' });
    if (rows.length === 0) return res.status(200).json([{ error: t9n('not_logged', locale) }]);
    const u = rows[0];
    const xsrf = u.xsrf_val || generateXsrf(token, u.uname || '', db);
    return res.status(200).json({ _xsrf: xsrf, token, id: Number(u.uid), msg: '' });
  } catch (err) {
    logger.error('[GET /:db/auth] DB error', { error: err.message, db });
    return res.status(200).json([{ error: t9n('server_error', locale) }]);
  }
});

router.all('/:db/auth', async (req, res, next) => {
  const secret = req.body.secret || req.query.secret;
  if (!secret) return next(); // Not a secret auth request

  const { db } = req.params;
  const isJSON = isApiRequest(req);

  const locale = getLocale(req, db);
  if (!isValidDbName(db)) {
    if (isJSON) return res.status(200).json([{ error: t9n('invalid_database_name', locale) }]);
    return res.status(400).send(t9n('invalid_database', locale));
  }

  try {
    const pool = getPool();

    // Look up user by secret token (TYPE.SECRET = 130)
    const { rows: rows } = await execSql(pool, `SELECT u.id uid, u.val username,
              tok.val tok_val,
              token.id token_id, token.val token_val,
              xsrf.id xsrf_id, xsrf.val xsrf_val
       FROM ${db} u
       JOIN ${db} tok ON tok.up = u.id AND tok.t = ${TYPE.SECRET} AND tok.val = ?
       LEFT JOIN ${db} token ON token.up = u.id AND token.t = ${TYPE.TOKEN}
       LEFT JOIN ${db} xsrf ON xsrf.up = u.id AND xsrf.t = ${TYPE.XSRF}
       WHERE u.t = ${TYPE.USER}
       LIMIT 1`, [secret], { label: 'get_db_auth_select' });

    if (rows.length === 0) {
      logger.warn('[Legacy SecretAuth] Invalid secret token', { db });
      if (isJSON) return res.status(200).json([{ error: t9n('invalid_secret', locale) }]);
      return res.status(401).send(t9n('invalid_secret', locale));
    }

    const user = rows[0];
    // PHP: xsrf($tok, $username) → phpSalt(secret, username, db)
    const xsrf = generateXsrf(secret, user.username, db);

    // Reuse existing token or create a new permanent one
    let tokenVal = user.token_val;
    if (!tokenVal) {
      tokenVal = generateToken();
      await execSql(pool, `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 1, ${TYPE.TOKEN}, ?)`, [user.uid, tokenVal], { label: 'get_db_auth_insert' });
    }

    // Update or insert XSRF
    if (user.xsrf_id) {
      await execSql(pool, `UPDATE ${db} SET val = ? WHERE id = ?`, [xsrf, user.xsrf_id], { label: 'updateXsrf', db });
    } else {
      await execSql(pool,
        `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 1, ${TYPE.XSRF}, ?)`,
        [user.uid, xsrf],
        { label: 'insertXsrf', db }
      );
    }

    // Set session cookie; remove secret cookie
    res.cookie(db, tokenVal, { maxAge: 30 * 24 * 60 * 60 * 1000, path: '/', httpOnly: false });
    res.clearCookie('secret', { path: '/' });

    logger.info('[Legacy SecretAuth] Success', { db, uid: user.uid, username: user.username });

    if (isJSON) {
      // PHP secret auth (line ~7573 authJWT): {_xsrf, token, id, user} — includes user field, no msg
      // id is a string (PHP mysqli_fetch_array returns strings)
      return res.status(200).json({ _xsrf: xsrf, token: tokenVal, id: String(user.uid), user: user.username });
    }

    const uri = req.body.uri || req.query.uri || `/${db}`;
    return res.redirect(String(uri).replace(/[<>"']/g, ''));
  } catch (error) {
    logger.error('[Legacy SecretAuth] Error', { error: error.message, db });
    if (isJSON) return res.status(200).json([{ error: error.message }]);
    return res.status(500).send('Server error');
  }
});

/**
 * Authentication endpoint - matches PHP's "auth" case
 * POST /:db/auth
 *
 * Expected request body (FormData):
 * - login: username
 * - pwd: password
 * - db: database name
 * - tzone: (optional) client timezone offset for setting timezone cookie
 * - uri: (optional) redirect URI after successful login
 * - change: (optional) flag to indicate password change request
 * - npw1: (optional) new password
 * - npw2: (optional) new password confirmation
 *
 * PHP response (JSON/API mode) — bare JSON, no wrapper:
 *   {"_xsrf":"...","token":"...","id":123,"msg":""}
 * PHP error (API mode) — HTTP 200:
 *   [{"error":"..."}]
 */
router.post('/:db/auth', async (req, res, next) => {
  // ?reset is handled by a separate handler registered after this one
  if (req.query.reset !== undefined) return next();

  const { db } = req.params;
  const isJSON = isApiRequest(req);

  logger.info('[Legacy Auth] Request', { db, isJSON, body: { ...req.body, pwd: '***', npw1: '***', npw2: '***' } });

  const locale = getLocale(req, db);
  // Validate DB name
  if (!isValidDbName(db)) {
    if (isJSON) {
      return res.status(200).json([{ error: t9n('invalid_database_name', locale) }]);
    }
    return res.status(400).send(t9n('invalid_database', locale));
  }

  // PHP lowercases the login: $u = strtolower($_POST["login"])
  const login = (req.body.login || req.body.user || '').toLowerCase();
  const password = req.body.pwd || req.body.password || '';

  // Extract new parameters (P1 - Auth parameters)
  // PHP: $_POST["uri"], $_POST["tzone"], $_POST["change"], $_POST["npw1"], $_POST["npw2"]
  const uri = req.body.uri ? String(req.body.uri).replace(/[<>"']/g, '') : `/${db}`;
  const tzoneParam = req.body.tzone;
  const changePassword = req.body.change !== undefined;
  const npw1 = req.body.npw1 || '';
  const npw2 = req.body.npw2 || '';

  if (!login || !password) {
    if (isJSON) {
      return res.status(200).json([{ error: t9n('login_password_required', locale) }]);
    }
    return res.status(400).send(t9n('login_password_required', locale));
  }

  try {
    // Check if database exists
    if (!await dbExists(db)) {
      if (isJSON) {
        return res.status(200).json([{ error: `${db} does not exist` }]);
      }
      return res.status(404).send(`${db} does not exist`);
    }

    const pool = getPool();

    // Handle timezone cookie (PHP lines 7623-7627)
    // PHP: $tzone = round(((int)$_POST["tzone"] - time() - date("Z"))/1800)*1800
    if (tzoneParam !== undefined) {
      const clientTime = parseInt(tzoneParam, 10);
      const serverTime = Math.floor(Date.now() / 1000);
      const serverOffset = new Date().getTimezoneOffset() * -60; // PHP date("Z") equivalent
      const tzone = Math.round((clientTime - serverTime - serverOffset) / 1800) * 1800;

      res.cookie('tzone', String(tzone), {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (COOKIES_EXPIRE)
        path: '/',
        httpOnly: false,
      });
    }

    // Query matching PHP's auth logic
    // Find user by login (val field) and get their password hash, token and xsrf
    // PHP also gets pwd.id for password change
    const query = `
      SELECT
        user.id AS uid,
        user.val AS username,
        pwd.val AS password_hash,
        pwd.id AS pwd_id,
        token.val AS token,
        token.id AS token_id,
        xsrf.val AS xsrf,
        xsrf.id AS xsrf_id
      FROM ${db} user
      LEFT JOIN ${db} pwd ON pwd.up = user.id AND pwd.t = ${TYPE.PASSWORD}
      LEFT JOIN ${db} token ON token.up = user.id AND token.t = ${TYPE.TOKEN}
      LEFT JOIN ${db} xsrf ON xsrf.up = user.id AND xsrf.t = ${TYPE.XSRF}
      WHERE user.val = ? AND user.t = ${TYPE.USER}
      LIMIT 1
    `;

    const { rows: rows } = await execSql(pool, query, [login], { label: 'login_query' });

    if (rows.length === 0) {
      // PHP cabinet fallback (index.php lines 7638-7656):
      // 1. Verify user in 'my' DB with email+pwd AND check DATABASE record for target DB
      // 2. Re-query target DB for DB-owner user and establish full session
      if (db !== 'my') {
        try {
          // PHP: Salt($u, $p) with $z temporarily set to "my" for password hashing
          const myExpectedHash = phpCompatibleHash(login, password, 'my');

          // Step 1: Check 'my' DB — email + password + DATABASE record for target DB
          // PHP: SELECT 1 FROM my email JOIN my pwd ... JOIN my db ON db.up=email.up AND db.val='$z' AND db.t=DATABASE
          const { rows: myRows } = await execSql(pool, `
            SELECT 1
            FROM my email
            JOIN my pwd ON pwd.up = email.up AND pwd.val = ?
            JOIN my db ON db.up = email.up AND db.val = ? AND db.t = ${TYPE.DATABASE}
            WHERE email.t = ${TYPE.EMAIL} AND email.val = ?
          `, [myExpectedHash, db, login], { label: 'cabinet_auth_check' });

          if (myRows.length > 0) {
            // Step 2: Re-query target DB for the DB-owner user (user.val = db name)
            // PHP: SELECT u.id uid, u.val, ... WHERE u.t=USER AND u.val='$z' AND pwd.up=u.id
            const { rows: dbOwnerRows } = await execSql(pool, `
              SELECT
                u.id AS uid,
                u.val AS username,
                pwd.id AS pwd_id,
                pwd.val AS password_hash,
                tok.id AS token_id,
                tok.val AS token,
                act.id AS act_id,
                xsrf.id AS xsrf_id,
                xsrf.val AS xsrf
              FROM ${db} u
              LEFT JOIN ${db} pwd ON pwd.up = u.id AND pwd.t = ${TYPE.PASSWORD}
              LEFT JOIN ${db} act ON act.up = u.id AND act.t = ${TYPE.ACTIVITY}
              LEFT JOIN ${db} tok ON tok.up = u.id AND tok.t = ${TYPE.TOKEN}
              LEFT JOIN ${db} xsrf ON xsrf.up = u.id AND xsrf.t = ${TYPE.XSRF}
              WHERE u.t = ${TYPE.USER} AND u.val = ?
              LIMIT 1
            `, [db], { label: 'cabinet_db_owner_query' });

            if (dbOwnerRows.length > 0) {
              const dbOwner = dbOwnerRows[0];
              logger.info('[Legacy Auth] Cabinet fallback — logging in as DB owner', { db, login, ownerUid: dbOwner.uid });

              // Reuse existing token or generate new (same logic as normal login)
              let cabinetToken;
              if (dbOwner.token_id && dbOwner.token) {
                cabinetToken = dbOwner.token;
              } else {
                cabinetToken = generateToken();
                await execSql(pool,
                  `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 1, ${TYPE.TOKEN}, ?)`,
                  [dbOwner.uid, cabinetToken],
                  { label: 'cabinet_insertToken', db }
                );
              }
              const cabinetXsrf = generateXsrf(cabinetToken, db, db);

              if (!dbOwner.xsrf_id) {
                await execSql(pool, `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 1, ${TYPE.XSRF}, ?)`, [dbOwner.uid, cabinetXsrf], { label: 'cabinet_insertXsrf' });
              } else {
                await execSql(pool, `UPDATE ${db} SET val = ? WHERE id = ?`, [cabinetXsrf, dbOwner.xsrf_id], { label: 'cabinet_updateXsrf' });
              }

              // Set cookie like PHP: setcookie($z, $token, time() + COOKIES_EXPIRE, "/")
              res.cookie(db, cabinetToken, {
                maxAge: 30 * 24 * 60 * 60 * 1000,
                path: '/',
                httpOnly: false,
              });

              if (isJSON) {
                return res.status(200).json({
                  _xsrf: cabinetXsrf,
                  token: cabinetToken,
                  id: String(dbOwner.uid),
                  msg: '',
                });
              }
              return res.redirect(uri);
            }
          }
        } catch (myErr) {
          // 'my' table may not exist in standalone mode — ignore
          logger.debug('[Legacy Auth] Cabinet fallback failed (my table may not exist)', { error: myErr.message });
        }
      }

      logger.warn('[Legacy Auth] User not found', { db, login });
      if (isJSON) {
        // PHP: my_die("Wrong credentials...") → HTTP 200 [{"error":"..."}]
        return res.status(200).json([{ error: `Wrong credentials for user ${login} in ${db}. Please send login and password as POST-parameters.` }]);
      }
      return res.status(401).send('Invalid credentials');
    }

    const user = rows[0];

    // Verify password using PHP-compatible hashing
    // PHP: $pwd = sha1(Salt($u, $p)) where Salt = SALT + UPPER($u) + $z(db) + $p
    const expectedHash = phpCompatibleHash(login, password, db);

    logger.debug('[Legacy Auth] Password verification', {
      db,
      login,
      match: user.password_hash === expectedHash,
    });

    if (user.password_hash !== expectedHash) {
      // Check for admin password override (PHP lines 7683-7688)
      // PHP: sha1(sha1(SERVER_NAME + db + password) + db) === sha1(ADMINHASH + db)
      const ADMIN_HASH = process.env.INTEGRAM_ADMIN_HASH || '';
      const serverName = process.env.INTEGRAM_SERVER_NAME || req.hostname || 'localhost';

      if (login === 'admin' && ADMIN_HASH) {
        const innerHash = crypto.createHash('sha1').update(serverName + db + password).digest('hex');
        const userHash = crypto.createHash('sha1').update(innerHash + db).digest('hex');
        const expectedAdminHash = crypto.createHash('sha1').update(ADMIN_HASH + db).digest('hex');

        if (userHash === expectedAdminHash) {
          // Admin password override - special auth
          logger.info('[Legacy Auth] Admin password override', { db });

          const adminToken = crypto.createHash('sha1').update(ADMIN_HASH + db).digest('hex');
          const adminXsrf = crypto.createHash('sha1').update(db + ADMIN_HASH).digest('hex');

          // Set cookie (session cookie, not persistent)
          res.cookie(db, adminToken, {
            path: '/',
            httpOnly: false,
          });

          if (isJSON) {
            return res.status(200).json({
              _xsrf: adminXsrf,
              token: adminToken,
              id: 0,
              msg: '',
            });
          }

          return res.redirect(uri);
        }
      }

      logger.warn('[Legacy Auth] Password mismatch', { db, login });
      if (isJSON) {
        return res.status(200).json([{ error: `Wrong credentials for user ${login} in ${db}. Please send login and password as POST-parameters.` }]);
      }
      return res.status(401).send('Invalid credentials');
    }

    // Handle password change (PHP lines 7660-7676)
    let msg = '';
    if (changePassword) {
      if (npw1.length < 6) {
        msg = 'Password must be at least 6 characters long [errShort]. ';
      } else if (npw1 === password) {
        msg = 'The new password must differ from the old one [errOld]. ';
      } else if (npw1 !== npw2) {
        msg = 'Please input the same password twice [errDiffer]. ';
      } else {
        // Update password
        const newPwdHash = phpCompatibleHash(login, npw1, db);
        if (user.pwd_id) {
          await execSql(pool, `UPDATE ${db} SET val = ? WHERE id = ?`, [newPwdHash, user.pwd_id], { label: 'query_update' });
          msg = 'The password has been changed';
          logger.info('[Legacy Auth] Password changed', { db, login });
        }
      }

      // If there's an error message in password change mode, return it
      if (msg && msg.includes('[err')) {
        if (isJSON) {
          return res.status(200).json({ _xsrf: '', token: '', id: 0, msg });
        }
        return res.status(200).send(msg);
      }
    }

    // PHP: reuses existing token if present, only generates new when none exists
    // (updateTokens, index.php lines 363-383)
    let token;
    if (user.token_id && user.token) {
      // Reuse existing token (PHP: if($row["tok"]) $token = $row["token"])
      token = user.token;
    } else {
      // Generate new token only when none exists (PHP: md5(microtime(TRUE)))
      token = generateToken();
      await execSql(pool,
        `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 1, ${TYPE.TOKEN}, ?)`,
        [user.uid, token],
        { label: 'insertToken', db }
      );
    }
    const xsrf = generateXsrf(token, db, db);

    if (!user.xsrf_id) {
      await execSql(pool, `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 1, ${TYPE.XSRF}, ?)`, [user.uid, xsrf], { label: 'query_insert' });
    } else {
      // Update xsrf to keep it in sync with token
      await execSql(pool, `UPDATE ${db} SET val = ? WHERE id = ?`, [xsrf, user.xsrf_id], { label: 'query_update' });
    }

    logger.info('[Legacy Auth] Success', { db, login, uid: user.uid });

    // Set cookie exactly like PHP: setcookie($z, $token, time() + COOKIES_EXPIRE, "/")
    // Cookie name = db name (PHP: setcookie($z, ...))
    res.cookie(db, token, {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (COOKIES_EXPIRE)
      path: '/',
      httpOnly: false, // PHP default — accessible to JS
    });

    if (isJSON) {
      // PHP response: {"_xsrf":"...","token":"...","id":"123","msg":""}
      // id is a string (PHP mysqli_fetch_array returns strings)
      return res.status(200).json({
        _xsrf: xsrf,
        token,
        id: String(user.uid),
        msg,
      });
    }

    // Non-JSON mode: redirect to uri (PHP: header("Location: ".$GLOBALS["GLOBAL_VARS"]["uri"]))
    // PHP validates that URI starts with /$db
    let redirectUri = uri;
    if (!redirectUri.startsWith(`/${db}`)) {
      redirectUri = `/${db}`;
    }
    return res.redirect(redirectUri);

  } catch (error) {
    logger.error('[Legacy Auth] Error', { error: error.message, db, login });

    if (isJSON) {
      return res.status(200).json([{ error: 'Authentication failed' }]);
    }
    return res.status(500).send('Authentication failed');
  }
});

/**
 * Token validation endpoint
 * GET /:db/validate
 */
router.get('/:db/validate', async (req, res) => {
  const { db } = req.params;
  const token = req.cookies[db] || req.headers['x-authorization'] || req.headers.authorization;
  const isJSON = isApiRequest(req);

  if (!isValidDbName(db)) {
    return res.status(400).json({ success: false, error: 'Invalid database' });
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  try {
    const pool = getPool();

    const query = `
      SELECT
        user.id AS uid,
        user.val AS username,
        xsrf.val AS xsrf
      FROM ${db} user
      JOIN ${db} token ON token.up = user.id AND token.t = ${TYPE.TOKEN}
      LEFT JOIN ${db} xsrf ON xsrf.up = user.id AND xsrf.t = ${TYPE.XSRF}
      WHERE token.val = ? AND user.t = ${TYPE.USER}
      LIMIT 1
    `;

    const { rows: rows } = await execSql(pool, query, [token.replace('Bearer ', '')], { label: 'get_db_validate_query' });

    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const user = rows[0];

    return res.json({
      success: true,
      valid: true,
      user: {
        id: user.uid,
        login: user.username,
      },
      xsrf: user.xsrf,
    });

  } catch (error) {
    logger.error('[Legacy Validate] Error', { error: error.message, db });
    return res.status(500).json({ success: false, error: 'Validation failed' });
  }
});

/**
 * Get one-time code (email/SMS OTP login)
 * POST /:db/getcode
 *
 * PHP: queries user by email, sends first-4-chars of token by mail/SMS.
 * Returns {"msg":"ok"} if user found (email sent), {"msg":"new"} if not found,
 * {"error":"invalid user"} if bad email format.
 *
 * NOTE: actual email/SMS sending is not implemented in standalone mode.
 *       The response format is PHP-compatible so the client UI works correctly.
 */
router.post('/:db/getcode', async (req, res) => {
  const { db } = req.params;
  const u = (req.body.u || req.body.login || req.body.email || '').toLowerCase().trim();

  logger.info({ db, u }, '[Legacy GetCode] Request');

  // PHP parity: set tzone cookie when req.body.tzone is provided
  const tzoneParam = req.body.tzone;
  if (tzoneParam !== undefined) {
    const clientTime = parseInt(tzoneParam, 10);
    const serverTime = Math.floor(Date.now() / 1000);
    const serverOffset = new Date().getTimezoneOffset() * -60;
    const tzone = Math.round((clientTime - serverTime - serverOffset) / 1800) * 1800;
    res.cookie('tzone', String(tzone), {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
      httpOnly: false,
    });
  }

  // PHP validates email format
  if (!u || !/^.+@.+\..+$/.test(u)) {
    return res.status(200).json([{ error: 'invalid user' }]);
  }

  try {
    const pool = getPool();
    const { rows: rows } = await execSql(pool, `SELECT tok.val FROM ${db} u LEFT JOIN ${db} tok ON tok.up=u.id AND tok.t=${TYPE.TOKEN} WHERE u.t=${TYPE.USER} AND u.val=? LIMIT 1`, [u], { label: 'u_select' });

    if (rows.length > 0) {
      // PHP: sends email with first 4 chars of token as OTP code (strtoupper(substr($token,0,4)))
      const code = (rows[0].val || '').substring(0, 4);
      const reqHost = req.headers.host || req.hostname || 'localhost';
      await sendOtpEmail(u, code, db, reqHost);
      return res.status(200).json({ msg: 'ok' });
    } else {
      // PHP returns "new" when user not found (suggests registering)
      return res.status(200).json({ msg: 'new' });
    }
  } catch (error) {
    logger.error({ error: error.message, db }, '[Legacy GetCode] Error');
    return res.status(200).json([{ error: 'server error' }]);
  }
});

/**
 * Check one-time code (OTP verification)
 * POST /:db/checkcode
 *
 * PHP: finds user where token starts with the 4-char code, regenerates token,
 * returns {"token":"...","_xsrf":"..."} on success, {"error":"..."} on failure.
 */
router.post('/:db/checkcode', async (req, res) => {
  const { db } = req.params;
  const c = (req.body.c || req.body.code || '').toLowerCase().trim().substring(0, 4);
  const u = (req.body.u || req.body.login || req.body.email || '').toLowerCase().trim();

  logger.info({ db, u }, '[Legacy CheckCode] Request');

  if (!u || !c || c.length !== 4) {
    return res.status(200).json([{ error: 'invalid data' }]);
  }

  try {
    const pool = getPool();
    const { rows: rows } = await execSql(pool, `SELECT u.id uid, tok.id tok_id, xsrf.id xsrf_id
       FROM ${db} tok, ${db} u
       LEFT JOIN ${db} xsrf ON xsrf.up=u.id AND xsrf.t=${TYPE.XSRF}
       WHERE u.t=${TYPE.USER} AND u.val=? AND tok.up=u.id AND tok.t=${TYPE.TOKEN} AND tok.val LIKE ?
       LIMIT 1`, [u, c + '%'], { label: 'u_select' });

    if (rows.length > 0) {
      const row = rows[0];
      const newToken = generateToken();
      // PHP: xsrf($token, $u) where $u=email → generateXsrf(newToken, u, db)
      const newXsrf = generateXsrf(newToken, u, db);

      // Update token
      await execSql(pool, `UPDATE ${db} SET val=? WHERE id=?`, [newToken, row.tok_id], { label: 'u_update' });

      // Update or insert xsrf
      if (row.xsrf_id) {
        await execSql(pool, `UPDATE ${db} SET val=? WHERE id=?`, [newXsrf, row.xsrf_id], { label: 'u_update' });
      } else {
        await execSql(pool, `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 1, ${TYPE.XSRF}, ?)`, [row.uid, newXsrf], { label: 'u_insert' });
      }

      // PHP parity: upsert ACTIVITY record for last-login tracking
      const { rows: actRows } = await execSql(pool, `SELECT id FROM ${db} WHERE up = ? AND t = ${TYPE.ACTIVITY} LIMIT 1`, [row.uid], { label: 'u_select' });
      const nowTimestamp = String(Math.floor(Date.now() / 1000));
      if (actRows.length > 0) {
        await execSql(pool, `UPDATE ${db} SET val = ? WHERE id = ?`, [nowTimestamp, actRows[0].id], { label: 'u_update' });
      } else {
        await execSql(pool, `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 1, ${TYPE.ACTIVITY}, ?)`, [row.uid, nowTimestamp], { label: 'u_insert' });
      }

      // Set cookie like PHP
      res.cookie(db, newToken, { maxAge: 30 * 24 * 60 * 60 * 1000, path: '/', httpOnly: false });

      return res.status(200).json({ token: newToken, _xsrf: newXsrf });
    } else {
      return res.status(200).json([{ error: 'user not found' }]);
    }
  } catch (error) {
    logger.error({ error: error.message, db }, '[Legacy CheckCode] Error');
    return res.status(200).json([{ error: 'invalid data' }]);
  }
});

/**
 * Password reset endpoint
 * POST /:db/auth?reset
 *
 * PHP: pwd_reset() finds user by login or email, generates a new random password,
 * hashes it with sha1(Salt(username, newPwd)), then:
 *   - If user has email AND existing password: sends email with new password + confirmation link.
 *     Password is NOT changed until user clicks the confirmation link (/:db/confirm).
 *   - If user has email but NO password yet: sends email with new password, creates password record immediately.
 *   - If user has phone (no email): sends SMS with new password, updates password immediately.
 *
 * Returns PHP-compatible login() API format:
 *   {"message":"MAIL"|"SMS"|"NEW_PWD"|"WRONG_CONT","db":"...","login":"...","details":"..."}
 *
 * This second handler runs only when ?reset is set (first handler does normal auth).
 */
router.post('/:db/auth', async (req, res, next) => {
  if (req.query.reset === undefined) {
    return next(); // Not a reset request — let first handler (line ~600) run
  }

  const { db } = req.params;
  const u = (req.body.login || '').toLowerCase().trim();
  const isJSON = isApiRequest(req);

  logger.info({ db, u }, '[Legacy Reset] Password reset request');

  if (!u) {
    if (isJSON) return res.status(200).json([{ error: 'Login required' }]);
    return res.redirect(`/${db}`);
  }

  try {
    const pool = getPool();
    // Look up user by login or email — also fetch password record (id + hash)
    // PHP: SELECT u.id, email.val, pwd.id pwd, phone.val phone, pwd.val old, u.val u
    const { rows: rows } = await execSql(pool, `SELECT u.id uid, u.val uval, email.val email, phone.val phone,
              pwd.id pwdId, pwd.val oldHash
       FROM ${db} u
       LEFT JOIN ${db} email ON email.up=u.id AND email.t=${TYPE.EMAIL}
       LEFT JOIN ${db} phone ON phone.up=u.id AND phone.t=${TYPE.PHONE}
       LEFT JOIN ${db} pwd   ON pwd.up=u.id   AND pwd.t=${TYPE.PASSWORD}
       WHERE (u.val=? OR email.val=?) AND u.t=${TYPE.USER}
       LIMIT 1`, [u, u], { label: 'u_select' });

    if (rows.length === 0) {
      // PHP: login($z, $u, "WRONG_CONT", ...) — user not found
      if (isJSON) {
        return res.status(200).json({
          message: 'WRONG_CONT',
          db,
          login: u,
          details: 'The user name, email or phone invalid set in your Space',
        });
      }
      return res.redirect(`/${db}`);
    }

    const userRow = rows[0];
    const username = userRow.uval;
    // PHP: $pwd = substr(md5(mt_rand()), 0, 6) — generate random 6-char password
    const newPlainPwd = crypto.createHash('md5')
      .update(String(Math.random() * Date.now()))
      .digest('hex')
      .substring(0, 6);
    // PHP: $sha = sha1(Salt($u, $pwd))
    const newHash = phpCompatibleHash(username, newPlainPwd, db);

    const host = req.get('host') || req.hostname || 'localhost';
    const MAIL_REGEX = /^.+@.+\..+$/;

    if (MAIL_REGEX.test(userRow.email)) {
      // --- User has a valid email ---
      if (userRow.pwdId) {
        // User already has a password → send confirmation-required email
        // PHP: password is NOT changed until user clicks confirm link
        const confirmUrl = `https://${host}/${db}/confirm?u=${encodeURIComponent(username)}&p=${newHash}&o=${userRow.oldHash}`;
        const unsubUrl = `https://${host}/my/register?optout=${encodeURIComponent(db)}`;

        await sendMail({
          to: userRow.email,
          subject: `Password reset for ${db}`,
          text: `Your new password: ${newPlainPwd}\r\n`
            + `Confirm it here before use: ${confirmUrl}\r\n\r\n`
            + `Best regards,\r\nIntegram team\r\n\r\n`
            + `In case you do not want to receive messages regarding your registration and the ${db} database, unsubscribe here:\r\n${unsubUrl}`,
          tag: '[Legacy Reset]',
          devLog: { username, newPlainPwd, confirmUrl },
        });

        // Clear auth cookies
        res.cookie(db, '', { maxAge: 0, path: '/' });
        res.cookie('secret', '', { maxAge: 0, path: '/' });

        return res.status(200).json({
          message: 'MAIL',
          db,
          login: username,
          details: 'The password is sent by email, please confirm it by the provided link',
        });
      } else {
        // No password yet → create password record immediately, no confirmation needed
        await insertRow(db, userRow.uid, 1, TYPE.PASSWORD, newHash);
        const loginUrl = `https://${host}/${db}/?login=${encodeURIComponent(username)}`;

        await sendMail({
          to: userRow.email,
          subject: 'Your new password',
          text: `Your new password: ${newPlainPwd}\r\n${loginUrl}`,
          tag: '[Legacy Reset]',
          devLog: { username, newPlainPwd, loginUrl },
        });

        // Clear auth cookies
        res.cookie(db, '', { maxAge: 0, path: '/' });
        res.cookie('secret', '', { maxAge: 0, path: '/' });

        return res.status(200).json({
          message: 'NEW_PWD',
          db,
          login: username,
          details: 'The password is sent by email',
        });
      }
    } else if (userRow.phone && userRow.phone.length > 0) {
      // --- User has a phone number (no valid email) ---
      // PHP normalises phone and sends SMS; we update password immediately
      if (userRow.pwdId) {
        await updateRowValue(db, userRow.pwdId, newHash);
      } else {
        await insertRow(db, userRow.uid, 1, TYPE.PASSWORD, newHash);
      }

      // Clear auth cookies
      res.cookie(db, '', { maxAge: 0, path: '/' });
      res.cookie('secret', '', { maxAge: 0, path: '/' });

      logger.info({ username, phone: userRow.phone }, '[Legacy Reset] SMS password reset (SMS not sent in standalone mode)');

      return res.status(200).json({
        message: 'SMS',
        db,
        login: username,
        details: 'The password is sent via SMS',
      });
    }

    // No valid email or phone — cannot reset
    // PHP: login($z, $u, "WRONG_CONT", ...)
    res.cookie(db, '', { maxAge: 0, path: '/' });
    res.cookie('secret', '', { maxAge: 0, path: '/' });

    return res.status(200).json({
      message: 'WRONG_CONT',
      db,
      login: username,
      details: 'The user name, email or phone invalid set in your Space',
    });
  } catch (error) {
    logger.error({ error: error.message, db, u }, '[Legacy Reset] Error');
    if (isJSON) return res.status(200).json([{ error: 'Reset failed' }]);
    return res.redirect(`/${db}`);
  }
});

// ============================================================================
// createUserDb() — shared DB creation for registration + Google OAuth
// PHP parity: createDb() → mail2DB() → newDb() (index.php lines 350–421)
// ============================================================================

/**
 * Create a user database from template.
 * Derives DB name from email (mail2DB), creates table, copies template data,
 * registers the DB in the user management table.
 *
 * @param {object} pool       - MySQL connection pool
 * @param {string} z          - user management table name (e.g. 'my')
 * @param {number} userId     - user ID in the management table
 * @param {string} email      - user email (used to derive DB name)
 * @param {string} locale     - 'RU' or 'EN'
 * @param {string} [prefix]   - fallback prefix for DB name ('u' for email reg, 'g' for Google)
 * @returns {string}          - created database name, or empty string on failure
 */
async function createUserDb(pool, z, userId, email, locale, prefix = 'u') {
  const USER_DB_MASK = /^[a-z][a-z0-9]{2,14}$/i;

  // mail2DB: derive DB name from email
  let newDbName = '';
  if (email) {
    const emailPrefix = email.split('@')[0].replace(/[^A-Za-z0-9]/g, '').toLowerCase().substring(0, 15);
    if (USER_DB_MASK.test(emailPrefix)) {
      if (await isDbVacant(pool, z, emailPrefix)) {
        newDbName = emailPrefix;
      }
    }
    if (!newDbName) {
      newDbName = `${prefix}${userId}`;
    }
  } else {
    newDbName = `${prefix}${userId}`;
  }

  const template = locale === 'EN' ? 'en' : 'ru';

  try {
    await execSql(pool, `
      CREATE TABLE IF NOT EXISTS \`${newDbName}\` (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        up BIGINT UNSIGNED NOT NULL DEFAULT 0,
        ord INT UNSIGNED NOT NULL DEFAULT 1,
        t BIGINT UNSIGNED NOT NULL DEFAULT 0,
        val TEXT,
        INDEX idx_up (up),
        INDEX idx_t (t),
        INDEX idx_up_t (up, t)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `, [], { label: 'createUserDb_create' });

    // Try to copy from template
    let copiedFromTemplate = false;
    if (isValidDbName(template)) {
      const { rows: tmplExists } = await execSql(pool, `SHOW TABLES LIKE ?`, [template], { label: 'createUserDb_show' });
      if (tmplExists.length > 0) {
        await execSql(pool, `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) SELECT id, up, ord, t, val FROM \`${template}\` WHERE up = 0`, [], { label: 'createUserDb_insert' });
        await execSql(pool, `
          INSERT IGNORE INTO \`${newDbName}\` (id, up, ord, t, val)
          SELECT child.id, child.up, child.ord, child.t, child.val
          FROM \`${template}\` child
          JOIN \`${template}\` parent ON parent.id = child.up AND parent.up = 0
          WHERE child.up != 0
        `, [], { label: 'createUserDb_insert' });
        copiedFromTemplate = true;
      }
    }

    if (!copiedFromTemplate) {
      const initQueries = [
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (1, 0, 1, 1, 'Объект')`,
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (8, 0, 2, 8, 'Строка')`,
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (12, 0, 3, 12, 'Текст')`,
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (13, 0, 4, 13, 'Число')`,
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (9, 0, 5, 9, 'Дата')`,
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (4, 0, 6, 4, 'Дата и время')`,
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (11, 0, 7, 11, 'Да/Нет')`,
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (18, 0, 10, 8, 'Пользователь')`,
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (20, 18, 1, 6, ':!NULL:Пароль')`,
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (30, 18, 2, 8, 'Телефон')`,
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (41, 18, 3, 8, 'Email')`,
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (42, 0, 11, 8, 'Роль')`,
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (125, 0, 12, 8, 'Токен')`,
        `INSERT INTO \`${newDbName}\` (id, up, ord, t, val) VALUES (40, 0, 13, 8, 'XSRF')`,
      ];
      for (const q of initQueries) {
        try { await execSql(pool, q, [], { label: 'createUserDb_query' }); } catch (e) { /* ignore duplicates */ }
      }
    }

    // Register the DB in the management table
    const today = new Date();
    const dateYmd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const dbRecordId = await insertRow(z, userId, 1, TYPE.DATABASE, newDbName);
    await insertRow(z, dbRecordId, 1, 275, dateYmd);
    await insertRow(z, dbRecordId, 1, 283, template);
    await insertRow(z, dbRecordId, 1, 276, locale === 'EN'
      ? 'Test one, created upon registration'
      : 'Тестовая база, создана при регистрации');

    return newDbName;
  } catch (dbErr) {
    logger.error('[createUserDb] Failed', { error: dbErr.message, newDbName });
    return '';
  }
}

// ============================================================================
// Google OAuth — PHP parity (index.php lines 35–36, 161–240)
// ============================================================================

/**
 * Google OAuth redirect — initiates the OAuth flow.
 * The frontend links here; we redirect to Google's consent screen.
 * Optional ?state=<db> is forwarded so the callback can redirect to the right DB.
 *
 * GET /my/google-auth
 */
router.get('/my/google-auth', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    logger.error('[Google OAuth] GOOGLE_CLIENT_ID not configured');
    return res.status(500).json([{ error: 'Google OAuth is not configured on this server' }]);
  }

  const host = req.get('host') || 'localhost';
  const redirectUri = `https://${host}/auth.asp`;
  const state = req.query.state || '';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    state,
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
  logger.info('[Google OAuth] Redirecting to Google', { redirectUri, state });
  return res.redirect(googleAuthUrl);
});

/**
 * Google OAuth callback — exchanges code for tokens, creates/links user.
 * PHP: /auth.asp?code=xxx  (index.php line 35 rewrites $z to "my", then line 161 handles)
 *
 * GET /auth.asp?code=xxx&state=<db>
 */
router.get('/auth.asp', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).json([{ error: 'Missing authorization code' }]);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    logger.error('[Google OAuth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured');
    return res.status(500).json([{ error: 'Google OAuth is not configured on this server' }]);
  }

  const host = req.get('host') || 'localhost';
  const redirectUri = `https://${host}/auth.asp`;
  const stateParam = req.query.state || '';
  const z = 'my'; // PHP: $z = "my" when auth.asp

  try {
    // ── Step 1: Exchange authorization code for tokens ──
    // PHP: curl_init('https://accounts.google.com/o/oauth2/token')
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
    });

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });
    const tokenData = await tokenResp.json();

    if (!tokenData.access_token) {
      logger.error('[Google OAuth] Token exchange failed', { error: tokenData.error, description: tokenData.error_description });
      return res.status(401).json([{ error: 'Google authentication failed', details: tokenData.error_description || tokenData.error }]);
    }

    // ── Step 2: Retrieve user info ──
    // PHP: file_get_contents('https://www.googleapis.com/oauth2/v1/userinfo?...')
    const userInfoParams = new URLSearchParams({
      access_token: tokenData.access_token,
    });
    const userInfoResp = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?${userInfoParams.toString()}`);
    const info = await userInfoResp.json();

    if (!info.id) {
      logger.error('[Google OAuth] Failed to get user info', { info });
      return res.status(401).json([{ error: 'Authentication error' }]);
    }

    logger.info('[Google OAuth] Got user info', { googleId: info.id, email: info.email, name: info.name });

    const pool = getPool();

    // Check if 'my' table exists
    const { rows: tables } = await execSql(pool, `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'my' LIMIT 1`, [], { label: 'get_auth.asp_select' });
    if (tables.length === 0) {
      logger.error('[Google OAuth] my table does not exist');
      return res.status(500).json([{ error: 'User registry not available' }]);
    }

    // ── Step 3: Look up existing user by Google ID (PHP: WHERE user.val=info.id AND user.t=USER) ──
    const USER_DB_MASK = /^[a-z][a-z0-9]{2,14}$/i;
    const targetDb = (stateParam && USER_DB_MASK.test(stateParam)) ? stateParam : '';

    const dbJoinClause = targetDb
      ? `LEFT JOIN ${z} db ON db.up = u.id AND db.t = ${TYPE.DATABASE} AND db.val = '${targetDb}'`
      : `LEFT JOIN ${z} db ON db.up = u.id AND db.t = ${TYPE.DATABASE}`;

    const { rows: existingRows } = await execSql(pool, `SELECT u.id AS uid, tok.id AS tok_id, tok.val AS token, xsrf.id AS xsrf_id,
              act.id AS act_id, db.val AS db_name
       FROM ${z} u
       LEFT JOIN ${z} tok ON tok.up = u.id AND tok.t = ${TYPE.TOKEN}
       LEFT JOIN ${z} xsrf ON xsrf.up = u.id AND xsrf.t = ${TYPE.XSRF}
       LEFT JOIN ${z} act ON act.up = u.id AND act.t = ${TYPE.ACTIVITY}
       ${dbJoinClause}
       WHERE u.val = ? AND u.t = ${TYPE.USER}
       LIMIT 1`, [String(info.id)], { label: 'targetDb_select' });

    let token;
    let finalDb = z;

    if (existingRows.length > 0) {
      // ── Existing user — update tokens (PHP: updateTokens) ──
      const row = existingRows[0];

      const updated = await updateTokens(pool, z, {
        uid: row.uid,
        tok: row.tok_id,
        xsrf: row.xsrf_id,
        act: row.act_id,
      });
      token = updated.token;

      if (row.db_name) {
        finalDb = row.db_name;
        // PHP: get the token of the target DB for the google user
        const { rows: dbUserRows } = await execSql(pool, `SELECT u.id, tok.val AS tok, xsrf.val AS xsrf
           FROM \`${finalDb}\` u
           LEFT JOIN \`${finalDb}\` tok ON tok.up = u.id AND tok.t = ${TYPE.TOKEN}
           LEFT JOIN \`${finalDb}\` xsrf ON xsrf.up = u.id AND xsrf.t = ${TYPE.XSRF}
           WHERE u.val = ? AND u.t = ${TYPE.USER}
           LIMIT 1`, [finalDb], { label: 'targetDb_select' });
        if (dbUserRows.length > 0) {
          const dbUser = dbUserRows[0];
          if (dbUser.tok) {
            token = dbUser.tok;
          } else {
            token = generateToken();
            await insertRow(finalDb, dbUser.id, 1, TYPE.TOKEN, token);
          }
          if (!dbUser.xsrf) {
            await insertRow(finalDb, dbUser.id, 1, TYPE.XSRF, generateXsrf(token, finalDb, finalDb));
          }
        } else {
          logger.warn('[Google OAuth] Admin user not found in target DB', { finalDb });
        }
      }

      // PHP: setcookie($z, $token, time() + 2592000*12, "/")  — 30*12 days
      res.cookie(finalDb, token, { maxAge: 2592000 * 12 * 1000, path: '/' });
      logger.info('[Google OAuth] Existing user logged in', { uid: row.uid, db: finalDb });
    } else {
      // ── New user — create (PHP: newUser + Insert social + createDb) ──
      // PHP: newUser($info["id"], $info["email"], "115", $info["name"], $info["picture"])
      const userId = await insertRow(z, 1, 0, TYPE.USER, String(info.id));
      await insertRow(z, userId, 1, TYPE.EMAIL, info.email || '');
      await insertRow(z, userId, 1, 164, '115'); // role link
      const today = new Date();
      const dateYmd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      await insertRow(z, userId, 1, 156, dateYmd); // date
      if (info.name) {
        await insertRow(z, userId, 1, 33, info.name); // name
      }
      if (info.picture) {
        await insertRow(z, userId, 1, 280, info.picture); // picture
      }

      // PHP: Insert($id, 1, 274, "Google", "Set social for new G user")
      await insertRow(z, userId, 1, 274, 'Google');

      // Generate token + xsrf
      token = generateToken();
      const xsrf = generateXsrf(token, z, z);
      await insertRow(z, userId, 1, TYPE.TOKEN, token);
      await insertRow(z, userId, 1, TYPE.XSRF, xsrf);

      // Affiliate cookie (PHP: $_COOKIE["_aff"])
      if (req.cookies._aff) {
        await insertRow(z, userId, 1, 1012, String(parseInt(req.cookies._aff, 10) || 0));
      }

      res.cookie(z, token, { maxAge: 2592000 * 12 * 1000, path: '/' });

      // Create user's database (PHP: createDb -> mail2DB -> newDb)
      const locale = req.cookies[z + '_locale'] || req.cookies.my_locale || 'RU';
      const newDbName = await createUserDb(pool, z, userId, info.email, locale, 'g');
      if (newDbName) {
        finalDb = newDbName;
        res.cookie(finalDb, token, { maxAge: 2592000 * 12 * 1000, path: '/' });
        logger.info('[Google OAuth] New user + DB created', { userId, email: info.email, db: finalDb });
      } else {
        // Still let them in to /my even if DB creation failed
        finalDb = z;
      }
    }

    // PHP: header("Location: ".(isset($_GET['state'])?$_GET['state']:"/$z"))
    const redirectTo = stateParam || `/${finalDb}`;
    return res.redirect(redirectTo);
  } catch (err) {
    logger.error('[Google OAuth] Error', { error: err.message, stack: err.stack });
    return res.status(500).json([{ error: 'Google authentication failed', details: err.message }]);
  }
});

/**
 * Email confirmation handler (my/register GET)
 * GET /my/register?u={userId}&c={confirmToken}
 * GET /my/register?optout={userId}
 *
 * PHP parity: index.php lines 83–104 (confirm), 156–157 (optout)
 */
router.get('/my/register', async (req, res) => {
  // Optout handler (PHP line 156-157)
  if (req.query.optout) {
    const locale = getLocale(req, 'my');
    return res.send(t9n('optout_message', locale)
      || 'You have cancelled the email subscription');
  }

  const { u, c } = req.query;
  if (!u || !c) {
    return res.redirect('/my');
  }

  const userId = parseInt(u, 10);
  if (!userId) {
    return res.redirect('/my');
  }

  try {
    const pool = getPool();

    // PHP lines 86-93: SELECT with JOINs
    const { rows: rows } = await execSql(pool, `
      SELECT user.val AS user, user.id AS uid,
             token.id AS tok, token.val AS token,
             xsrf.id AS xsrf, act.id AS act,
             pwd.val AS pwd, pwd.id AS pid,
             email.val AS email
      FROM my user
      LEFT JOIN my token ON token.up = user.id AND token.t = ${TYPE.TOKEN}
      LEFT JOIN my xsrf ON xsrf.up = user.id AND xsrf.t = ${TYPE.XSRF}
      LEFT JOIN my pwd ON pwd.up = user.id AND pwd.t = ${TYPE.PASSWORD}
      LEFT JOIN my act ON act.up = user.id AND act.t = ${TYPE.ACTIVITY}
      LEFT JOIN my email ON email.up = user.id AND email.t = ${TYPE.EMAIL}
      WHERE user.id = ? AND user.t = ${TYPE.USER}
    `, [userId], { label: 'get_my_register_select' });

    if (!rows.length || !rows[0].uid) {
      return res.json([{ error: 'EXPIRED' }]);
    }

    const row = rows[0];

    // Validate confirmation token
    if (row.token !== c) {
      return res.json([{ error: 'EXPIRED' }]);
    }

    // PHP line 97: Hash plaintext password — sha1(Salt(username, plaintext_pwd))
    const hashedPwd = phpCompatibleHash(row.user, row.pwd, 'my');
    await execSql(pool, 'UPDATE my SET val = ? WHERE id = ?', [hashedPwd, row.pid], { label: 'get_my_register_update' });

    // PHP line 98: updateTokens(row) — create/update token, xsrf, activity + set cookie
    const { token } = await updateTokens(pool, 'my', row);

    res.cookie('my', token, { maxAge: 2592000 * 12 * 1000, path: '/' });

    // PHP line 99: createDb(uid, "", email, pwd)
    const locale = getLocale(req, 'my');
    const emailAddr = row.email || row.user;
    const newDbName = await createUserDb(pool, 'my', row.uid, emailAddr, locale, 'u');
    if (newDbName) {
      res.cookie(newDbName, token, { maxAge: 2592000 * 12 * 1000, path: '/' });
      logger.info('[Legacy Register] Confirmation: user + DB created', { userId: row.uid, db: newDbName });
    }

    // PHP line 100: redirect
    return res.redirect('/my');
  } catch (err) {
    logger.error('[Legacy Register] Confirmation error', { error: err.message, userId });
    return res.status(500).json([{ error: 'Confirmation failed' }]);
  }
});

/**
 * Registration endpoint (my/register)
 * POST /my/register
 */
router.post('/my/register', async (req, res) => {
  const { email, regpwd, regpwd1, agree } = req.body;
  const isJSON = isApiRequest(req);

  logger.info('[Legacy Register] Request', { email });

  // Validate input
  const locale = getLocale(req, 'my');
  if (!email || !/^.+@.+\..+$/.test(email)) {
    const msg = t9n('invalid_email', locale);
    if (isJSON) {
      return res.json([{ error: msg }]);
    }
    return res.status(400).send(msg);
  }

  if (!regpwd || regpwd.length < 6) {
    const msg = t9n('password_too_short', locale);
    if (isJSON) {
      return res.json([{ error: msg }]);
    }
    return res.status(400).send(msg);
  }

  if (regpwd !== regpwd1) {
    const msg = t9n('passwords_mismatch', locale);
    if (isJSON) {
      return res.json([{ error: msg }]);
    }
    return res.status(400).send(msg);
  }

  if (!agree) {
    const msg = t9n('accept_terms', locale);
    if (isJSON) return res.json([{ error: msg }]);
    return res.status(400).send(msg);
  }

  // PHP creates the user in the 'my' table (multi-tenant global users DB).
  // In standalone mode we do the same if the 'my' table exists, otherwise skip.
  try {
    const pool = getPool();

    // Check if 'my' table exists
    const { rows: tables } = await execSql(pool, `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'my' LIMIT 1`, [], { label: 'post_my_register_select' });

    if (tables.length > 0) {
      // Check uniqueness: PHP line 124
      const { rows: existing } = await execSql(pool, `SELECT id FROM my WHERE val = ? AND t = ${TYPE.USER} LIMIT 1`, [email.toLowerCase()], { label: 'post_my_register_select' });
      if (existing.length > 0) {
        const msg = t9n('email_registered', locale) + ' [errMailExists]';
        if (isJSON) return res.json([{ error: msg }]);
        return res.status(400).send(msg);
      }

      // PHP newUser($email, $email, "115", "", "") — Insert(1, 0, USER, email, ...)
      // up=1 (root), ord=0 (literal), NOT under parent 115
      const userId = await insertRow('my', 1, 0, TYPE.USER, email.toLowerCase());

      // PHP newUser also inserts: EMAIL, role link (164), date (156) — all ord=1
      const today = new Date();
      const dateYmd = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
      await insertRow('my', userId, 1, TYPE.EMAIL, email.toLowerCase());
      await insertRow('my', userId, 1, 164, '115');
      await insertRow('my', userId, 1, 156, dateYmd);

      // Insert raw password (PHP inserts plaintext first; on confirm, it hashes it)
      await insertRow('my', userId, 1, TYPE.PASSWORD, regpwd);

      // Confirmation token = md5("xz" + email) — no email sent in standalone mode
      const confirmToken = crypto.createHash('md5').update(`xz${email.toLowerCase()}`).digest('hex');
      await insertRow('my', userId, 1, TYPE.TOKEN, confirmToken);

      // Send confirmation email (PHP parity: mail() with confirmation link)
      const host = req.get('host') || 'localhost';
      const confirmUrl = `https://${host}/my/register?u=${userId}&c=${confirmToken}`;
      await sendMail({
        to: email,
        subject: `Подтверждение регистрации ${email}`,
        text: `Для подтверждения регистрации перейдите по ссылке:\r\n${confirmUrl}`,
        tag: '[Legacy Register]',
        devLog: { email, confirmToken, confirmUrl },
      });

      logger.info('[Legacy Register] User created in my table', { email, userId, confirmToken });
    } else {
      logger.info('[Legacy Register] my table not found, skipping DB insert', { email });
    }
  } catch (err) {
    logger.error('[Legacy Register] DB error', { error: err.message, email });
    if (isJSON) return res.json([{ error: 'Registration failed: ' + err.message }]);
    return res.status(500).send('Registration failed');
  }

  logger.info('[Legacy Register] Success', { email });

  // PHP calls login($db, "", "toConfirm") which with isApi() returns:
  // {"message":"toConfirm","db":"my","login":"","details":""}
  if (isJSON) {
    return res.json({ message: 'toConfirm', db: 'my', login: '', details: '' });
  }

  return res.redirect('/my');
});

/**
 * Logout endpoint
 * POST /:db/exit or GET /:db/exit
 */
router.all('/:db/exit', async (req, res) => {
  const { db } = req.params;

  // Delete ALL user tokens (PHP: DELETE FROM $z WHERE up=user_id AND t=TOKEN)
  const token = extractToken(req, db);
  if (token && isValidDbName(db)) {
    try {
      const pool = getPool();
      // Look up userId from the current token
      const { rows: tokenRows } = await execSql(pool, `SELECT up FROM \`${db}\` WHERE t = ${TYPE.TOKEN} AND val = ? LIMIT 1`, [token], { label: 'query_select' });
      if (tokenRows.length > 0) {
        const userId = tokenRows[0].up;
        // Delete ALL tokens for this user (logs out all sessions)
        await execSql(pool, `DELETE FROM \`${db}\` WHERE up = ? AND t = ${TYPE.TOKEN}`, [userId], { label: 'query_delete' });
      }
    } catch (err) {
      logger.error({ error: err.message, db }, '[Legacy Exit] DB error on token delete');
    }
  }

  // Clear the session cookie
  res.clearCookie(db, { path: '/' });

  logger.info('[Legacy Exit] Logout', { db });

  // PHP exit calls login($z) which with isApi() returns:
  // {"message":"","db":"<db>","login":"","details":""}
  if (isApiRequest(req)) {
    return res.json({ message: '', db, login: '', details: '' });
  }

  // Redirect to login page
  return res.redirect(`/${db}`);
});

// ============================================================================
// action=object / action=edit_obj in POST /:db (P2 Medium priority)
// PHP: index.php lines 4056–4085
// JS client navigates to /:db with action=object&id=<n> to view/edit an object.
// ============================================================================

/**
 * Handle action=object and action=edit_obj in POST /:db
 * PHP renders the object.html or edit_obj.html template for these actions.
 * This intercepts before the generic page-renderer handles it.
 */
router.post('/:db', async (req, res, next) => {
  const { db } = req.params;
  if (!isValidDbName(db)) return next();

  const action = req.body.action || req.query.action;

  if (action !== 'object' && action !== 'edit_obj') {
    return next();
  }

  const id = parseInt(req.body.id || req.query.id, 10);
  if (!id) {
    return res.status(200).send('Object id is empty or 0');
  }

  // Map action to template file (PHP: renders object.html or edit_obj.html)
  const templateFile = action === 'object' ? 'templates/object.html' : 'templates/edit_obj.html';
  const templatePath = path.join(legacyPath, templateFile);

  if (fs.existsSync(templatePath)) {
    logger.info('[Legacy action=' + action + '] Serving template', { db, id });
    return res.sendFile(templatePath);
  }

  // Fallback: serve main page
  return next();
});

/**
 * POST /:db — native form submission after AJAX auth
 *
 * PHP behaviour: after AJAX POST /:db/auth?JSON sets the token cookie,
 * login.html does a native form.submit() with action="/:db" (method="post").
 * PHP handles POST /:db (action="") by checking the auth cookie and serving
 * the main page HTML directly (no redirect). Node.js replicates this.
 */
router.post('/:db', async (req, res, next) => {
  const { db } = req.params;
  if (!isValidDbName(db)) return next();

  // Pass report action to the dedicated report handler
  const action = req.body?.action || req.query?.action;
  if (action === 'report') return next();

  const token = extractToken(req, db);

  if (!token) {
    // Not authenticated — serve login page (same as GET /:db without token)
    const loginPage = path.join(legacyPath, 'index.html');
    if (fs.existsSync(loginPage)) return res.sendFile(loginPage);
    const loginHtml = path.join(legacyPath, 'login.html');
    if (fs.existsSync(loginHtml)) return res.sendFile(loginHtml);
    return res.redirect(302, '/' + db);
  }

  // Token present — serve main app page directly (PHP: renders main.html)
  try {
    const pool = getPool();
    const { rows: rows } = await execSql(pool, `SELECT user.id FROM ${db} user JOIN ${db} token ON token.up = user.id AND token.t = ${TYPE.TOKEN} WHERE token.val = ? AND user.t = ${TYPE.USER} LIMIT 1`, [token], { label: 'post_db_select' });

    if (rows.length === 0) {
      res.clearCookie(db, { path: '/' });
      const loginPage = path.join(legacyPath, 'index.html');
      if (fs.existsSync(loginPage)) return res.sendFile(loginPage);
      return res.redirect(302, '/' + db);
    }

    const locale = getLocale(req, db);
    const rendered = await renderMainPage(db, token, locale);
    if (rendered) {
      return res.type('html').send(rendered);
    }
    return res.status(404).send('Main page not found');

  } catch (error) {
    logger.error({ error: error.message, db }, '[POST /:db] Error');
    res.clearCookie(db, { path: '/' });
    return res.redirect(302, '/' + db);
  }
});

/**
 * Serve login page for database access
 * GET /:db (when no token cookie is present)
 *
 * This serves the login.html or index.html page from integram-server
 */

// Root path — serve login page
router.get('/', (req, res) => {
  const indexPage = path.join(legacyPath, 'index.html');
  if (fs.existsSync(indexPage)) return res.sendFile(indexPage);
  const loginPage = path.join(legacyPath, 'login.html');
  if (fs.existsSync(loginPage)) return res.sendFile(loginPage);
  return res.status(404).send('Login page not found');
});

router.get('/:db', async (req, res, next) => {
  const { db } = req.params;

  // Skip if it looks like an API request or has an action
  if (db.startsWith('_') || db.startsWith('api') || db === 'health' || db === 'ws') {
    return next();
  }

  // Validate DB name
  if (!isValidDbName(db)) {
    return next();
  }

  const token = extractToken(req, db);

  logger.info('[Legacy Page] Request', { db, hasToken: !!token });

  if (!token) {
    // JSON API request without token gets 401
    if (isApiRequest(req)) {
      return res.status(401).json([{ error: 'Unauthorized', hint: `POST /${db}/auth?JSON with login+pwd to get token` }]);
    }
    // Serve login page
    const loginPage = path.join(legacyPath, 'index.html');
    if (fs.existsSync(loginPage)) {
      return res.sendFile(loginPage);
    }
    // Fallback: redirect to login.html
    const loginHtml = path.join(legacyPath, 'login.html');
    if (fs.existsSync(loginHtml)) {
      return res.sendFile(loginHtml);
    }
    return res.status(404).send('Login page not found');
  }

  // User has token - validate it and serve main app
  try {
    // Check if database exists
    if (!await dbExists(db)) {
      res.clearCookie(db, { path: '/' });
      if (isApiRequest(req)) {
        return res.status(404).json([{ error: 'Database not found' }]);
      }
      return res.redirect(`/${db}`);
    }

    const pool = getPool();

    // Validate token and get user info
    // Role assignment rows have t = roleObjectId (e.g. 145), not t = TYPE.ROLE(42).
    // Use CROSS JOIN to find role_def where role_def.id = r.t AND role_def.t = TYPE.ROLE.
    const query = `
      SELECT user.id AS uid, user.val AS username,
             xsrf.val AS xsrf_val, role_def.val AS role_val, role_def.id AS role_id
      FROM \`${db}\` user
      JOIN \`${db}\` token ON token.up = user.id AND token.t = ${TYPE.TOKEN}
      LEFT JOIN \`${db}\` xsrf ON xsrf.up = user.id AND xsrf.t = ${TYPE.XSRF}
      LEFT JOIN (\`${db}\` r CROSS JOIN \`${db}\` role_def)
        ON r.up = user.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
      WHERE token.val = ? AND user.t = ${TYPE.USER}
      LIMIT 1
    `;

    const { rows: rows } = await execSql(pool, query, [token], { label: 'get_db_query' });

    if (rows.length === 0) {
      // Invalid token - clear cookie and redirect to login
      res.clearCookie(db, { path: '/' });
      if (isApiRequest(req)) {
        return res.status(401).json([{ error: 'Invalid token' }]);
      }
      return res.redirect(`/${db}`);
    }

    const user = rows[0];

    // ── GET /:db/?JSON → Main page API response
    // PHP returns: {user, role, _xsrf, &main.myrolemenu, etc.}
    if (isApiRequest(req)) {
      // Get role menu items from role row's menu children
      const roleMenu = await buildMyrolemenu(pool, db, user.role_id || null);
      const menuHrefs = roleMenu.href;
      const menuNames = roleMenu.name;

      // Get available terms/types for the user
      const { rows: termsRows } = await execSql(pool, `SELECT a.id, a.val AS name, a.t AS type, a.ord
         FROM \`${db}\` a
         WHERE a.up <= 1 AND a.id != a.t AND a.val != '' AND a.t != 0
         ORDER BY a.val`, [], { label: 'get_db_select' });
      // Filter out CALCULATABLE and BUTTON types
      const terms = termsRows.filter(t => {
        const bt = REV_BASE_TYPE[t.type];
        return bt !== 'CALCULATABLE' && bt !== 'BUTTON';
      });

      return res.json({
        user: user.username,
        user_id: user.uid,
        role: user.role_val || '',
        _xsrf: user.xsrf_val || '',
        token: token,
        '&main.myrolemenu': {
          href: menuHrefs,
          name: menuNames,
        },
        terms: terms.map(t => ({ id: t.id, name: t.name, type: t.type })),
      });
    }

    // Valid token - render main page with template variables
    const locale = getLocale(req, db);
    const rendered = await renderMainPage(db, token, locale);
    if (rendered) {
      return res.type('html').send(rendered);
    }
    return res.status(404).send('Main page not found');

  } catch (error) {
    logger.error('[Legacy Page] Error', { error: error.message, db });
    // On error, clear cookie and redirect to login
    res.clearCookie(db, { path: '/' });
    return res.redirect(`/${db}`);
  }
});

/**
 * Serve specific pages within database context
 * GET /:db/:page (e.g., /my/dict, /my/object/18)
 */
router.get('/:db/:page*', async (req, res, next) => {
  const { db, page } = req.params;
  const fullPath = req.params[0] || '';

  // Skip API-like requests
  if (db.startsWith('_') || db === 'api' || page.startsWith('_')) {
    return next();
  }

  // Validate DB name
  if (!isValidDbName(db)) {
    return next();
  }

  const token = extractToken(req, db);

  // If no token and not auth-related, redirect to login
  // JSON API requests get a 401 instead of a redirect
  if (!token && page !== 'auth' && page !== 'login' && page !== 'register') {
    if (isApiRequest(req)) {
      return res.status(401).json([{ error: 'Unauthorized', hint: `POST /${db}/auth?JSON with login+pwd to get token` }]);
    }
    return res.redirect(`/${db}?uri=${encodeURIComponent(req.originalUrl)}`);
  }

  logger.info('[Legacy SubPage] Request', { db, page, fullPath });

  // ── JSON API: PHP-compatible responses for object/edit_obj pages ─────────
  // PHP routes /:db/object/:typeId?JSON and /:db/edit_obj/:id?JSON fall to the
  // default: case in index.php which populates $GLOBALS["GLOBAL_VARS"]["api"]
  // and returns json_encode() when isApi() is true.
  if (isApiRequest(req)) {
    const subId = parseInt((fullPath || '').replace(/^\//, ''), 10) || 0;

    // JSON requested but page is a template page without required sub-id → JSON error
    if ((page === 'object' || page === 'edit_obj') && !subId) {
      return res.status(200).json([{ error: `typeId required: /${db}/${page}/{id}?JSON` }]);
    }

    // report + JSON: always pass to the dedicated report API route (list or detail)
    if (page === 'report') {
      return next();
    }

    try {
      const pool = getPool();

      // ── GET/POST /:db/object/:typeId?JSON → {"object":[{id,val,up,base,ord}]}
      // ── GET     /:db/object/:typeId?JSON_DATA → [{i,u,o,r:[vals]}] compact
      // Supports: LIMIT=N or LIMIT=offset,N, order_val=val, desc=1,
      //           F_{typeId}=value (filter main val, used by dubRecUniqText)
      if (page === 'object' && subId) {
        const allObjParams = { ...req.query, ...req.body };

        // Filter by main val exact match (dubRecUniqText sends F_{tid}=value)
        const filterVal = allObjParams[`F_${subId}`] !== undefined
          ? String(allObjParams[`F_${subId}`]) : null;

        // Filter by parent (F_U=parentId) — used by doEditArr and object panel filters
        const filterUp = allObjParams.F_U !== undefined
          ? parseInt(allObjParams.F_U, 10) : null;

        // Order (dubRecUniqNum sends order_val=val&desc=1 to get max value)
        const orderByVal = allObjParams.order_val === 'val';
        const descOrder  = String(allObjParams.desc) === '1';

        // LIMIT (format: "N" or "offset,N"; PHP default = 20)
        let objLimit = 20, objOffset = 0;  // PHP default limit
        const rawObjLimit = allObjParams.LIMIT || allObjParams.limit;
        if (rawObjLimit !== undefined) {
          const parts = String(rawObjLimit).split(',');
          if (parts.length === 2) {
            objOffset = parseInt(parts[0], 10) || 0;
            objLimit  = parseInt(parts[1], 10) || 20;
          } else {
            objLimit = parseInt(parts[0], 10) || 20;
          }
        }

        const objWhereParts  = ['a.t = ?', 'a.up != 0'];  // up=0 = type root row, excluded like PHP
        const objWhereParams = [subId];
        if (filterVal !== null) {
          objWhereParts.push('a.val = ?');
          objWhereParams.push(filterVal);
        }
        // F__val_ = filter on main val field (from object.html name column search)
        if (allObjParams['F__val_'] !== undefined && String(allObjParams['F__val_']) !== '') {
          const vf = String(allObjParams['F__val_']);
          const vp = vf.includes('%') ? vf : `%${vf}%`;
          objWhereParts.push('a.val LIKE ?');
          objWhereParams.push(vp);
        }
        if (filterUp !== null && !isNaN(filterUp)) {
          objWhereParts.push('a.up = ?');
          objWhereParams.push(filterUp);
        }

        // Column filters: F_{colId}=value, FR_{colId}=from, TO_{colId}=to
        // Build consolidated filter dict: { reqId: {F: val, FR: from, TO: to} }
        const colFilterDict = {};
        for (const [k, v] of Object.entries(allObjParams)) {
          if (v === undefined || String(v) === '') continue;
          const fm = k.match(/^F_(\d+)$/);
          if (fm && String(fm[1]) !== String(subId)) {
            if (!colFilterDict[fm[1]]) colFilterDict[fm[1]] = {};
            colFilterDict[fm[1]].F = checkInjection(String(v));
          }
          const frm = k.match(/^FR_(\d+)$/);
          if (frm) {
            if (!colFilterDict[frm[1]]) colFilterDict[frm[1]] = {};
            colFilterDict[frm[1]].FR = checkInjection(String(v));
          }
          const tom = k.match(/^TO_(\d+)$/);
          if (tom) {
            if (!colFilterDict[tom[1]]) colFilterDict[tom[1]] = {};
            colFilterDict[tom[1]].TO = checkInjection(String(v));
          }
        }

        // If we have column filters, load requisite metadata for constructWhere context
        let objJoinStr = '';
        let objDistinct = false;
        const filterKeys = Object.keys(colFilterDict);
        if (filterKeys.length > 0) {
          // Load lightweight req type metadata (base type + ref type)
          const { rows: reqMeta } = await execSql(pool, `SELECT a.t AS req_id,
                    CASE WHEN refs.id IS NULL THEN typs.t ELSE refs.t END AS base_typ,
                    refs.id AS ref_id, arrs.id AS arr_id
             FROM \`${db}\` a, \`${db}\` typs
             LEFT JOIN \`${db}\` refs ON refs.id=typs.t AND refs.t!=refs.id
             LEFT JOIN \`${db}\` arrs ON refs.id IS NULL AND arrs.up=typs.id AND arrs.ord=1
             WHERE a.up=? AND typs.id=a.t ORDER BY a.ord`, [subId], { label: 'query_select' });

          const revBT = {};
          const refTyps = {};
          const multiKeys = new Set();
          for (const rm of reqMeta) {
            const k = String(rm.req_id);
            revBT[k] = rm.base_typ === 0 ? 'TAB_DELIMITER' : (REV_BASE_TYPE[rm.base_typ] || 'SHORT');
            if (rm.ref_id != null) refTyps[k] = String(rm.ref_id);
            if (rm.arr_id != null) multiKeys.add(k);
          }

          const cwCtx = { revBT, refTyps, multi: multiKeys, db };
          for (const [colId, filterObj] of Object.entries(colFilterDict)) {
            const cw = constructWhere(colId, filterObj, String(subId), colId, cwCtx);
            if (cw.where) {
              // constructWhere output uses "vals" alias; replace with "a" for object list query
              objWhereParts.push(cw.where.replace(/^ AND /, '').replace(/\bvals\./g, 'a.'));
              objWhereParams.push(...cw.params);
            }
            if (cw.join) {
              // Replace "vals" with "a" in JOIN clauses
              objJoinStr += cw.join.replace(/\bvals\./g, 'a.');
            }
            if (cw.distinct) objDistinct = true;
          }
        }

        const whereStr = objWhereParts.join(' AND ');

        // Sort: order_val=val → sort by main val; order_val={colId} → sort by req value
        const orderColId = (allObjParams.order_val && allObjParams.order_val !== 'val')
          ? parseInt(allObjParams.order_val, 10) : null;
        let objOrderStr;
        if (orderColId) {
          objOrderStr = `(SELECT r.val FROM \`${db}\` r WHERE r.up = a.id AND r.t = ${orderColId} LIMIT 1) ${descOrder ? 'DESC' : 'ASC'}, a.id`;
        } else if (orderByVal) {
          objOrderStr = `a.val ${descOrder ? 'DESC' : 'ASC'}`;
        } else {
          objOrderStr = 'a.id';
        }
        const objLimitStr = ` LIMIT ${objOffset}, ${objLimit}`;

        // Total count (same WHERE, no LIMIT); uses JOIN when constructWhere produced JOINs
        const distinctKw = objDistinct ? 'DISTINCT ' : '';
        const { rows: [countRow] } = await execSql(pool, `SELECT COUNT(${distinctKw}a.id) AS cnt FROM \`${db}\` a${objJoinStr} WHERE ${whereStr}`, objWhereParams, { label: 'orderColId_select' });
        const objTotal = countRow ? Number(countRow.cnt) : 0;

        const { rows: objRows } = await execSql(pool, `SELECT ${distinctKw}a.id, a.val, a.up, a.t AS base, a.ord FROM \`${db}\` a${objJoinStr} WHERE ${whereStr} ORDER BY ${objOrderStr}${objLimitStr}`, objWhereParams, { label: 'orderColId_select' });

        if (req.query.JSON_DATA !== undefined) {
          // Compact format: each row → {i:id, u:up, o:ord, r:[req_val,...]}
          // Get requisite type IDs for this type (defines column order)
          const { rows: reqDefs } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE up = ? ORDER BY ord`, [subId], { label: 'orderColId_select' });
          const reqIds = reqDefs.map(r => r.id);

          // Batch-load all requisite values for all objects
          const reqMap = {};
          if (objRows.length > 0 && reqIds.length > 0) {
            const objIds = objRows.map(r => r.id);
            const ph = objIds.map(() => '?').join(',');
            const { rows: reqVals } = await execSql(pool, `SELECT up, t, val FROM \`${db}\` WHERE up IN (${ph}) ORDER BY up, ord`, objIds, { label: 'orderColId_select' });
            for (const rv of reqVals) {
              if (!reqMap[rv.up]) reqMap[rv.up] = {};
              reqMap[rv.up][rv.t] = rv.val;
            }
          }

          return res.json(objRows.map(obj => ({
            i: obj.id,
            u: obj.up,
            o: obj.ord,
            r: reqIds.map(rid => (reqMap[obj.id] && reqMap[obj.id][rid] !== undefined)
              ? reqMap[obj.id][rid] : null),
          })));
        }

        // Standard JSON: PHP-compatible full format
        // Matches PHP index.php object API response builder exactly.

        // ── 1. Type metadata ────────────────────────────────────────────────
        const { rows: [typeRow = undefined] } = await execSql(pool, `SELECT t.id, t.val, t.t AS base_type_id, t.up, t.ord AS type_ord
           FROM \`${db}\` t
           WHERE t.id = ?`, [subId], { label: 'orderColId_select' });

        // ── 2. Req field definitions — PHP-compatible SQL (index.php line 5770) ──
        // Key = typs.id when arr child exists (ord=1); a.id otherwise.
        // ref_id set when type refs a non-self-referential type (rare).
        // arr_id set when no ref and type has a first child.
        const { rows: reqDefStd } = await execSql(pool, `SELECT CASE WHEN arrs.id IS NULL THEN a.id ELSE typs.id END AS t,
                  CASE WHEN refs.id IS NULL THEN typs.t ELSE refs.t END AS base_typ,
                  CASE WHEN refs.id IS NULL THEN typs.val ELSE refs.val END AS type_val,
                  refs.id AS ref_id, arrs.id AS arr_id, a.val AS attrs,
                  a.id AS req_row_id, a.t AS req_t
           FROM \`${db}\` a, \`${db}\` typs
           LEFT JOIN \`${db}\` refs ON refs.id=typs.t AND refs.t!=refs.id
           LEFT JOIN \`${db}\` arrs ON refs.id IS NULL AND arrs.up=typs.id AND arrs.ord=1
           WHERE a.up=? AND typs.id=a.t ORDER BY a.ord`, [subId], { label: 'orderColId_select' });

        // ── 3. Build req_base / req_base_id / req_type / req_order / req_attrs / arr_type / ref_type ──
        const req_base    = {};
        const req_base_id = {};
        const req_type    = {};
        const req_attrs   = {};
        const req_order   = [];
        const arr_type    = {};
        const ref_type    = {};
        for (const rd of reqDefStd) {
          const k = String(rd.t);
          // PHP: base_typ=0 → 'TAB_DELIMITER' in req_base (section separator)
          req_base[k]    = rd.base_typ === 0 ? 'TAB_DELIMITER' : (REV_BASE_TYPE[rd.base_typ] || 'SHORT');
          req_base_id[k] = String(rd.base_typ);
          // PHP: FetchAlias extracts :ALIAS=xxx: from attrs, uses as display name
          const aliasMatch = (rd.attrs || '').match(/:ALIAS=(.*?):/u);
          req_type[k]    = aliasMatch ? aliasMatch[1] : (rd.type_val || String(rd.req_t));
          req_attrs[k]   = rd.attrs || '';
          req_order.push(k);
          if (rd.arr_id != null) arr_type[k] = String(rd.arr_id);
          if (rd.ref_id != null) ref_type[k] = String(rd.ref_id);
        }

        // ── 5. Fetch req values for objects (reqs map) ─────────────────────
        // arr-type reqs: count children (data row t = key) → integer count
        // non-arr reqs: first val where data row t = req_t → string val
        const reqsStd    = {};
        let   refDataStd = {};  // {oKey: {k: {ref_obj_id, ref_obj_name}}} for view_reqs links
        if (objRows.length > 0 && reqDefStd.length > 0) {
          const objIds = objRows.map(r => r.id);
          const ph     = objIds.map(() => '?').join(',');

          // Arr-type: key = typs.id = data row's t → COUNT
          const arrDefs = reqDefStd.filter(rd => rd.arr_id != null);
          if (arrDefs.length > 0) {
            const arrKeys = arrDefs.map(rd => rd.t);
            const phArr   = arrKeys.map(() => '?').join(',');
            const { rows: cntRows } = await execSql(pool, `SELECT up, t, COUNT(*) AS cnt FROM \`${db}\`
               WHERE up IN (${ph}) AND t IN (${phArr}) GROUP BY up, t`, [...objIds, ...arrKeys], { label: 'aliasMatch_select' });
            for (const cr of cntRows) {
              const oKey = String(cr.up);
              const k    = String(cr.t);
              if (!reqsStd[oKey]) reqsStd[oKey] = {};
              reqsStd[oKey][k] = Number(cr.cnt);
            }
          }

          // Non-arr non-ref: data row's t = rd.t (req def id), val = stored value
          const nonRefNonArrDefs = reqDefStd.filter(rd => rd.arr_id == null && rd.ref_id == null);
          if (nonRefNonArrDefs.length > 0) {
            const nonArrKeys = nonRefNonArrDefs.map(rd => rd.t);
            const phNA       = nonArrKeys.map(() => '?').join(',');
            const { rows: valRows } = await execSql(pool, `SELECT up, id, t, val FROM \`${db}\`
               WHERE up IN (${ph}) AND t IN (${phNA}) AND val != '' ORDER BY up, ord`, [...objIds, ...nonArrKeys], { label: 'aliasMatch_select' });
            for (const vr of valRows) {
              const k    = String(vr.t);
              const oKey = String(vr.up);
              if (!reqsStd[oKey]) reqsStd[oKey] = {};
              if (reqsStd[oKey][k] === undefined) {
                if (req_base[k] === 'FILE') {
                  // PHP: reqs val = Format_Val_View(FILE, req_id+':'+val) = <a href="...">name</a>
                  reqsStd[oKey][k] = buildObjFileLink(db, vr.id, vr.val);
                } else {
                  reqsStd[oKey][k] = formatObjVal(req_base[k] || 'SHORT', vr.val);
                }
              }
            }
          }

          // Non-arr ref: data row's val = req key (rd.t), t = referenced object id
          // PHP: for ref reqs, reqs[objId][k] = refObjName, reqs[objId][ref_k] = refTypeId:refObjId
          // Also track multi-ref data for &multiselectcell block
          const refDefs = reqDefStd.filter(rd => rd.arr_id == null && rd.ref_id != null);
          // Build set of MULTI-flagged req keys
          const multiReqKeys = new Set(refDefs.filter(rd => (rd.attrs || '').includes(':MULTI:')).map(rd => String(rd.t)));
          if (refDefs.length > 0) {
            const refKeys    = refDefs.map(rd => String(rd.t));
            const allKnownT  = reqDefStd.map(rd => rd.t);  // exclude known req def ids from ref matches
            const phRef      = refKeys.map(() => '?').join(',');
            const phExclude  = allKnownT.map(() => '?').join(',');
            const { rows: refRows } = await execSql(pool, `SELECT d.up, d.id AS row_id, d.ord AS row_ord, d.val AS req_key, d.t AS ref_obj_id, o.val AS ref_obj_name
               FROM \`${db}\` d
               JOIN \`${db}\` o ON o.id = d.t
               WHERE d.up IN (${ph}) AND d.val IN (${phRef}) AND d.t NOT IN (${phExclude})
               ORDER BY d.up, d.ord`, [...objIds, ...refKeys, ...allKnownT], { label: 'aliasMatch_select' });
            // First pass: count refs per (oKey, k) to detect multi
            const refCounts = {};
            for (const rr of refRows) {
              const oKey = String(rr.up);
              const k    = String(rr.req_key);
              const countKey = `${oKey}:${k}`;
              refCounts[countKey] = (refCounts[countKey] || 0) + 1;
            }
            for (const rr of refRows) {
              const oKey = String(rr.up);
              const k    = String(rr.req_key);
              if (!reqsStd[oKey]) reqsStd[oKey] = {};
              if (!refDataStd[oKey]) refDataStd[oKey] = {};
              const refObjName = String(rr.ref_obj_name || '').replace(/,/g, '&comma;');
              const refObjId   = String(rr.ref_obj_id);
              const countKey = `${oKey}:${k}`;
              const isMulti = multiReqKeys.has(k) || refCounts[countKey] > 1;
              if (reqsStd[oKey][k] === undefined) {
                // First ref value
                reqsStd[oKey][k]           = refObjName;
                reqsStd[oKey][`ref_${k}`]  = `${ref_type[k] || ''}:${refObjId}`;
                if (isMulti) {
                  // PHP: multi-ref stores data for &multiselectcell block
                  refDataStd[oKey][k] = {
                    multi: true,
                    rows: [{ id: rr.row_id, ord: rr.row_ord, ref_id: rr.ref_obj_id, val: rr.ref_obj_name || '' }]
                  };
                } else {
                  refDataStd[oKey][k] = { ref_obj_id: rr.ref_obj_id, ref_obj_name: rr.ref_obj_name || '' };
                }
              } else {
                // Multi-ref: comma-join (PHP: implode(",", $val) / implode(",", $ref_id))
                reqsStd[oKey][k]          = String(reqsStd[oKey][k]) + ',' + refObjName;
                reqsStd[oKey][`ref_${k}`] = String(reqsStd[oKey][`ref_${k}`]) + ',' + refObjId;
                if (!refDataStd[oKey][k].multi) {
                  // Convert to multi (first was single, now adding second)
                  const prev = refDataStd[oKey][k];
                  refDataStd[oKey][k] = { multi: true, rows: [] };
                  // We don't have id/ord for the first one, but we can skip it since PHP also doesn't track it properly in this case
                }
                if (refDataStd[oKey][k].rows) {
                  refDataStd[oKey][k].rows.push({ id: rr.row_id, ord: rr.row_ord, ref_id: rr.ref_obj_id, val: rr.ref_obj_name || '' });
                }
              }
            }
          }
        }

        // ── 6. &main.myrolemenu ─────────────────────────────────────────────
        let mainMyrolemenu = { href: [], name: [] };
        mainMyrolemenu = await getMenuForToken(pool, db, token);

        // ── 7. Build response ───────────────────────────────────────────────
        const typeBaseTypeName = typeRow
          ? (REV_BASE_TYPE[typeRow.base_type_id] || 'SHORT')
          : 'SHORT';
        const typeUnique = (typeRow && typeRow.type_ord && String(typeRow.type_ord) !== '0')
          ? 'unique' : '';
        const typeId  = typeRow ? typeRow.id  : subId;
        const typeVal = typeRow ? typeRow.val  : '';
        // PHP computes up=1 for user-defined types (id != t), up=0 for base types
        const typeUp  = typeRow ? (typeRow.id !== typeRow.base_type_id ? 1 : 0) : 0;

        // Filter params for uni_obj
        const fuParam = allObjParams.F_U !== undefined ? String(allObjParams.F_U) : '';
        const filterStr = fuParam ? `&F_U=${fuParam}` : '';

        const hasReqs = reqDefStd.length > 0;

        // uni_obj_head: one entry per req field, in req_order
        const uniObjHead = hasReqs ? (() => {
          const head = {
            ref: [], multi: [], array: [], mandatory: [], grant: [],
            arr_type: [], ref_type: [], typ: [], base_typ: [], id: [], filter: [], val: []
          };
          for (const rd of reqDefStd) {
            const k     = String(rd.t);
            const isArr = rd.arr_id != null;
            const isRef = rd.ref_id != null;
            const attrs = rd.attrs || '';
            head.ref.push(isRef ? 't-ref' : '');
            // PHP: multi = 't-multi' when ref_id set AND attrs has ':MULTI:'
            head.multi.push(isRef && attrs.includes(':MULTI:') ? 't-multi' : '');
            head.array.push(isArr ? 'arr' : '');
            // PHP: mandatory = 'mandatory' when attrs has ':!NULL:'
            head.mandatory.push(attrs.includes(':!NULL:') ? 'mandatory' : '');
            head.grant.push('');
            head.arr_type.push(isArr ? `arr-type="${k}"` : '');
            head.ref_type.push(isRef ? `ref-type="${ref_type[k]}"` : '');
            head.typ.push(String(rd.req_row_id));  // actual req row id (a.id)
            head.base_typ.push(String(rd.base_typ));
            head.id.push(String(typeId));
            head.filter.push('');
            // PHP: FetchAlias extracts :ALIAS=xxx: from attrs for display name
            head.val.push(req_type[k]);  // already computed with alias above
          }
          return head;
        })() : null;

        // uni_obj_all: all objects in simple id/align/val form
        const uniObjAll = {
          id:    objRows.map(r => String(r.id)),
          align: objRows.map(() => 'LEFT'),
          val:   objRows.map(r => r.val || ''),
        };

        // &object_reqs and view_reqs: for each object × each req type
        // arr-type → HTML count link (always, even count=0)
        // non-arr  → stored val or ""
        // PHP: &multiselectcell block is built for multi-ref cells
        const objReqs = {};
        const viewReqsAlign = [];
        const viewReqsBase  = [];
        const viewReqsVal   = [];
        // Track multi-select cell data: { reqKey: { id: [], val: [], ord: [], name: [] } }
        const multiselectcellData = {};
        const hasArrReqs = reqDefStd.some(rd => rd.arr_id != null);
        if (hasReqs) {
          for (const o of objRows) {
            const oKey    = String(o.id);
            const rowVals = [];
            for (const rd of reqDefStd) {
              const k = String(rd.t);
              if (rd.arr_id != null) {
                // Arr-type: always emit count link (count=0 if no data)
                const cnt = (reqsStd[oKey] && reqsStd[oKey][k] != null)
                  ? reqsStd[oKey][k] : 0;
                rowVals.push(`<A HREF="/${db}/object/${k}/?F_U=${o.id}">(${cnt})</A>`);
              } else if (rd.ref_id != null) {
                // Ref-type: PHP generates <A HREF="/{db}/object/{ref_type}/?F_I={ref_obj_id}">{name}</A>
                // Multi refs (>1 or :MULTI: flag) → PHP shows "" for cell and populates &multiselectcell
                const refInfo = refDataStd[oKey]?.[k];
                if (refInfo && refInfo.multi && refInfo.rows && refInfo.rows.length > 0) {
                  // Multi-ref: empty cell value, build multiselectcell block
                  rowVals.push('');
                  if (!multiselectcellData[k]) {
                    multiselectcellData[k] = { id: [], val: [], ord: [], name: [] };
                  }
                  const refTypeId = ref_type[k] || '';
                  for (const row of refInfo.rows) {
                    const formattedName = htmlEsc(row.val || '');
                    // PHP: <A HREF="/{db}/object/{ref_type}/?F_I={ref_id}" class="ms-link">{val}</A>
                    const nameLink = `<A HREF="/${db}/object/${refTypeId}/?F_I=${row.ref_id}" class="ms-link">${formattedName}</A>`;
                    multiselectcellData[k].id.push(String(row.id));
                    multiselectcellData[k].val.push(String(row.ref_id));
                    multiselectcellData[k].ord.push(String(row.ord));
                    multiselectcellData[k].name.push(nameLink);
                  }
                } else if (refInfo && !refInfo.multi) {
                  // Single ref: normal link
                  const refTypeId = ref_type[k] || '';
                  const name = htmlEsc(refInfo.ref_obj_name);
                  rowVals.push(`<A HREF="/${db}/object/${refTypeId}/?F_I=${refInfo.ref_obj_id}">${name}</A>`);
                } else {
                  rowVals.push('');
                }
              } else {
                // Non-arr non-ref: stored val (already formatted, including FILE links)
                const v = (reqsStd[oKey] && reqsStd[oKey][k] != null)
                  ? String(reqsStd[oKey][k]) : '';
                rowVals.push(v);
              }
            }
            // Always include when arr-type reqs exist; otherwise only if some val
            const hasData = hasArrReqs || rowVals.some(v => v !== '');
            if (hasData) {
              objReqs[oKey] = rowVals;
              for (let i = 0; i < req_order.length; i++) {
                const k = req_order[i];
                const rd = reqDefStd[i];
                const isArr = rd.arr_id != null;
                // PHP uses 'REFERENCE' for base_typ=0 only; ref-type reqs use their actual base (SHORT)
                const base = isArr ? 'SHORT' : (rd.base_typ === 0 ? 'REFERENCE' : (req_base[k] || 'SHORT'));
                // PHP aligns: DATE/PWD → CENTER, NUMBER/SIGNED → RIGHT, DATETIME → LEFT, others → LEFT
                let align = 'LEFT';
                if (!isArr) {
                  if (base === 'DATE' || base === 'PWD') align = 'CENTER';
                  else if (base === 'NUMBER' || base === 'SIGNED') align = 'RIGHT';
                }
                viewReqsAlign.push(align);
                viewReqsBase.push(base);
                viewReqsVal.push(rowVals[i]);
              }
            }
          }
        }
        const hasObjReqs = Object.keys(objReqs).length > 0;
        const hasMultiselectcell = Object.keys(multiselectcellData).length > 0;

        const response = {
          '&main.myrolemenu': mainMyrolemenu,
          // NOTE: PHP's object.html does NOT include &top_menu block, so we don't add it here
          '&main.a': { '_parent_.title': [typeVal] },
          type: { id: typeId, up: typeUp, val: typeVal, base: typeBaseTypeName },
          base: { id: String(typeRow ? typeRow.base_type_id : 3), unique: typeUnique },
          '&main.a.&uni_obj': {
            create_granted: ['block'],
            id:       [String(typeId)],
            f_u:      [fuParam],
            up:       [String(typeUp)],
            unique:   [typeUnique],
            base_typ: [String(typeRow ? typeRow.base_type_id : 3)],
            filter:   [filterStr, filterStr],
            val:      [typeVal],
            typ:      [String(typeId)],
            f_i:      [''],
            lnx:      ['0'],
          },
          '&main.a.&uni_obj.&delete': { ok: [''] },
          '&main.a.&uni_obj.&export': { ok: [''] },
          '&main.a.&uni_obj.&new_req': {
            new_req: [''],
            '_parent_.typ': [String(typeId)],
            '_parent_.val': [typeVal],
          },
        };

        if (hasReqs) {
          response['req_base']    = req_base;
          response['req_base_id'] = req_base_id;
          response['req_attrs']   = req_attrs;
          response['req_type']    = req_type;
          if (Object.keys(arr_type).length > 0) response['arr_type'] = arr_type;
          response['req_order']   = req_order;
          if (Object.keys(ref_type).length > 0) response['ref_type'] = ref_type;
          response['&main.a.&uni_obj.&uni_obj_head'] = uniObjHead;
        }

        response['&main.a.&uni_obj.&filter_val_rcm'] = {
          f_typ:  [`F_${typeId}`],
          filter: [''],
        };

        if (hasReqs) {
          response['&main.a.&uni_obj.&uni_obj_head_filter'] = {
            typ: req_order,
          };
          // filter_req_rcm: text-filterable reqs (not DATE/DATETIME/NUMBER/SIGNED)
          // filter_req_dns: range-filterable reqs (DATE/DATETIME/NUMBER/SIGNED) with FR_/TO_ keys
          const DNS_BASES = new Set(['DATE', 'DATETIME', 'NUMBER', 'SIGNED']);
          const FILTER_EXCLUDED_BASES = new Set(['DATE', 'DATETIME', 'NUMBER', 'SIGNED', 'BOOLEAN']);
          const rcmKeys = req_order.filter(k => !FILTER_EXCLUDED_BASES.has(req_base[k]));
          response['&main.a.&uni_obj.&uni_obj_head_filter.&filter_req_rcm'] = {
            f_typ:          rcmKeys.map(k => `F_${k}`),
            '_parent_.ref': rcmKeys.map(k => ref_type[k] || k),
            filter:         rcmKeys.map(() => ''),
            '_parent_.dd':  rcmKeys.map(k => ref_type[k] ? 'dropdown-toggle' : ''),
          };
          const dnsKeys = req_order.filter(k => DNS_BASES.has(req_base[k]));
          if (dnsKeys.length > 0) {
            response['&main.a.&uni_obj.&uni_obj_head_filter.&filter_req_dns'] = {
              f_typ_fr:  dnsKeys.map(k => `FR_${k}`),
              filter_fr: dnsKeys.map(() => ''),
              f_typ_to:  dnsKeys.map(k => `TO_${k}`),
              filter_to: dnsKeys.map(() => ''),
            };
          }
        }

        response['total']                              = objTotal;
        response['object']                             = objRows.map(r => ({ id: String(r.id), val: r.val, up: String(r.up), base: String(r.base) }));
        response['&main.a.&uni_obj.&uni_obj_all']      = uniObjAll;

        if (hasReqs && Object.keys(reqsStd).length > 0) {
          response['reqs'] = reqsStd;
        }
        if (hasObjReqs) {
          response['&object_reqs'] = objReqs;
          response['&main.a.&uni_obj.&uni_obj_all.&uni_object_view_reqs'] = {
            align: viewReqsAlign,
            base:  viewReqsBase,
            val:   viewReqsVal,
          };
          // PHP: &multiselectcell block for multi-reference values
          // PHP path: object.html has <!-- Begin:&multiselectcell --> inside &uni_object_view_reqs
          // PHP populates: id (row id), val (ref_id), ord, name (formatted link with ms-link class)
          if (hasMultiselectcell) {
            // PHP stores per req type, so we merge all into one block
            const msBlock = { id: [], val: [], ord: [], name: [] };
            for (const k of Object.keys(multiselectcellData)) {
              const msData = multiselectcellData[k];
              msBlock.id.push(...msData.id);
              msBlock.val.push(...msData.val);
              msBlock.ord.push(...msData.ord);
              msBlock.name.push(...msData.name);
            }
            if (msBlock.id.length > 0) {
              response['&main.a.&uni_obj.&uni_obj_all.&uni_object_view_reqs.&multiselectcell'] = msBlock;
            }
          }
        }

        // PHP includes &no_page only when page is full (objRows.length >= limit)
        if (objRows.length >= (objLimit || 20)) {
          response['&main.a.&uni_obj.&no_page'] = {
            id:    [String(typeId)],
            lnx:   [''],
            f_u:   [fuParam || '1'],
            limit: [String(objLimit || 20)],
          };
        }

        return res.json(response);
      }

      // ── GET /:db/types?JSON
      // PHP: action="types" → no types.html exists → falls back to info.html
      // info.html only has &main.myrolemenu → returns just the menu
      if (page === 'types') {
        const mainMyrolemenu = await getMenuForToken(pool, db, token);
        return res.json({ '&main.myrolemenu': mainMyrolemenu });
      }

      // ── GET /:db/edit_types?JSON
      // PHP: index.php &edit_typs case (lines 4293-4318), processes edit_types.html
      // Returns: &main.myrolemenu + &main.a.&types + &main.a.&editables + edit_types + types + editable
      if (page === 'edit_types') {
        const { rows: etRows } = await execSql(pool, `SELECT typs.id, typs.t, refs.id AS ref_val, typs.ord AS uniq,
                  CASE WHEN refs.id != refs.t THEN refs.val ELSE typs.val END AS val,
                  reqs.id AS req_id, reqs.t AS req_t, reqs.ord, reqs.val AS attrs, ref_typs.t AS reft
           FROM \`${db}\` typs
           LEFT JOIN \`${db}\` refs ON refs.id = typs.t AND refs.id != refs.t
           LEFT JOIN \`${db}\` reqs ON reqs.up = typs.id
           LEFT JOIN \`${db}\` req_typs ON req_typs.id = reqs.t AND req_typs.id != req_typs.t
           LEFT JOIN \`${db}\` ref_typs ON ref_typs.id = req_typs.t AND ref_typs.id != ref_typs.t
           WHERE typs.up = 0 AND typs.id != typs.t
           ORDER BY ISNULL(reqs.id), CASE WHEN refs.id != refs.t THEN refs.val ELSE typs.val END, refs.id DESC, reqs.ord`, [], { label: 'query_select' });
        // PHP: $blocks[$block] includes PARENT, CONTENT, numeric+named cols from mysqli_fetch_array
        // edit_types.html &Edit_Typs block content (PHP CONTENT field)
        const ET_CONTENT = 'if(t[{ID}]===undefined) t[{ID}]={t:{T},r:"{REF_VAL}",u:{UNIQ},v:"{VAL}"};\n' +
          'if(0{ORD}){if(r[{ID}]===undefined) r[{ID}]={};r[{ID}]["{ORD}"]={ i:"{REQ_ID}",t:"{REQ_T}",a:"{ATTRS}",r:"{REFT}"};}\n';
        // cols in PHP SQL order: id(0), t(1), ref_val(2), uniq(3), val(4), req_id(5), req_t(6), ord(7), attrs(8), reft(9)
        const editTypesET = { PARENT: '&main.a', CONTENT: ET_CONTENT,
          0: [], id: [], 1: [], t: [], 2: [], ref_val: [], 3: [], uniq: [], 4: [], val: [],
          5: [], req_id: [], 6: [], req_t: [], 7: [], ord: [], 8: [], attrs: [], 9: [], reft: [] };
        for (const row of etRows) {
          const cols = [
            String(row.id ?? ''), String(row.t ?? ''), String(row.ref_val ?? ''), String(row.uniq ?? ''),
            (row.val ?? '').replace(/\\/g, '\\\\'), String(row.req_id ?? ''), String(row.req_t ?? ''),
            String(row.ord ?? ''), (row.attrs ?? '').replace(/\\/g, '\\\\'), String(row.reft ?? ''),
          ];
          const names = ['id','t','ref_val','uniq','val','req_id','req_t','ord','attrs','reft'];
          for (let i = 0; i < 10; i++) { editTypesET[i].push(cols[i]); editTypesET[names[i]].push(cols[i]); }
        }
        // &main.a.&types: base type list (PHP &types block handler, line 4325)
        const typBlock = { typ: [], val: [] };
        // PHP $GLOBALS["basics"] insertion order (3,8,9,13,14,11,12,4,10,2,7,6,5,15,16,17)
        const PHP_BASICS_ORDER = [3,8,9,13,14,11,12,4,10,2,7,6,5,15,16,17];
        for (const k of PHP_BASICS_ORDER) {
          if (REV_BASE_TYPE[k]) { typBlock.typ.push(String(k)); typBlock.val.push(REV_BASE_TYPE[k]); }
        }
        const mainMyrolemenu = await getMenuForToken(pool, db, token);
        return res.json({
          '&main.myrolemenu':   mainMyrolemenu,
          '&main.&top_menu':    buildTopMenu(),
          '&main.a.&types':     typBlock,
          '&main.a.&editables': { ok: [''] },
          edit_types: editTypesET,
          types: REV_BASE_TYPE,
          editable: 1,
        });
      }

      // ── GET /:db/edit_obj/:id?JSON → PHP format
      if ((page === 'edit_obj' || page === 'edit') && subId) {
        // 1. Object row + type name / base type
        const { rows: objResult } = await execSql(pool, `SELECT o.id, o.val, o.up, o.t,
                  t.val AS type_name,
                  t.t   AS base_type_id
           FROM \`${db}\` o
           LEFT JOIN \`${db}\` t ON t.id = o.t
           WHERE o.id = ?`, [subId], { label: 'query_select' });
        if (objResult.length === 0) {
          return res.status(404).json([{ error: 'Object not found' }]);
        }
        const obj         = objResult[0];
        const objTypName   = obj.type_name    || String(obj.t);
        const objBaseTypId = obj.base_type_id || obj.t;

        // 2. Req field definitions — PHP GetObjectReqs Query 1 (exact SQL port)
        const { rows: reqMeta } = await execSql(pool, `SELECT a.id AS req_id, refs.id AS ref_id, a.val AS attrs, a.ord,
                  CASE WHEN refs.id IS NULL THEN typs.t    ELSE refs.t   END AS base_typ,
                  CASE WHEN refs.id IS NULL THEN typs.val  ELSE refs.val END AS type_val,
                  CASE WHEN arrs.id IS NULL THEN NULL      ELSE typs.id  END AS arr_id,
                  CASE WHEN refs.id IS NULL THEN ''
                       ELSE (SELECT reqbase.id FROM \`${db}\` refreq, \`${db}\` reqdef, \`${db}\` reqbase
                             WHERE refreq.up=refs.id AND reqdef.id=refreq.t
                               AND reqbase.id=reqdef.t AND reqbase.t!=reqbase.id
                             ORDER BY refreq.ord LIMIT 1) END AS restr
           FROM \`${db}\` a, \`${db}\` typs
           LEFT JOIN \`${db}\` refs ON refs.id=typs.t AND refs.t!=refs.id
           LEFT JOIN \`${db}\` arrs ON refs.id IS NULL AND arrs.up=typs.id AND arrs.ord=1
           WHERE a.up=? AND typs.id=a.t ORDER BY a.ord`, [obj.t], { label: 'query_select' });

        // Build metadata maps (PHP GLOBALS["REQS"], REF_typs, ARR_typs)
        // Use Map to preserve SQL ORDER BY a.ord insertion order — plain objects sort
        // integer-like string keys numerically which breaks field ordering.
        const refTypsMap = {};  // reqId → refTypeId string
        const arrTypsMap = {};  // reqId → arrSubTypeId string
        const reqsMeta   = new Map();  // reqId → {base_typ, type_val, attrs, ord, restr}
        const reqsMetaOrder = [];      // ordered req ids
        for (const rd of reqMeta) {
          const k = String(rd.req_id);
          reqsMeta.set(k, {
            base_typ: rd.base_typ,
            type_val: rd.type_val || k,
            attrs:    rd.attrs || '',
            ord:      rd.ord,
            restr:    rd.restr != null ? String(rd.restr) : '',
          });
          reqsMetaOrder.push(k);
          if (rd.ref_id != null)       refTypsMap[k] = String(rd.ref_id);
          else if (rd.arr_id != null)  arrTypsMap[k] = String(rd.arr_id);
        }

        // 3. Stored values — PHP GetObjectReqs Query 2
        const { rows: storedRows } = await execSql(pool, `SELECT CASE WHEN typs.up=0 THEN 0 ELSE reqs.id  END AS id,
                  CASE WHEN typs.up=0 THEN 0 ELSE reqs.val END AS val,
                  reqs.ord, typs.id AS t, COUNT(1) AS arr_num,
                  origs.t AS bt, typs.val AS ref_val
           FROM \`${db}\` reqs
           JOIN \`${db}\` typs  ON typs.id  = reqs.t
           LEFT JOIN \`${db}\` origs ON origs.id = typs.t
           WHERE reqs.up = ?
           GROUP BY val, id, t
           ORDER BY reqs.ord`, [subId], { label: 'query_select' });

        // Process stored rows into PHP $rows map
        const storedByKey = {};
        for (const row of storedRows) {
          const vStr = row.val != null ? String(row.val) : '';
          if (refTypsMap[vStr] !== undefined) {
            // ref-type stored value: val=reqDefIdStr, t=refObjId
            if (!storedByKey[vStr]) {
              storedByKey[vStr] = {
                id: String(row.id), val: String(row.t), ref_val: row.ref_val || '',
                multiselect: { id: [], val: [], ord: [], ref_val: [] },
              };
            }
            storedByKey[vStr].multiselect.id.push(String(row.id));
            storedByKey[vStr].multiselect.val.push(String(row.t));
            storedByKey[vStr].multiselect.ord.push(String(row.ord));
            storedByKey[vStr].multiselect.ref_val.push(row.ref_val || '');
          } else {
            storedByKey[String(row.t)] = {
              id: String(row.id), val: vStr, arr_num: Number(row.arr_num),
            };
          }
        }

        function getReqRow(k) {
          if (storedByKey[k] !== undefined) return storedByKey[k];
          if (arrTypsMap[k] !== undefined) {
            const sub = arrTypsMap[k];
            return { arr_num: storedByKey[sub] ? storedByKey[sub].arr_num : undefined };
          }
          return {};
        }

        // 4. Build all response data arrays
        const DDLIST     = 80;
        const NOT_NULL   = ':!NULL:';
        const MULTI_MASK2 = ':MULTI:';
        const PWD_STARS  = '******';

        // PHP FetchAlias: extracts :ALIAS=xxx: from attrs, falls back to orig
        function fetchAlias(attrs, orig) {
          const m = attrs && attrs.match(/:ALIAS=(.*?):/u);
          return (m && m[1]) ? m[1] : orig;
        }

        // PHP date display: YYYYMMDD → DD.MM.YYYY
        function formatDate(v) {
          if (!v || v[0] === '[' || v.startsWith('_request_')) return v;
          if (/^\d{8}$/.test(String(v))) {
            const s = String(v);
            return `${s.slice(6, 8)}.${s.slice(4, 6)}.${s.slice(0, 4)}`;
          }
          // If stored as Unix timestamp (len > 8)
          const num = parseFloat(v);
          if (!isNaN(num) && String(v).length > 8) {
            const d = new Date(Math.floor(num) * 1000);
            return `${String(d.getUTCDate()).padStart(2,'0')}.${String(d.getUTCMonth()+1).padStart(2,'0')}.${d.getUTCFullYear()}`;
          }
          return v;
        }

        // PHP datetime display: Unix float timestamp → DD.MM.YYYY HH:MM:SS (UTC)
        function formatDatetime(v) {
          if (!v) return v;
          const num = parseFloat(v);
          if (isNaN(num)) return v;
          const d = new Date(Math.floor(num) * 1000);
          const p = n => String(n).padStart(2, '0');
          return `${p(d.getUTCDate())}.${p(d.getUTCMonth()+1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
        }

        // PHP GetSubdir/GetFilename → build file download href
        function phpGetSha(i) {
          return crypto.createHash('sha1').update(phpSalt(db, String(i), db)).digest('hex');
        }
        function buildFileLink(rowId, val) {
          if (!val) return val;
          let fileId = Number(rowId);
          let displayName = val;
          // Extract ext from val (after last dot)
          const dotIdx = val.lastIndexOf('.');
          const ext = dotIdx >= 0 ? val.slice(dotIdx + 1) : '';
          // Handle "id:filename" colon format
          if (val.includes(':')) {
            const colonIdx = val.indexOf(':');
            fileId = Number(val.slice(0, colonIdx));
            displayName = val.slice(colonIdx + 1);
          }
          if (!fileId || isNaN(fileId)) return val;
          const folderNum = Math.floor(fileId / 1000);
          const folder = `${folderNum}${phpGetSha(folderNum).slice(0, 8)}`;
          const fileNum = ('00' + fileId).slice(-3);
          const filename = `${fileNum}${phpGetSha(fileId).slice(0, 8)}`;
          return `<a target="_blank" href="/download/${db}/${folder}/${filename}.${ext}">${displayName}</a>`;
        }

        const reqs2         = {};
        const objTyp        = [], objTypNames = [], reqidArr = [];
        const shortTyp = [], shortVal = [], shortDis = [];
        const refTypArr = [], refDis = [], refMulti = [], refRef = [], refRestrict = [];
        const refGrantedTyp = [], nullableNN = [];
        const dateTyp = [], dateVal = [], dateDis = [];
        const arrTypBld = [], arrParId = [], arrParNum = [];
        const memoTyp = [], memoVal = [], memoDis = [];
        const numTyp = [], numVal = [], numDis = [];
        const charsTyp = [], charsVal = [], charsDis = [];
        const dtTyp = [], dtVal = [], dtDis = [];
        const pwdTyp = [], pwdVal = [], pwdDis = [];
        const fileTyp = [], fileVal = [], fileDis = [];
        const msId = [], msVal = [], msOrd = [], msName = [], msDis = [];
        const seekParTyp = [], seekMore = [];
        const refTypesNeeded = new Set();

        for (const k of reqsMetaOrder) {
          const meta     = reqsMeta.get(k);
          const baseName = meta.base_typ === 0 ? 'TAB_DELIMITER' : (REV_BASE_TYPE[meta.base_typ] || null);
          if (baseName === 'BUTTON') continue;

          const row = getReqRow(k);
          let   v   = row.val != null ? String(row.val) : '';
          if (baseName === 'PWD' && v) v = PWD_STARS;

          // Apply display formatting (PHP: cases in the value-display switch)
          const isRefType = refTypsMap[k] !== undefined;
          const typeName = isRefType ? fetchAlias(meta.attrs, meta.type_val) : meta.type_val;

          const reqEntry = {
            type:  typeName,
            order: String(meta.ord ?? '0'),
            value: v,
            base:  baseName,
          };
          if (isRefType) {
            reqEntry.ref_type = refTypsMap[k];
            reqEntry.ref      = row.ref_val !== undefined ? (row.ref_val || null) : null;
          } else if (row.arr_num !== undefined && row.arr_num !== null) {
            // PHP: arr-type uses (int) cast → integer; regular stored value arr_num → MySQL string "1"
            reqEntry.arr      = arrTypsMap[k] != null ? Number(row.arr_num) : String(row.arr_num);
            reqEntry.arr_type = arrTypsMap[k] != null ? arrTypsMap[k] : null;
          }
          if (meta.attrs) reqEntry.attrs = meta.attrs;
          if (row.multiselect && row.multiselect.id.length > 0) {
            if (row.multiselect.id.length > 1 || meta.attrs.includes(MULTI_MASK2)) {
              reqEntry.multiselect = {
                id: row.multiselect.id, val: row.multiselect.val,
                ord: row.multiselect.ord, ref_val: row.multiselect.ref_val,
              };
            }
          }
          reqs2[k] = reqEntry;

          objTyp.push(k);
          objTypNames.push(typeName);
          const rowId = (row.id && String(row.id) !== '0') ? String(row.id) : '';
          reqidArr.push(rowId);
          const dis = '';

          if (baseName === 'FILE') {
            const fileDisplay = rowId ? buildFileLink(rowId, v) : v;
            if (rowId) { fileTyp.push(k); fileVal.push(fileDisplay); fileDis.push(dis); }
            reqEntry.value = fileDisplay;
          } else if (isRefType) {
            refTypArr.push(k); refDis.push(dis);
            refMulti.push(meta.attrs.includes(MULTI_MASK2) ? '1' : '0');
            refRef.push(refTypsMap[k]); refRestrict.push(meta.restr);
            refGrantedTyp.push(k);
            refTypesNeeded.add(refTypsMap[k]);
            if (meta.attrs.includes(NOT_NULL) && v === '' && !(row.arr_num > 0))
              nullableNN.push('*');
            if (row.multiselect && row.multiselect.id.length > 0 &&
                (row.multiselect.id.length > 1 || meta.attrs.includes(MULTI_MASK2))) {
              for (let i = 0; i < row.multiselect.id.length; i++) {
                msId.push(row.multiselect.id[i]);  msVal.push(row.multiselect.val[i]);
                msOrd.push(row.multiselect.ord[i]); msName.push(row.multiselect.ref_val[i]);
                msDis.push(dis);
              }
            }
          } else if (arrTypsMap[k] !== undefined) {
            const arrNum = row.arr_num != null ? Number(row.arr_num) : 0;
            arrTypBld.push(arrTypsMap[k]); arrParId.push(String(subId));
            arrParNum.push(String(arrNum));
            if (meta.attrs.includes(NOT_NULL) && arrNum === 0) nullableNN.push('*');
          } else {
            switch (baseName) {
              case 'SHORT':    shortTyp.push(k); shortVal.push(v); shortDis.push(dis); break;
              case 'DATE': {
                const dv = formatDate(v);
                reqEntry.value = dv;
                dateTyp.push(k); dateVal.push(dv); dateDis.push(dis);
                break;
              }
              case 'NUMBER':   numTyp.push(k);   numVal.push(v);   numDis.push(dis);   break;
              case 'CHARS':    charsTyp.push(k); charsVal.push(v); charsDis.push(dis); break;
              case 'DATETIME': {
                const dtv = formatDatetime(v);
                reqEntry.value = dtv;
                dtTyp.push(k);  dtVal.push(dtv);  dtDis.push(dis);
                break;
              }
              case 'PWD':      pwdTyp.push(k);   pwdVal.push(v);   pwdDis.push(dis);   break;
              case 'MEMO':     memoTyp.push(k);  memoVal.push(v);  memoDis.push(dis);  break;
            }
            if (meta.attrs.includes(NOT_NULL) && v === '') nullableNN.push('*');
          }
        }

        // 5. Fetch ref-type dropdown data (parallel queries)
        // PHP: FROM my vals, my pars WHERE pars.id=vals.up AND pars.up!=0 AND vals.t=? ORDER BY vals.val LIMIT 80
        // Plus UNION for the currently-selected value (if any)
        const refDropdowns = {};
        // Build a map of refTypeId → set of curSelectedIds for UNION
        const refTypeCurVals = {};
        for (let ri = 0; ri < refTypArr.length; ri++) {
          const k         = refTypArr[ri];
          const refTypeId = refRef[ri];
          if (!refTypeCurVals[refTypeId]) refTypeCurVals[refTypeId] = new Set();
          // Current selected value (single)
          if (reqs2[k]?.value) refTypeCurVals[refTypeId].add(reqs2[k].value);
          // Multiselect values
          if (reqs2[k]?.multiselect?.val) {
            for (const mv of reqs2[k].multiselect.val) {
              if (mv) refTypeCurVals[refTypeId].add(mv);
            }
          }
        }
        await Promise.all(Array.from(refTypesNeeded).map(async (refTypeId) => {
          // Main SELECT: only objects whose parent exists and parent.up != 0
          const { rows: ddRows } = await execSql(pool, `SELECT vals.id, vals.val
             FROM \`${db}\` vals
             JOIN \`${db}\` pars ON pars.id = vals.up
             WHERE pars.up != 0 AND vals.t = ?
             ORDER BY vals.val
             LIMIT ${DDLIST}`, [refTypeId], { label: 'rowId_select' });
          // UNION: add currently-selected values that may not appear in main list
          const mainIds = new Set(ddRows.map(r => String(r.id)));
          const curIds = Array.from(refTypeCurVals[refTypeId] || [])
            .filter(id => id && !mainIds.has(id));
          if (curIds.length > 0) {
            const { rows: unionRows } = await execSql(pool, `SELECT id, val FROM \`${db}\` WHERE id IN (${curIds.map(() => '?').join(',')})`, curIds, { label: 'query_select' });
            ddRows.push(...unionRows);
          }
          refDropdowns[refTypeId] = ddRows;
        }));

        // Build &add_obj_ref_reqs arrays
        const addId = [], addR = [], addVal = [], addSel = [];
        for (let ri = 0; ri < refTypArr.length; ri++) {
          const k         = refTypArr[ri];
          const refTypeId = refRef[ri];
          const isMulti   = refMulti[ri] === '1';
          const curVal    = reqs2[k]?.value || '';
          const hasMulti  = (reqs2[k]?.multiselect?.val?.length ?? 0) > 1;
          const ddRows    = refDropdowns[refTypeId] || [];
          for (const dd of ddRows) {
            addId.push(String(dd.id)); addR.push(k); addVal.push(dd.val || '');
            addSel.push((!isMulti && !hasMulti && String(dd.id) === curVal) ? ' SELECTED' : '');
          }
          if (ddRows.length >= DDLIST) { seekParTyp.push(k); seekMore.push('1'); }
        }

        // 6. &main.myrolemenu
        let myroleEd = { href: [], name: [] };
        if (token) {
          try {
            let uRowsEd;
            if (token.startsWith('Basic ')) {
              // Basic auth: decode credentials, look up user via password hash
              const decoded   = Buffer.from(token.slice(6), 'base64').toString('utf8');
              const colonIdx  = decoded.indexOf(':');
              if (colonIdx > 0) {
                const basicLogin = decoded.slice(0, colonIdx);
                const basicPwd   = decoded.slice(colonIdx + 1);
                const pwdHash    = phpCompatibleHash(basicLogin, basicPwd, db);
                uRowsEd = (await execSql(pool, `SELECT role_def.id AS role_obj_id
                   FROM \`${db}\` u
                   JOIN \`${db}\` pwd ON pwd.up = u.id AND pwd.t = ${TYPE.PASSWORD} AND pwd.val = ?
                   LEFT JOIN (\`${db}\` r CROSS JOIN \`${db}\` role_def)
                     ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
                   WHERE u.t = ${TYPE.USER} AND u.val = ? LIMIT 1`, [pwdHash, basicLogin], { label: 'hasMulti_select' })).rows;
              }
            } else {
              uRowsEd = (await execSql(pool, `SELECT role_def.id AS role_obj_id
                 FROM \`${db}\` u
                 JOIN \`${db}\` tok ON tok.up = u.id AND tok.t = ${TYPE.TOKEN} AND tok.val = ?
                 LEFT JOIN (\`${db}\` r CROSS JOIN \`${db}\` role_def)
                   ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
                 WHERE u.t = ${TYPE.USER} LIMIT 1`, [token], { label: 'hasMulti_select' })).rows;
            }
            if (uRowsEd && uRowsEd.length > 0) {
              myroleEd = await buildMyrolemenu(pool, db, uRowsEd[0].role_obj_id || null);
            }
          } catch (_e) { /* ignore */ }
        }

        // 7. Assemble PHP-format response
        const editResp = {
          '&main.myrolemenu': myroleEd,
          'obj': {
            id:       String(obj.id),
            val:      obj.val || '',
            parent:   String(obj.up),
            typ:      String(obj.t),
            typ_name: objTypName,
            base_typ: String(objBaseTypId),
          },
          '&main.a.&object': {
            typ:      [String(obj.t), String(obj.t)],
            up:       [String(obj.up)],
            typ_name: [objTypName, objTypName],
            val:      [obj.val || '', obj.val || ''],
            id:       [String(obj.id)],
            disabled: [''],
          },
          '&main.a.&object.&edit_req': {
            type:                ['text'],
            typ:                 [String(obj.t)],
            '_parent_.val':      [obj.val || ''],
            '_parent_.disabled': [''],
          },
        };

        if (Object.keys(reqs2).length > 0) editResp.reqs = reqs2;

        if (objTyp.length > 0) {
          editResp['&main.a.&object.&object_reqs'] = {
            typ: objTyp, typ_name: objTypNames, enable_save: objTyp.map(() => ''),
          };

          if (shortTyp.length > 0)
            editResp['&main.a.&object.&object_reqs.&editreq_short'] =
              { typ: shortTyp, val: shortVal, disabled: shortDis };

          const fileBlock = { reqid: reqidArr };
          if (fileTyp.length > 0) {
            fileBlock.val            = fileVal;
            fileBlock['_parent_.id'] = fileTyp.map(() => String(subId));
            fileBlock.typ            = fileTyp;
            fileBlock.disabled       = fileDis;
          }
          editResp['&main.a.&object.&object_reqs.&editreq_file'] = fileBlock;

          if (refTypArr.length > 0) {
            editResp['&main.a.&object.&object_reqs.&editreq_reference'] = {
              typ: refTypArr, disabled: refDis,
              '_parent_.multi': refMulti, '_parent_.ref': refRef, restrict: refRestrict,
            };
            editResp['&main.a.&object.&object_reqs.&editreq_reference.&ref_create_granted'] =
              { typ: refGrantedTyp };
            if (addId.length > 0)
              editResp['&main.a.&object.&object_reqs.&editreq_reference.&add_obj_ref_reqs'] =
                { id: addId, r: addR, val: addVal, selected: addSel };
          }

          if (nullableNN.length > 0) {
            editResp['&main.a.&object.&object_reqs.&nullable_req']       = { not_null: nullableNN };
            editResp['&main.a.&object.&object_reqs.&nullable_req_close'] = { not_null: nullableNN };
          }

          if (dateTyp.length > 0)
            editResp['&main.a.&object.&object_reqs.&editreq_date'] =
              { typ: dateTyp, val: dateVal, disabled: dateDis };

          if (arrTypBld.length > 0)
            editResp['&main.a.&object.&object_reqs.&editreq_array'] =
              { typ: arrTypBld, '_parent_.id': arrParId, '_parent_.arr_num': arrParNum };

          if (memoTyp.length > 0)
            editResp['&main.a.&object.&object_reqs.&editreq_memo'] =
              { typ: memoTyp, disabled: memoDis, val: memoVal };

          if (numTyp.length > 0)
            editResp['&main.a.&object.&object_reqs.&editreq_number'] =
              { typ: numTyp, val: numVal, disabled: numDis };

          if (charsTyp.length > 0)
            editResp['&main.a.&object.&object_reqs.&editreq_chars'] =
              { typ: charsTyp, val: charsVal, disabled: charsDis };

          if (dtTyp.length > 0)
            editResp['&main.a.&object.&object_reqs.&editreq_datetime'] =
              { typ: dtTyp, val: dtVal, disabled: dtDis };

          if (pwdTyp.length > 0)
            editResp['&main.a.&object.&object_reqs.&editreq_pwd'] =
              { typ: pwdTyp, val: pwdVal, disabled: pwdDis };

          if (msId.length > 0)
            editResp['&main.a.&object.&object_reqs.&editreq_reference.&multiselect'] =
              { id: msId, val: msVal, ord: msOrd, name: msName, '_parent_.disabled': msDis };

          if (seekParTyp.length > 0)
            editResp['&main.a.&object.&object_reqs.&editreq_reference.&seek_refs'] =
              { '_parent_.typ': seekParTyp, more: seekMore };
        }

        return res.json(editResp);
      }

      // ── GET /:db/dict?JSON → PHP &uni_obj_list: {id: htmlspecialchars(val), ...}
      // PHP source: index.php case "&uni_obj_list" (line 5069)
      // Returns flat {typeId: typeName, ...} for all top-level independent types
      // (up=0, id!=t, val!='', t!=0), excluding CALCULATABLE & BUTTON base types,
      // excluding types that are only used as requisites of other types.
      if (page === 'dict') {
        const CALCULATABLE = TYPE.CALCULATABLE;  // 15
        const BUTTON_TYPE  = TYPE.BUTTON;        // 7
        const { rows: typeRows } = await execSql(pool, `SELECT a.id, a.val, a.t, reqs.t AS reqs_t, reqs.up
           FROM \`${db}\` a
           LEFT JOIN \`${db}\` reqs ON reqs.up = a.id
           WHERE a.up = 0 AND a.id != a.t AND a.val != '' AND a.t != 0
           ORDER BY a.val`, [], { label: 'query_select' });
        // Build typ dict following PHP logic:
        // track which IDs are req-only (have been used as a req child of another type)
        const base = {};   // id → t (base type id)
        const req  = {};   // ids that are requisite-only (unset from typ)
        const typMap = {}; // id → val (display map)
        for (const row of typeRows) {
          if (row.t === CALCULATABLE || row.t === BUTTON_TYPE) continue;
          base[row.id] = row.t;
          if (!req[row.id]) typMap[row.id] = row.val;  // only if not marked as req-only
          if (row.reqs_t && row.reqs_t !== row.up) {
            delete typMap[row.reqs_t];
            req[row.reqs_t] = true;
          }
        }
        // Build JSON response as {id: htmlspecialchars(val), ...}
        const dictJson = {};
        for (const [id, val] of Object.entries(typMap)) {
          dictJson[id] = htmlEsc(val);
        }
        return res.json(dictJson);
      }

      // ── GET /:db/sql?JSON → &main.myrolemenu + &main.a.&functions + &main.a.&formats
      // PHP source: templates/sql.html processes &functions and &formats blocks
      // &functions: SELECT id,val FROM $z WHERE t=REP_COL_FUNC AND up=1 ORDER BY val
      // &formats:   SELECT id,val FROM $z WHERE t=REP_COL_FORMAT AND up=1 ORDER BY val
      if (page === 'sql') {
        const { rows: funRows } = await execSql(pool, `SELECT id, val FROM \`${db}\` WHERE t = ? AND up = 1 ORDER BY val`, [63], { label: 'query_select' });  // REP_COL_FUNC constant from PHP index.php
        const { rows: fmtRows } = await execSql(pool, `SELECT id, val FROM \`${db}\` WHERE t = ? AND up = 1 ORDER BY val`, [29], { label: 'query_select' });  // REP_COL_FORMAT constant from PHP index.php
        const mainMyrolemenu = await getMenuForToken(pool, db, token);
        // PHP: id values are strings (json_encode converts PHP ints from DB to JSON numbers,
        // but the block array builder stores them as PHP strings via array push)
        const funBlock = funRows.length > 0
          ? { id: funRows.map(r => String(r.id)), val: funRows.map(r => r.val) }
          : {};
        const fmtBlock = fmtRows.length > 0
          ? { id: fmtRows.map(r => String(r.id)), val: fmtRows.map(r => r.val) }
          : {};
        return res.json({
          '&main.myrolemenu':    mainMyrolemenu,
          '&main.&top_menu':     buildTopMenu(),
          '&main.a.&functions':  funBlock,
          '&main.a.&formats':    fmtBlock,
        });
      }

      // ── GET /:db/form?JSON → &main.myrolemenu + &main.&top_menu + edit_types + types + editable
      // PHP: form.html includes &Edit_Typs block which populates edit_types and then dies.
      // PHP $blocks[$block] includes PARENT, CONTENT (template artifacts) + numeric+named column aliases.
      if (page === 'form') {
        const { rows: formTypeRows } = await execSql(pool, `SELECT typs.id, typs.t, refs.id AS ref_val, typs.ord AS uniq,
                  CASE WHEN refs.id != refs.t THEN refs.val ELSE typs.val END AS val,
                  reqs.id AS req_id, reqs.t AS req_t, reqs.ord, reqs.val AS attrs, ref_typs.t AS reft
           FROM \`${db}\` typs
           LEFT JOIN \`${db}\` refs ON refs.id = typs.t AND refs.id != refs.t
           LEFT JOIN \`${db}\` reqs ON reqs.up = typs.id
           LEFT JOIN \`${db}\` req_typs ON req_typs.id = reqs.t AND req_typs.id != req_typs.t
           LEFT JOIN \`${db}\` ref_typs ON ref_typs.id = req_typs.t AND ref_typs.id != ref_typs.t
           WHERE typs.up = 0 AND typs.id != typs.t
           ORDER BY ISNULL(reqs.id), CASE WHEN refs.id != refs.t THEN refs.val ELSE typs.val END, refs.id DESC, reqs.ord`, [], { label: 'query_select' });
        // PHP: CONTENT = form.html's &Edit_Typs template block content
        // Exact bytes from the template (} closes inner object, ; ends stmt, } closes outer if)
        const FORM_ET_CONTENT = '\nt[{ID}]={t:{T},r:"{REF_VAL}",u:{UNIQ},v:"{VAL}"};\n' +
          'if("{ORD}"){if(r[{ID}]===undefined)r[{ID}]={};r[{ID}]["{ORD}"]={i:"{REQ_ID}",t:"{REQ_T}",a:"{ATTRS}",r:"{REFT}"};}\n';
        const formEditTypes = { PARENT: '&main.a', CONTENT: FORM_ET_CONTENT,
          0: [], id: [], 1: [], t: [], 2: [], ref_val: [], 3: [], uniq: [], 4: [], val: [],
          5: [], req_id: [], 6: [], req_t: [], 7: [], ord: [], 8: [], attrs: [], 9: [], reft: [] };
        for (const row of formTypeRows) {
          const cols = [
            String(row.id ?? ''), String(row.t ?? ''), String(row.ref_val ?? ''), String(row.uniq ?? ''),
            (row.val ?? '').replace(/\\/g, '\\\\'), String(row.req_id ?? ''), String(row.req_t ?? ''),
            String(row.ord ?? ''), (row.attrs ?? '').replace(/\\/g, '\\\\'), String(row.reft ?? ''),
          ];
          const names = ['id','t','ref_val','uniq','val','req_id','req_t','ord','attrs','reft'];
          for (let i = 0; i < 10; i++) { formEditTypes[i].push(cols[i]); formEditTypes[names[i]].push(cols[i]); }
        }
        const mainMyrolemenu = await getMenuForToken(pool, db, token);
        return res.json({
          '&main.myrolemenu': mainMyrolemenu,
          '&main.&top_menu':  buildTopMenu(),
          edit_types: formEditTypes,
          types: REV_BASE_TYPE,
          editable: 1,
        });
      }

      // ── GET /:db/{info|upload|table|smartq}?JSON → &main.myrolemenu + &main.&top_menu
      // PHP: main.html always has &top_menu block alongside myrolemenu
      const MENU_ONLY_PAGES = new Set(['info', 'upload', 'table', 'smartq', 'list']);
      if (MENU_ONLY_PAGES.has(page)) {
        const mainMyrolemenu = await getMenuForToken(pool, db, token);
        return res.json({ '&main.myrolemenu': mainMyrolemenu, '&main.&top_menu': buildTopMenu() });
      }

    } catch (err) {
      logger.error('[Legacy page JSON] Error', { error: err.message, stack: err.stack, db, page });
      console.error('[DEBUG JSON Error]', err);
      return res.status(200).json([{ error: err.message }]);
    }
  }

  // Map page names to template files
  const pageMap = {
    'dict': 'templates/dict.html',
    'object': 'templates/object.html',
    'edit': 'templates/edit_obj.html',
    'edit_obj': 'templates/edit_obj.html',
    'report': 'templates/report.html',
    'types': 'templates/edit_types.html',
    'form': 'templates/form.html',
    'upload': 'templates/upload.html',
    'sql': 'templates/sql.html',
    'admin': 'templates/dir_admin.html',
    'info': 'templates/info.html',
    'quiz': 'templates/quiz.html',
    'smartq': 'templates/smartq.html',
  };

  const templatePath = pageMap[page];
  if (templatePath) {
    // Node.js-native templates take precedence over legacy integram-server templates
    const nodePath = path.resolve(__dirname, '../../../public', templatePath);
    if (fs.existsSync(nodePath)) {
      return res.sendFile(nodePath);
    }
    const legacyTemplatePath = path.join(legacyPath, templatePath);
    if (fs.existsSync(legacyTemplatePath)) {
      return res.sendFile(legacyTemplatePath);
    }
  }

  // Check for custom database-specific templates
  const customPath = path.join(legacyPath, `templates/custom/${db}/${page}.html`);
  if (fs.existsSync(customPath)) {
    return res.sendFile(customPath);
  }

  // Fall through to other handlers or 404
  return next();
});

// ============================================================================
// Helper functions for DML operations
// ============================================================================

/**
 * Extract type attributes from request body (t{id}=value format)
 */
function extractAttributes(body) {
  const attributes = {};
  for (const [key, value] of Object.entries(body)) {
    if (key.startsWith('t') && /^t\d+$/.test(key)) {
      const typeId = parseInt(key.substring(1), 10);
      attributes[typeId] = value;
    }
  }
  return attributes;
}

/**
 * Get next order value for a parent/type combination
 */
async function getNextOrder(db, parentId, typeId = null) {
  try {
    const pool = getPool();
    const z = sanitizeIdentifier(db);
    let query = `SELECT COALESCE(MAX(ord), 0) + 1 AS next_ord FROM ${z} WHERE up = ?`;
    const params = [parentId];

    if (typeId !== null) {
      query = `SELECT COALESCE(MAX(ord), 0) + 1 AS next_ord FROM ${z} WHERE up = ? AND t = ?`;
      params.push(typeId);
    }

    const { rows: rows } = await execSql(pool, query, params, { label: 'getNextOrder_query' });
    return rows[0]?.next_ord || 1;
  } catch (error) {
    return 1;
  }
}

/**
 * Get next order value for reference objects — PHP GetRefOrd() parity (Issue #300).
 *
 * Unlike getNextOrder (Calc_Order) which filters by `t` (type column),
 * GetRefOrd filters by `val` (value column) because reference rows store
 * the type identifier in `val`, not `t`.
 *
 * PHP: SELECT max(ord) ord FROM $z WHERE up=$parent AND val='$typ'
 *
 * @param {import('mysql2/promise').Pool} pool - mysql2 connection pool
 * @param {string} db   - database (table) name
 * @param {number} parent - parent row ID
 * @param {string|number} typ - type value stored in the `val` column
 * @returns {Promise<number>} next order value (max(ord) + 1, or 1 if none)
 */
async function getRefOrd(pool, db, parent, typ) {
  try {
    const z = sanitizeIdentifier(db);
    const { rows: rows } = await execSql(pool, `SELECT COALESCE(MAX(ord), 0) + 1 AS next_ord FROM ${z} WHERE up = ? AND val = ?`, [parent, String(typ)], { label: 'getRefOrd_select' });
    return rows[0]?.next_ord || 1;
  } catch (error) {
    return 1;
  }
}

/**
 * Calculate the next sort order for a new object.
 * Direct port of PHP Calc_Order (index.php:6931).
 *
 * Returns COALESCE(MAX(ord)+1, 1) for the given parent and type,
 * i.e. the next sequential order value.
 *
 * @param {import('mysql2/promise').Pool} pool - MySQL connection pool
 * @param {string} db   - Database (table) name
 * @param {number} up   - Parent object ID
 * @param {number} t    - Type ID
 * @returns {Promise<number>} Next order value (>= 1)
 * @throws {Error} If the query fails
 */
async function calcOrder(pool, db, up, t) {
  const z = sanitizeIdentifier(db);
  const result = await execSql(
    pool,
    `SELECT COALESCE(MAX(ord)+1, 1) AS next_ord FROM ${z} WHERE t = ? AND up = ?`,
    [t, up],
    { label: 'Calc_Order', db }
  );
  if (result.rows && result.rows.length > 0) {
    return result.rows[0].next_ord;
  }
  throw new Error(t9n('Cannot Calc the Order'));
}

/**
 * Insert a new row into the database
 */
async function insertRow(db, parentId, order, typeId, value) {
  const pool = getPool();
  const query = `INSERT INTO ${sanitizeIdentifier(db)} (up, ord, t, val) VALUES (?, ?, ?, ?)`;
  const { rows: result } = await execSql(pool, query, [parentId, order, typeId, value], { label: 'insertRow_query' });
  return result.insertId;
}

/**
 * Batch INSERT for restore and bulk import — PHP parity: Insert_batch()
 * PHP reference: index.php lines 7034–7052
 *
 * Accumulates rows and flushes them in a single multi-row INSERT statement
 * for significantly better performance during restore/import/copy operations.
 *
 * @param {Object} pool    - MySQL connection pool
 * @param {string} db      - database (table) name
 * @param {Array<Array>} rows - array of [up, ord, t, val] tuples
 * @param {Object} [options]
 * @param {number} [options.batchSize=1000] - max rows per INSERT statement
 * @param {string} [options.columns='up, ord, t, val'] - column list
 * @param {boolean} [options.ignore=false] - use INSERT IGNORE
 * @returns {Promise<number>} total number of inserted rows
 */
async function insertBatch(pool, db, rows, options = {}) {
  if (!rows || rows.length === 0) return 0;
  const {
    batchSize = 1000,
    columns = 'up, ord, t, val',
    ignore = false,
  } = options;
  const ignoreKw = ignore ? ' IGNORE' : '';
  let totalInserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { rows: result } = await execSql(pool, `INSERT${ignoreKw} INTO \`${db}\` (${columns}) VALUES ?`, [batch], { label: 'insertBatch_insert' });
    totalInserted += result.affectedRows;
  }
  return totalInserted;
}

/**
 * Update a row's value
 */
async function updateRowValue(db, id, value) {
  const pool = getPool();
  const query = `UPDATE ${sanitizeIdentifier(db)} SET val = ? WHERE id = ?`;
  const { rows: result } = await execSql(pool, query, [value, id], { label: 'updateRowValue_query' });
  return result.affectedRows > 0;
}

/**
 * Delete a row by ID
 */
async function deleteRow(db, id) {
  const pool = getPool();
  const query = `DELETE FROM ${sanitizeIdentifier(db)} WHERE id = ?`;
  const { rows: result } = await execSql(pool, query, [id], { label: 'deleteRow_query' });
  return result.affectedRows > 0;
}

/**
 * Delete all children of a parent
 */
async function deleteChildren(db, parentId) {
  const pool = getPool();
  const query = `DELETE FROM ${sanitizeIdentifier(db)} WHERE up = ?`;
  const { rows: result } = await execSql(pool, query, [parentId], { label: 'deleteChildren_query' });
  return result.affectedRows;
}

/**
 * Get object by ID
 */
async function getObjectById(db, id) {
  const pool = getPool();
  const query = `SELECT id, up, ord, t, val FROM ${sanitizeIdentifier(db)} WHERE id = ?`;
  const { rows: rows } = await execSql(pool, query, [id], { label: 'getObjectById_query' });
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get requisite by parent and type
 */
async function getRequisiteByType(db, parentId, typeId) {
  const pool = getPool();
  const query = `SELECT id, val FROM ${sanitizeIdentifier(db)} WHERE up = ? AND t = ? LIMIT 1`;
  const { rows: rows } = await execSql(pool, query, [parentId, typeId], { label: 'getRequisiteByType_query' });
  return rows.length > 0 ? rows[0] : null;
}

// ============================================================================
// DML Action Routes (Phase 1 MVP - Real Implementation)
// ============================================================================

/**
 * _m_new - Create new object
 * POST /:db/_m_new/:up
 * Parameters: up (parent ID), t (type ID), val, t{id}=value (attributes)
 * Supports file uploads for FILE-type requisites (multer memoryStorage).
 */
router.post('/:db/_m_new/:up?', legacyAuthMiddleware, legacyXsrfCheck, (req, res, next) => {
  // Use upload.any() so FILE-type requisites can be uploaded alongside text fields
  upload.any()(req, res, (err) => {
    if (err) logger.warn('[Legacy _m_new] Multer error', { error: err.message });
    next();
  });
}, async (req, res) => {
  const { db, up } = req.params;

  const locale = getLocale(req, db);
  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: t9n('invalid_database', locale) }]);
  }

  try {
    const pool = getPool();
    const { grants, username } = req.legacyUser || {};
    const tzone = parseInt(req.body.tzone || req.query.tzone || '0', 10);
    const clientIp = req.ip || '';
    let warning = '';

    // Support two calling conventions:
    // 1. Node.js: URL=_m_new/:parentId?type=<typeId>  val=<name>
    // 2. Legacy:  URL=_m_new/:typeId   body.up=<parentId>  t<typeId>=<name>
    let parentId, typeId;
    if (req.query.type) {
      typeId = parseInt(req.query.type, 10);
      parentId = parseInt(up || req.body.up || '0', 10);
    } else {
      typeId = parseInt(up, 10);
      parentId = parseInt(req.body.up || req.query.up || '0', 10);
    }
    let value = req.body.val || req.body['t' + typeId] || '';

    // Reject invalid parentId and typeId
    if (parentId === 0) {
      return res.status(200).json([{ error: t9n('parent_id_zero', locale) }]);
    }
    if (!typeId || typeId === 0) {
      return res.status(200).json([{ error: t9n('type_required', locale) }]);
    }

    // Verify type and parent exist
    const { rows: typeCheck } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE id = ? LIMIT 1`, [typeId], { label: 'post_db_m_new_up_select' });
    if (typeCheck.length === 0) {
      return res.status(200).json([{ error: `Type ${typeId} does not exist` }]);
    }
    const { rows: parentCheck } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE id = ? LIMIT 1`, [parentId], { label: 'post_db_m_new_up_select' });
    if (parentCheck.length === 0) {
      return res.status(200).json([{ error: `Parent ${parentId} does not exist` }]);
    }

    // Grant check + grant1Level when parentId === 1
    if (parentId === 1) {
      const level = await grant1Level(pool, db, grants || {}, typeId, username || '');
      if (!level || level === false) {
        return res.status(200).json([{ error: 'Insufficient privileges' }]);
      }
    } else {
      if (!await checkGrant(pool, db, grants || {}, parentId, typeId, 'WRITE', username || '')) {
        return res.status(200).json([{ error: 'Insufficient privileges' }]);
      }
    }

    // Apply resolveBuiltIn + formatVal to the main value
    value = resolveBuiltIn(value, req.legacyUser || {}, db, tzone, clientIp, req.headers || {});

    // Fetch type's base type for formatVal
    const { rows: typeMeta } = await execSql(pool, `SELECT t AS base_type, ord AS type_ord FROM \`${db}\` WHERE id = ? LIMIT 1`, [typeId], { label: 'post_db_m_new_up_select' });
    const baseType = typeMeta.length > 0 ? typeMeta[0].base_type : 0;
    const unique = typeMeta.length > 0 ? typeMeta[0].type_ord : 0; // PHP: $unique = $row["ord"]; Ord=1 means unique

    // PHP parity: CheckRepColGranted($val) for REPORT_COLUMN types (index.php:8323-8324)
    if (baseType === TYPE.REPORT_COLUMN && parseInt(value, 10) !== 0) {
      const repColResult = await checkRepColGranted(pool, db, grants || {}, parseInt(value, 10), 0, username || '');
      if (repColResult === 'NOT_GRANTED') {
        return res.status(200).json([{ error: `Object type #${value} is not granted` }]);
      }
    }

    // Get next order (PHP: Calc_Order) — must be before default values (PHP line 8373)
    const order = await calcOrder(pool, db, parentId, typeId);

    // Default values: DATE→today, DATETIME→timestamp, SIGNED→1, NUMBER→unique MAX+1 or 1
    // PHP parity: index.php lines 8378-8407
    let redirectToEdit = null; // set if we find an empty object to reuse
    let redirectMaxVal = 0;    // maxVal for the redirect response
    if (!value) {
      if (baseType === TYPE.NUMBER) {
        if (unique) {
          // PHP: unique numeric — find MAX val scoped to parent, check for empty object reuse
          const { rows: maxRows } = await execSql(pool, `SELECT MAX(CAST(val AS UNSIGNED)) AS maxVal FROM \`${db}\` WHERE t = ? AND up = ?`, [typeId, parentId], { label: 'query_select' });
          const maxVal = (maxRows[0]?.maxVal || 0);

          // PHP lines 8387-8393: check if an "empty" object with max value exists (has no requisites)
          const { rows: emptyObj } = await execSql(pool, `SELECT id FROM \`${db}\` obj WHERE t = ? AND val = ? AND up = ? AND NOT EXISTS(SELECT * FROM \`${db}\` reqs WHERE up = obj.id) LIMIT 1`, [typeId, maxVal, parentId], { label: 'query_select' });
          if (emptyObj.length > 0) {
            // Reuse the empty object — redirect to edit it
            redirectToEdit = emptyObj[0].id;
            redirectMaxVal = maxVal;
          } else {
            value = String(maxVal + 1);
          }
        } else {
          // PHP line 8398: non-unique NUMBER default is 1
          value = '1';
        }
      } else if (baseType === TYPE.DATE) {
        // PHP line 8400-8401: Format_Val($base_typ, date("d", time() + tzone))
        // date("d") returns day of month; Format_Val converts to YYYYMMDD
        const now = new Date((Date.now()) + tzone * 1000);
        const dayStr = String(now.getDate());
        value = String(formatVal(baseType, dayStr, tzone));
      } else if (baseType === TYPE.DATETIME) {
        value = String(Math.floor(Date.now() / 1000));
      } else if (baseType === TYPE.SIGNED) {
        value = '1';
      } else {
        // PHP line 8406-8407: fallback — set the Order instead of the empty Value
        value = String(order);
      }
    }

    // If we found an empty object to reuse, redirect to edit instead of creating new
    if (redirectToEdit) {
      const editId = redirectToEdit;
      if (isApiRequest(req)) {
        return res.json({ id: editId, obj: editId, ord: 0, next_act: 'edit_obj', args: '', val: htmlEsc(formatValView(baseType, String(redirectMaxVal), tzone)) });
      }
      return res.redirect(`/${db}/edit_obj/${editId}`);
    }

    value = String(formatVal(baseType, value, tzone));

    // ── PHP parity: macro defaults & MULTI_MASK auto-detection (index.php:8328-8360) ──
    // Fetch all requisites defined on the type (children of typeId).
    // Each requisite's `val` may contain masks like :MULTI::!NULL:[TODAY] etc.
    const multiMap = {};   // reqId → reqType  (for multi-ref insertion later)
    const defValSet = {};  // reqId → true     (marks default-populated reqs)
    const { rows: reqDefs } = await execSql(pool, `SELECT r.id, r.t AS reqt, r.val, def.t AS base
       FROM \`${db}\` r LEFT JOIN \`${db}\` def ON def.id = r.t
       WHERE r.up = ?`, [typeId], { label: 'query_select' });
    for (const rd of reqDefs) {
      const reqId = String(rd.id);
      const reqVal = rd.val != null ? String(rd.val) : '';
      const reqBase = rd.base;

      // Skip if the client already submitted a value for this requisite
      if (req.body['t' + reqId] !== undefined) continue;
      // Skip BUTTON-type requisites (PHP: $GLOBALS["basics"][$row["base"]] !== "BUTTON")
      if (reqBase === TYPE.BUTTON) continue;
      // Skip if NEW_{id} was submitted for a reference
      if (req.body['NEW_' + reqId] !== undefined && !REV_BASE_TYPE[reqBase]) continue;

      // MULTI_MASK auto-detection: if val contains :MULTI:, register for multi-ref
      if (reqVal.includes(':MULTI:')) {
        multiMap[reqId] = rd.reqt;
      }

      // removeMasks: strip :!NULL:, :MULTI:, :ALIAS=...:
      let stripped = removeMasks(reqVal);

      if (stripped === '') continue;

      // Resolve built-in macros ([TODAY], [USER], etc.)
      let resolved = resolveBuiltIn(stripped, req.legacyUser || {}, db, tzone, clientIp, req.headers || {});

      // If resolveBuiltIn returned unchanged, the value is a literal default (not a macro)
      // PHP also tries calculatables (Get_block_data) here, but those are not yet ported.
      // For now, use the resolved value as-is.

      defValSet[reqId] = true;
      req.body['t' + reqId] = resolved;
    }

    // Uniqueness check: if ord=1 (unique), check if same val+type already exists
    if (parseInt(order, 10) === 1 || order === 1) {
      // Check for uniqueness via type attrs
      const { rows: typeAttrs } = await execSql(pool, `SELECT val FROM \`${db}\` WHERE up = ? AND t = ${TYPE.CHARS} LIMIT 1`, [typeId], { label: 'query_select' });
      const attrs = typeAttrs.length > 0 ? String(typeAttrs[0].val) : '';
      if (attrs.includes(':UNIQ:')) {
        const { rows: existingObj } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE val = ? AND t = ? AND up = ? LIMIT 1`, [value, typeId, parentId], { label: 'query_select' });
        if (existingObj.length > 0) {
          const existId = existingObj[0].id;
          warning = 'Object already exists';
          if (isApiRequest(req)) {
            return res.json({ id: existId, obj: existId, ord: 0, next_act: 'edit_obj', args: '', val: htmlEsc(formatValView(baseType, value, tzone)), warning });
          }
          return res.redirect(`/${db}/edit_obj/${existId}`);
        }
      }
    }

    // Insert the object
    const id = await insertRow(db, parentId, order, typeId, value);

    logger.info('[Legacy _m_new] Object created', { db, id, typeId, parentId });

    // Build a map of uploaded files by field name (t{id} format)
    const fileByField = {};
    if (req.files && req.files.length > 0) {
      for (const f of req.files) fileByField[f.fieldname] = f;
    }

    // Save requisites (t{id}=value format)
    const attributes = extractAttributes(req.body);
    for (const [attrTypeId, attrValue] of Object.entries(attributes)) {
      const attrTypeIdNum = parseInt(attrTypeId, 10);
      // Skip the main type's attribute (already used as value)
      if (attrTypeIdNum === typeId) continue;

      let finalValue = String(attrValue);

      // Fetch attribute metadata for processing
      const { rows: attrMeta } = await execSql(pool, `SELECT t AS base_type FROM \`${db}\` WHERE id = ? LIMIT 1`, [attrTypeIdNum], { label: 'query_select' });
      const attrBaseType = attrMeta.length > 0 ? attrMeta[0].base_type : 0;

      // If a file was uploaded for this requisite, persist it and use the filename
      const uploadedFile = fileByField[`t${attrTypeId}`];
      if (uploadedFile) {
        // File blacklist check
        if (isBlacklisted(uploadedFile.originalname)) {
          logger.warn('[Legacy _m_new] Blacklisted file rejected', { db, filename: uploadedFile.originalname });
          continue;
        }
        const subdir = getSubdir(db, id);
        const uploadDir = path.join(legacyPath, 'download', db, subdir);
        fs.mkdirSync(uploadDir, { recursive: true });
        const ext = path.extname(uploadedFile.originalname);
        const baseName = getFilename(db, id);
        const safeName = `${baseName}${ext}`;
        fs.writeFileSync(path.join(uploadDir, safeName), uploadedFile.buffer);
        finalValue = safeName;
        logger.info('[Legacy _m_new] File saved for requisite', { db, attrTypeId, safeName });
      } else {
        // Apply resolveBuiltIn + formatVal
        finalValue = resolveBuiltIn(finalValue, req.legacyUser || {}, db, tzone, clientIp, req.headers || {});
        finalValue = String(formatVal(attrBaseType, finalValue, tzone));
      }

      // Multiselect: check multiMap (from MULTI_MASK auto-detection) and CHARS-child attrs
      let isMulti = !!multiMap[attrTypeId];
      if (!isMulti) {
        const { rows: attrAttrs } = await execSql(pool, `SELECT val FROM \`${db}\` WHERE up = ? AND t = ${TYPE.CHARS} LIMIT 1`, [attrTypeIdNum], { label: 'query_select' });
        const attrAttrsStr = attrAttrs.length > 0 ? String(attrAttrs[0].val) : '';
        if (attrAttrsStr.includes(':MULTI:')) isMulti = true;
      }
      if (isMulti && finalValue.includes(',')) {
        const values = finalValue.split(',').map(v => v.trim()).filter(v => v);
        for (const mv of values) {
          const attrOrder = await calcOrder(pool, db, id, attrTypeIdNum);
          await insertRow(db, id, attrOrder, attrTypeIdNum, mv);
        }
        continue;
      }

      // Reference storage: if not a base type, store as reference (in t column)
      if (!REV_BASE_TYPE[attrBaseType]) {
        // PHP parity: multi-ref support — split comma-separated ref IDs
        const refs = finalValue.split(',').map(v => parseInt(v.trim(), 10)).filter(v => v > 0);
        if (refs.length > 0) {
          for (const rv of refs) {
            const { rows: refCheck } = await execSql(pool, `SELECT val FROM \`${db}\` WHERE id = ? AND t = ? LIMIT 1`, [rv, attrTypeIdNum], { label: 'query_select' });
            if (refCheck.length > 0) {
              // PHP parity: skip Check_Val_granted for default-value refs (index.php:8494)
              if (!defValSet[attrTypeId]) {
                const valGrantResult = await checkValGranted(pool, db, grants || {}, attrTypeIdNum, refCheck[0].val, rv);
                if (valGrantResult === 'BARRED') {
                  return res.status(200).json([{ error: `You do not have this object granted (${refCheck[0].val}) (${attrTypeIdNum})` }]);
                }
              }
              const attrOrder = await getRefOrd(pool, db, id, attrTypeIdNum);
              await insertRow(db, id, attrOrder, rv, String(attrTypeIdNum));
              if (!isMulti) break; // single-ref: only first value
            }
          }
          continue;
        }
      }

      const attrOrder = await calcOrder(pool, db, id, attrTypeIdNum);
      await insertRow(db, id, attrOrder, attrTypeIdNum, finalValue);
    }

    // Handle NEW_{typeId} parameters — create or find reference objects
    for (const [key, val] of Object.entries(req.body)) {
      const match = key.match(/^NEW_(\d+)$/);
      if (match && val && String(val).trim()) {
        const refTypeId = parseInt(match[1], 10);
        const newVal = String(val).trim();

        const { rows: existingRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE val = ? AND t = ? LIMIT 1`, [newVal, refTypeId], { label: 'query_select' });

        let refId;
        if (existingRows.length > 0) {
          refId = existingRows[0].id;
        } else {
          const { rows: insertResult } = await execSql(pool, `INSERT INTO \`${db}\` (up, ord, t, val) VALUES (1, 1, ?, ?)`, [refTypeId, newVal], { label: 'query_insert' });
          refId = insertResult.insertId;
        }

        // Store the reference as a child of the new object
        const attrOrder = await calcOrder(pool, db, id, refTypeId);
        await insertRow(db, id, attrOrder, refId, '');
      }
    }

    // Check if type has requisites (determines next_act per PHP logic)
    const { rows: reqRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE up=? AND up!=0 LIMIT 1`, [typeId], { label: 'query_select' });
    const hasReqs = reqRows.length > 0;

    // PHP _m_new die() (line 8547): {"id":$i,"obj":$obj,"ord":$ord,"next_act":"$a","args":"$arg","val":"<htmlentities(val)>"}
    // No "warnings" or "warning" field — PHP uses direct die() not api_dump() for _m_new
    // id = obj = new objectId
    // args: "new1=1&" when has reqs; "F_U=$up" when up!=1 and no reqs; "" otherwise
    const next_act = hasReqs ? 'edit_obj' : 'object';
    const args = hasReqs ? 'new1=1&' : (parentId !== 1 ? `F_U=${parentId}` : '');

    // Response escaping: htmlEsc(formatValView(...))
    const displayVal = htmlEsc(String(formatValView(baseType, value, tzone)));

    if (isApiRequest(req)) {
      return res.json({ id, obj: id, ord: parseInt(order, 10) || 0, next_act, args, val: displayVal });
    }
    // Non-JSON: redirect like legacyRespond
    const idPart  = id  ? `/${id}`   : '';
    const argPart = args && String(args).length ? `?${args}` : '';
    const hashPart = id != null ? `#${id}` : '';
    return res.redirect(`/${db}/${next_act}${idPart}${argPart}${hashPart}`);
  } catch (error) {
    logger.error({ error: error.message, db }, '[Legacy _m_new] Error');
    return res.status(200).json([{ error: error.message }]);
  }
});

/**
 * Get_Current_Values — load current field values for an object before save.
 * Port of PHP Get_Current_Values (index.php:6977).
 *
 * Runs GetObjectReqs Query 1 (field definitions) and Query 2 (stored values),
 * then merges them into plain-object maps the caller can use for validation,
 * NOT_NULL enforcement, BOOLEAN tracking, and REFERENCE / ARRAY resolution.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} db   - database (table) name
 * @param {number|string} id  - object id
 * @param {number|string} typ - object type id
 * @param {object} reqs    - mutable requisite map  { reqId → metadata|value }
 * @param {object} refTyps - reqId → refTypeId mapping
 * @param {object} arrTyps - reqId → arrSubTypeId mapping
 * @param {object} revBt   - reqId → base-type name mapping
 * @returns {Promise<{reqs: object, reqTyps: object, notNull: object, revBt: object, booleans: object}>}
 */
async function getCurrentValues(pool, db, id, typ, reqs, refTyps, arrTyps, revBt) {
  const z = sanitizeIdentifier(db);

  // ── Query 1: Req field definitions (PHP GetObjectReqs query 1) ──────────
  const q1 = `SELECT a.id AS req_id, refs.id AS ref_id, a.val AS attrs, a.ord,
                CASE WHEN refs.id IS NULL THEN typs.t    ELSE refs.t   END AS base_typ,
                CASE WHEN refs.id IS NULL THEN typs.val  ELSE refs.val END AS type_val,
                CASE WHEN arrs.id IS NULL THEN NULL      ELSE typs.id  END AS arr_id
         FROM ${z} a, ${z} typs
         LEFT JOIN ${z} refs ON refs.id=typs.t AND refs.t!=refs.id
         LEFT JOIN ${z} arrs ON refs.id IS NULL AND arrs.up=typs.id AND arrs.ord=1
         WHERE a.up=? AND typs.id=a.t ORDER BY a.ord`;
  const { rows: reqMeta } = await execSql(pool, q1, [typ], { label: 'getCurrentValues_q1', db });

  // Build local metadata from Query 1 (populates reqs, refTyps, arrTyps if empty)
  const localReqs    = {};   // reqId → { base_typ, attrs }
  for (const rd of reqMeta) {
    const k = String(rd.req_id);
    localReqs[k] = {
      base_typ: rd.base_typ,
      attrs:    rd.attrs || '',
    };
    if (rd.ref_id != null)       refTyps[k] = String(rd.ref_id);
    else if (rd.arr_id != null)  arrTyps[k] = String(rd.arr_id);
  }

  // ── Query 2: Stored values (PHP GetObjectReqs query 2) ─────────────────
  // PHP conditionally builds the second SELECT: the COUNT/GROUP BY variant
  // is only used when array types exist (isset($GLOBALS["ARR_typs"])).
  const hasArrayTypes = Object.keys(arrTyps).length > 0;
  const q2 = hasArrayTypes
    ? `SELECT CASE WHEN typs.up=0 THEN 0 ELSE reqs.id  END AS id,
                CASE WHEN typs.up=0 THEN 0 ELSE reqs.val END AS val,
                reqs.ord, typs.id AS t, COUNT(1) AS arr_num,
                origs.t AS bt, typs.val AS ref_val
         FROM ${z} reqs
         JOIN ${z} typs  ON typs.id  = reqs.t
         LEFT JOIN ${z} origs ON origs.id = typs.t
         WHERE reqs.up = ?
         GROUP BY val, id, t
         ORDER BY reqs.ord`
    : `SELECT CASE WHEN typs.up=0 THEN 0 ELSE reqs.id  END AS id,
                CASE WHEN typs.up=0 THEN 0 ELSE reqs.val END AS val,
                reqs.ord, typs.id AS t, 1 AS arr_num,
                origs.t AS bt, typs.val AS ref_val
         FROM ${z} reqs
         JOIN ${z} typs  ON typs.id  = reqs.t
         LEFT JOIN ${z} origs ON origs.id = typs.t
         WHERE reqs.up = ?
         ORDER BY reqs.ord`;
  const { rows: storedRows } = await execSql(pool, q2, [id], { label: 'getCurrentValues_q2', db });

  // Process stored rows into a keyed map (PHP: $rows)
  const rows = {};
  for (const row of storedRows) {
    const tStr = String(row.t);
    rows[tStr] = {
      id:      row.id != null ? String(row.id) : '',
      val:     row.val != null ? String(row.val) : '',
      arr_num: Number(row.arr_num),
    };
  }

  // ── Merge pass (PHP foreach over GLOBALS["REQS"]) ──────────────────────
  const reqTyps  = {};
  const notNull  = {};
  const booleans = {};

  // Iterate over all known requisite keys from Query 1
  for (const key of Object.keys(localReqs)) {
    const meta = localReqs[key];

    // NOT_NULL detection (PHP: strpos attrs, NOT_NULL_MASK)
    if (meta.attrs && meta.attrs.includes(':!NULL:')) {
      notNull[key] = '';
    }

    // Reverse base-type mapping
    const baseTypId = meta.base_typ;
    const mappedType = REV_BASE_TYPE[baseTypId] || revBt[baseTypId] || '';
    if (!mappedType) {
      logger.warn('[getCurrentValues] Unknown base type mapping — falling back to empty string', {
        db, reqKey: key, baseTypId,
      });
    }
    revBt[key] = mappedType;

    if (rows[key] !== undefined) {
      // Direct match — stored value keyed by req type id
      reqs[key]    = rows[key].val;
      reqTyps[key] = rows[key].id;
    } else if (refTyps[key] !== undefined) {
      // REFERENCE resolution: look up by the ref-type id
      const refKey = refTyps[key];
      if (rows[refKey] !== undefined) {
        reqs[key]    = rows[refKey].val;
        reqTyps[key] = rows[refKey].id;
      } else {
        reqs[key]    = '';
        reqTyps[key] = '';
      }
      revBt[key] = 'REFERENCE';
    } else if (arrTyps[key] !== undefined) {
      // ARRAY / multiselect resolution: use arr_num
      const arrKey = arrTyps[key];
      reqs[key] = rows[arrKey] !== undefined ? rows[arrKey].arr_num : 0;
    } else if (key !== String(typ)) {
      // Default: empty
      reqs[key]    = '';
      reqTyps[key] = '';
    }

    // BOOLEAN tracking
    if (revBt[key] === 'BOOLEAN' && reqs[key] == 1) {  // == intentional (PHP loose comparison)
      booleans[key] = 1;
    }
  }

  return { reqs, reqTyps, notNull, revBt, booleans };
}

/**
 * _m_save - Save/update object attributes (with copy support)
 * POST /:db/_m_save/:id
 * Parameters:
 *   - val: object value
 *   - t{id}=value: attributes to update
 *   - copybtn: (query param) if present, creates a copy of the object
 *
 * PHP: index.php lines 7991-8163
 * When copybtn is set, copies the object and all its requisites.
 */
router.post('/:db/_m_save/:id', legacyAuthMiddleware, legacyXsrfCheck, (req, res, next) => {
  // Use upload.any() so FILE-type requisites can be uploaded alongside text fields
  upload.any()(req, res, (err) => {
    if (err) logger.warn('[Legacy _m_save] Multer error', { error: err.message });
    next();
  });
}, async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    const originalId = parseInt(id, 10);
    const { grants, username, uid } = req.legacyUser || {};
    const tzone = parseInt(req.body.tzone || req.query.tzone || '0', 10);
    const clientIp = req.ip || '';
    let warnings = '';

    // Existence check + metadata protection
    const { rows: existCheck } = await execSql(pool, `SELECT id, up FROM \`${db}\` WHERE id = ? LIMIT 1`, [originalId], { label: 'post_db_m_save_id_select' });
    if (existCheck.length === 0) {
      return res.status(200).json([{ error: 'Object not found' }]);
    }
    if (existCheck[0].up === 0) {
      return res.status(200).json([{ error: 'Cannot modify metadata object' }]);
    }

    // Grant check — PHP checks WRITE grant before saving
    if (!await checkGrant(pool, db, grants || {}, originalId, 0, 'WRITE', username || '')) {
      return res.status(200).json([{ error: 'Insufficient privileges' }]);
    }

    // Check if this is a copy operation (PHP: isset($_REQUEST["copybtn"]))
    const isCopy = req.query.copybtn !== undefined || req.body.copybtn !== undefined;

    let objectId = originalId;

    // Build a map of uploaded files by field name (t{id} format)
    const fileByField = {};
    if (req.files && req.files.length > 0) {
      for (const f of req.files) fileByField[f.fieldname] = f;
    }

    if (isCopy) {
      // PHP lines 8018-8037: Copy the object
      logger.info('[Legacy _m_save] Copying object', { db, originalId });

      // Get the original object's data
      const { rows: objRows } = await execSql(pool, `
        SELECT a.val, a.t AS typ, a.up, a.ord, typs.t AS base_typ
        FROM \`${db}\` typs, \`${db}\` a
        WHERE typs.id = a.t AND a.id = ?
      `, [originalId], { label: 'post_db_m_save_id_select' });

      if (objRows.length === 0) {
        return res.status(200).json([{ error: 'Object not found' }]);
      }

      const original = objRows[0];

      // Get value from request if provided, otherwise use original
      // Also check req.query: dubRecUniqNum sends &t{tid}=newValue in URL query string
      const allSaveParams = { ...req.query, ...req.body };
      const newVal = allSaveParams[`t${original.typ}`] !== undefined
        ? allSaveParams[`t${original.typ}`]
        : (allSaveParams.val !== undefined ? allSaveParams.val : original.val);

      // Calculate order for new object
      let newOrd = 1;
      if (original.up > 1) {
        const { rows: ordRows } = await execSql(pool, `
          SELECT MAX(ord) AS max_ord FROM \`${db}\`
          WHERE up = ? AND t = ?
        `, [original.up, original.typ], { label: 'post_db_m_save_id_select' });
        newOrd = (ordRows[0]?.max_ord || 0) + 1;
      }

      // Create the copy
      const { rows: insertResult } = await execSql(pool, `
        INSERT INTO \`${db}\` (up, ord, t, val)
        VALUES (?, ?, ?, ?)
      `, [original.up, newOrd, original.typ, newVal], { label: 'post_db_m_save_id_insert' });

      objectId = insertResult.insertId;

      // Recursive copy: use populateReqs helper to deeply copy all requisites
      await populateReqs(pool, db, originalId, objectId);

      logger.info('[Legacy _m_save] Object copied', { db, originalId, newId: objectId });

      // PHP api_dump() for copy (lines 8228-8234):
      //   $arg = "copied1=1&F_U=$up&F_I=$id" (F_I = new objectId)
      //   $obj = $id (new objectId)
      //   $id  = $typ (type ID as string, PHP mysqli_fetch_array returns strings)
      return legacyRespond(req, res, db, {
        id: String(original.typ),
        obj: objectId,
        next_act: 'object',
        args: `copied1=1&F_U=${original.up}&F_I=${objectId}`,
      });
    }

    // Fetch object's type early — needed to detect when t{objType}=val means "update a.val"
    // (smartq sends t{parentType}=newName when inline-editing the main column)
    const { rows: objInfoEarly } = await execSql(pool, `SELECT t, up, val FROM \`${db}\` WHERE id = ? LIMIT 1`, [objectId], { label: 'query_select' });
    const objTypeEarly = objInfoEarly.length > 0 ? objInfoEarly[0].t : 0;
    const objValEarly = objInfoEarly.length > 0 ? objInfoEarly[0].val : '';

    // Load current field values for this object (PHP: Get_Current_Values)
    // Provides NOT_NULL enforcement, BOOLEAN tracking, and REFERENCE/ARRAY resolution
    const currentReqs = {};
    const currentRefTyps = {};
    const currentArrTyps = {};
    const currentRevBt = {};
    // getCurrentValues mutates the passed-in objects AND returns a clean result
    // object.  Destructure so every property is available to downstream logic.
    const { reqs: currentReqVals, reqTyps: currentReqTyps,
            notNull: currentNotNull, booleans: currentBooleans } =
      await getCurrentValues(
        pool, db, objectId, objTypeEarly,
        currentReqs, currentRefTyps, currentArrTyps, currentRevBt
      );

    // Normal save (not copy)
    // Update value if provided
    if (req.body.val !== undefined) {
      // PHP line 8098: prevent renaming the admin user (val === db name)
      if (objTypeEarly === TYPE.USER && objValEarly === db && String(req.body.val) !== db) {
        return res.status(200).json([{ error: 'Please create another user instead of renaming the admin' }]);
      }
      await updateRowValue(db, objectId, req.body.val);
    }

    // Handle NEW_t parameters - create reference on-the-fly (PHP lines 8069-8080)
    // NEW_{typeId} creates a new object of that type if it doesn't exist
    const newRefParams = {};
    for (const [key, value] of Object.entries(req.body)) {
      const match = key.match(/^NEW_(\d+)$/);
      if (match && value && String(value).trim()) {
        const refTypeId = parseInt(match[1], 10);
        newRefParams[refTypeId] = String(value).trim();
      }
    }

    // Process NEW_t parameters
    for (const [refTypeId, newVal] of Object.entries(newRefParams)) {
      const typeIdNum = parseInt(refTypeId, 10);

      // Check if object with this val already exists for this type
      const { rows: existingRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE val = ? AND t = ? LIMIT 1`, [newVal, typeIdNum], { label: 'query_select' });

      let refId;
      if (existingRows.length > 0) {
        // Use existing object
        refId = existingRows[0].id;
      } else {
        // Create new object of that type (PHP: Insert(1, 1, $GLOBALS["REF_typs"][$t], $value))
        const { rows: insertResult } = await execSql(pool, `INSERT INTO \`${db}\` (up, ord, t, val) VALUES (1, 1, ?, ?)`, [typeIdNum, newVal], { label: 'query_insert' });
        refId = insertResult.insertId;
        logger.info('[Legacy _m_save] Created new ref object', { db, typeId: typeIdNum, val: newVal, id: refId });
      }

      // Update the t{typeId} value to point to the new/existing reference
      req.body[`t${refTypeId}`] = String(refId);
    }

    // Track boolean type IDs to handle unchecked booleans later
    const booleanTypeIds = new Set();
    const processedTypeIds = new Set();

    // Update requisites (t{id}=value format); merge query+body so t{id}=val works in URL too
    // (smartq.js sends &t{tid}=(timestamp) in URL query for DATETIME unique value on copy)
    const attributes = extractAttributes({ ...req.query, ...req.body });
    for (const [attrTypeId, attrValue] of Object.entries(attributes)) {
      const typeIdNum = parseInt(attrTypeId, 10);
      processedTypeIds.add(typeIdNum);

      // When smartq inline-edits the main column, it sends t{objType}=newName.
      // This means "update a.val", not a child requisite row.
      if (typeIdNum === objTypeEarly) {
        // PHP line 8098: prevent renaming the admin user
        // The admin user's val equals the database name ($z)
        if (objTypeEarly === TYPE.USER && objValEarly === db && String(attrValue) !== db) {
          return res.status(200).json([{ error: 'Please create another user instead of renaming the admin' }]);
        }
        await updateRowValue(db, objectId, String(attrValue));
        continue;
      }

      let finalValue = String(attrValue);

      // Fetch attribute metadata (base_type, attrs) for processing
      const { rows: attrMeta } = await execSql(pool, `SELECT t AS base_type, val FROM \`${db}\` WHERE id = ? LIMIT 1`, [typeIdNum], { label: 'query_select' });
      const meta = attrMeta.length > 0 ? attrMeta[0] : null;
      const baseType = meta ? meta.base_type : 0;

      // PASSWORDSTARS skip: don't update PASSWORD/TOKEN/XSRF fields with masked value
      if (finalValue === '******' && (baseType === TYPE.PWD || typeIdNum === TYPE.PASSWORD ||
          typeIdNum === TYPE.TOKEN || typeIdNum === TYPE.XSRF)) {
        continue;
      }

      // PHP PASSWORD hash edge case: when saving a PASSWORD-type requisite,
      // use t{USER} from POST body as username if present, else read from DB.
      if (typeIdNum === TYPE.PASSWORD) {
        let pwdUsername = req.body[`t${TYPE.USER}`];
        if (!pwdUsername) {
          // Fall back to current object's val (it IS the user object)
          const { rows: uRows } = await execSql(pool, `SELECT val FROM \`${db}\` WHERE id = ? LIMIT 1`, [objectId], { label: 'query_select' });
          pwdUsername = uRows.length > 0 ? uRows[0].val : '';
        }
        finalValue = phpCompatibleHash(pwdUsername, attrValue, db);
      } else {
        // Handle file uploads for this attribute
        const uploadedFile = fileByField[`t${attrTypeId}`];
        if (uploadedFile) {
          if (isBlacklisted(uploadedFile.originalname)) {
            logger.warn('[Legacy _m_save] Blacklisted file rejected', { db, filename: uploadedFile.originalname });
            continue;
          }
          const subdir = getSubdir(db, objectId);
          const uploadDir = path.join(legacyPath, 'download', db, subdir);
          fs.mkdirSync(uploadDir, { recursive: true });
          const ext = path.extname(uploadedFile.originalname);
          const baseName = getFilename(db, objectId);
          const safeName = `${baseName}${ext}`;
          fs.writeFileSync(path.join(uploadDir, safeName), uploadedFile.buffer);
          finalValue = safeName;
        }

        // Apply resolveBuiltIn then formatVal before storage
        finalValue = resolveBuiltIn(finalValue, req.legacyUser || {}, db, tzone, clientIp, req.headers || {});
        if (meta) {
          finalValue = String(formatVal(baseType, finalValue, tzone));
        }
      }

      // Mask-level write restriction: reject values barred by role mask
      // Port of PHP Val_barred_by_mask() called before writing (index.php:896-919)
      if (await valBarredByMask(pool, db, grants || {}, typeIdNum, finalValue)) {
        warnings += `Field ${typeIdNum} is restricted by mask. `;
        continue;
      }

      // NOT_NULL enforcement: check attrs for :!NULL:
      if (meta) {
        const { rows: attrAttrs } = await execSql(pool, `SELECT val FROM \`${db}\` WHERE up = ? AND t = ${TYPE.CHARS} LIMIT 1`, [typeIdNum], { label: 'query_select' });
        const attrs = attrAttrs.length > 0 ? String(attrAttrs[0].val) : '';

        if (attrs.includes(':!NULL:') && (finalValue === '' || finalValue === 'NULL')) {
          warnings += `Field ${typeIdNum} cannot be empty. `;
          continue;
        }

        // Multiselect: if :MULTI:, split comma values
        if (attrs.includes(':MULTI:') && finalValue.includes(',')) {
          const values = finalValue.split(',').map(v => v.trim()).filter(v => v);
          for (const mv of values) {
            const attrOrder = await calcOrder(pool, db, objectId, typeIdNum);
            await insertRow(db, objectId, attrOrder, typeIdNum, mv);
          }
          await checkDuplicatedReqs(pool, db, objectId, typeIdNum);
          continue;
        }
      }

      // Track boolean types for unchecked boolean cleanup
      if (baseType === TYPE.BOOLEAN) {
        booleanTypeIds.add(typeIdNum);
      }

      // Reference storage fix: if type is a reference (NOT in REV_BASE_TYPE), store in t column
      if (meta && !REV_BASE_TYPE[baseType]) {
        const refVal = parseInt(finalValue, 10);
        if (refVal > 0) {
          await checkNewRef(pool, db, typeIdNum, refVal);
          // PHP parity: Check_Val_granted for ref values (index.php:8115-8119)
          const { rows: refCheck } = await execSql(pool, `SELECT val FROM \`${db}\` WHERE id = ? AND t = ? LIMIT 1`, [refVal, typeIdNum], { label: 'query_select' });
          if (refCheck.length > 0) {
            const valGrantResult = await checkValGranted(pool, db, grants || {}, typeIdNum, refCheck[0].val, refVal);
            if (valGrantResult === 'BARRED') {
              return res.status(200).json([{ error: `You do not have this object granted (${refCheck[0].val}) (${typeIdNum})` }]);
            }
          }
          // PHP parity: CheckRepColGranted for REPORT_COLUMN ref types (index.php:8095-8096)
          if (baseType === TYPE.REPORT_COLUMN) {
            const repColResult = await checkRepColGranted(pool, db, grants || {}, refVal, 0, username || '');
            if (repColResult === 'NOT_GRANTED') {
              return res.status(200).json([{ error: `Object type #${refVal} is not granted` }]);
            }
          }
        }
        const existing = await getRequisiteByType(db, objectId, typeIdNum);
        if (existing) {
          await execSql(pool, `UPDATE \`${db}\` SET t = ? WHERE id = ?`, [refVal, existing.id], { label: 'query_update' });
        } else {
          const attrOrder = await calcOrder(pool, db, objectId, typeIdNum);
          await insertRow(db, objectId, attrOrder, refVal, '');
        }
        await checkDuplicatedReqs(pool, db, objectId, typeIdNum);
        continue;
      }

      // Empty→DELETE: if value empty → delete the requisite and its children
      // PHP parity (index.php:8147-8155): no :!NULL: guard in PHP at this point;
      // PHP simply checks if the value was cleared and it's not a multi-ref.
      if ((finalValue === '' || finalValue === 'NULL') && meta) {
        const existing = await getRequisiteByType(db, objectId, typeIdNum);
        if (!existing) {
          // PHP: $req_id == 0 → warning
          warnings += 'Empty attribute type<br>';
          continue;
        }
        // PHP parity (index.php:8151): if type is the object's own type, skip deletion
        if (typeIdNum === objTypeEarly) {
          warnings += 'Object name cannot be blank!<br>';
          continue;
        }
        // PHP parity (index.php:8152): cascade delete — "DELETE FROM $z WHERE id=$req_id OR up=$req_id"
        await execSql(pool, `DELETE FROM \`${db}\` WHERE id = ? OR up = ?`, [existing.id, existing.id], { label: 'delete_empty_cascade' });
        continue;
      }

      const existing = await getRequisiteByType(db, objectId, typeIdNum);
      if (existing) {
        // Update existing requisite
        await updateRowValue(db, existing.id, finalValue);
      } else {
        // Create new requisite
        const attrOrder = await calcOrder(pool, db, objectId, typeIdNum);
        await insertRow(db, objectId, attrOrder, typeIdNum, finalValue);
      }

      // Check for duplicates after each attribute update
      await checkDuplicatedReqs(pool, db, objectId, typeIdNum);
    }

    // Boolean cleanup: process b{typeId} markers — delete unchecked booleans
    for (const [key, value] of Object.entries(req.body)) {
      const bMatch = key.match(/^b(\d+)$/);
      if (bMatch) {
        const bTypeId = parseInt(bMatch[1], 10);
        // If the corresponding t{id} was NOT submitted, the checkbox was unchecked
        if (!processedTypeIds.has(bTypeId)) {
          // PHP parity (index.php:8164-8166): check WRITE grant before deleting unchecked boolean
          const hasGrant = await checkGrant(pool, db, req.legacyUser.grants, objectId, bTypeId, 'WRITE', req.legacyUser.username);
          if (!hasGrant) continue;
          const existing = await getRequisiteByType(db, objectId, bTypeId);
          if (existing) {
            await deleteRow(db, existing.id);
          }
        }
      }
    }

    // Handle SEARCH_* parameters - persist search criteria for dropdown lists
    // PHP lines 8011-8017: collect SEARCH_* params that differ from PREV_SEARCH_* values
    const searchParams = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (key.startsWith('SEARCH_') && String(value).length > 0) {
        const prevKey = 'PREV_' + key;
        const prevValue = req.body[prevKey];
        // PHP: only include if value changed from PREV_SEARCH_* (or no previous value)
        if (prevValue === undefined || value !== prevValue) {
          searchParams[key.substring(7)] = value; // strip 'SEARCH_' prefix
        }
      }
    }

    logger.info('[Legacy _m_save] Object saved', { db, id: objectId, newRefs: Object.keys(newRefParams).length });

    // Reuse the already-fetched object info for PHP api_dump() compatible response
    const objType = objTypeEarly;
    const objUp   = objInfoEarly.length > 0 ? objInfoEarly[0].up : 0;

    // PHP api_dump(): {id, obj, next_act, args, warnings}
    // PHP: $obj = $id (objectId); $id = $typ (typeId) — so id=typeId, obj=objectId
    // PHP args: "saved1=1&F_U=$up&F_I=$id" (always include prefix + F_U + F_I)
    //           "copied1=1&F_U=$up&F_I=$id" for copy operations
    const argsPrefix = isCopy ? 'copied1=1&' : 'saved1=1&';
    const response = {
      id: String(objType),
      obj: objectId,
      next_act: 'object',
      args: `${argsPrefix}F_U=${objUp}&F_I=${objectId}`,
      warnings,
    };

    // If SEARCH_* params are present, include them so the client can filter dropdown lists
    if (Object.keys(searchParams).length > 0) {
      response.search = searchParams;
    }

    legacyRespond(req, res, db, response);
  } catch (error) {
    logger.error('[Legacy _m_save] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _m_del - Delete object
 * POST /:db/_m_del/:id
 */
router.post('/:db/_m_del/:id', legacyAuthMiddleware, legacyXsrfCheck, async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    const objectId = parseInt(id, 10);
    const { grants, username, uid } = req.legacyUser || {};

    if (!objectId) {
      return res.status(200).json([{ error: `Wrong id: ${id}` }]);
    }

    // Grant check — PHP checks WRITE grant before deletion
    if (!await checkGrant(pool, db, grants || {}, objectId, 0, 'WRITE', username || '')) {
      return res.status(200).json([{ error: 'Insufficient privileges' }]);
    }

    // Self-deletion prevention: user cannot delete themselves
    if (objectId === uid) {
      return res.status(200).json([{ error: 'You cannot delete yourself' }]);
    }

    // PHP: SELECT count(r.id), obj.up, obj.ord, obj.t, obj.val, par.up pup, type.up tup
    //      FROM $z obj
    //        LEFT JOIN $z type ON type.id=obj.t
    //        LEFT JOIN $z r ON r.t=obj.id
    //        JOIN $z par ON par.id=obj.up
    //      WHERE obj.id=$id
    const { rows: [row] } = await execSql(pool, `SELECT COUNT(r.id) AS refCount, obj.up, obj.ord, obj.t, obj.val,
              par.up AS pup, type.up AS tup
       FROM \`${db}\` obj
       LEFT JOIN \`${db}\` type ON type.id = obj.t
       LEFT JOIN \`${db}\` r ON r.t = obj.id
       JOIN \`${db}\` par ON par.id = obj.up
       WHERE obj.id = ?`, [objectId], { label: 'post_db_m_del_id_select' });

    if (!row || row.pup == null) {
      return res.status(200).json([{ error: 'Object not found' }]);
    }

    // PHP: if pup==0 → can't delete metadata
    if (String(row.pup) === '0') {
      return res.status(200).json([{ error: `You can't delete metadata (type ${objectId})!` }]);
    }

    // PHP: if refCount > 0 → can't delete (has references)
    const cascade = req.body.cascade === '1' || req.body.cascade === true ||
                    req.query.forced !== undefined;
    if (!cascade && row.refCount > 0) {
      return res.status(200).json([{ error: `You can't delete an object that has links to it (total: ${row.refCount})!` }]);
    }

    // PHP: adjust peer orders for array or multiselect elements
    if (row.up > 1) {
      if (String(row.tup) === '0') {
        // Array element: shift down following peers of same type in same parent
        await execSql(pool, `UPDATE \`${db}\` SET ord = ord - 1 WHERE up = ? AND t = ? AND ord > ?`, [row.up, row.t, row.ord], { label: 'post_db_m_del_id_update' });
      } else if (!isNaN(Number(row.val)) && Number(row.val) > 0) {
        // Reference/multiselect element: shift down following by val+ord
        await execSql(pool, `UPDATE \`${db}\` SET ord = ord - 1 WHERE up = ? AND val = ? AND ord > ?`, [row.up, row.val, row.ord], { label: 'post_db_m_del_id_update' });
      }
    }

    // Delete recursively (PHP Delete) — replaces flat deleteChildren + deleteRow
    await recursiveDelete(pool, db, objectId);

    logger.info('[Legacy _m_del] Object deleted', { db, id: objectId });

    // PHP: $id = row.t (type), $obj = objectId, next_act = "object"
    // PHP args: "F_U=$up" only for array elements (tup==="0"), not for reference elements
    const objType = row.t;
    const objUp   = row.up;
    const isArrayElement = String(row.tup) === '0';
    legacyRespond(req, res, db, {
      id: String(objType),
      obj: objectId,
      next_act: 'object',
      args: (objUp > 1 && isArrayElement) ? `F_U=${objUp}` : '',
    });
  } catch (error) {
    logger.error('[Legacy _m_del] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _m_set - Set object attributes
 * POST /:db/_m_set/:id
 * Parameters: t{id}=value (attributes to set), or t{id}=<file> for inline file upload
 * saveInlineFile in smartq.js uploads file as t{reqId} and reads json.args as download path
 */
router.post('/:db/_m_set/:id', legacyAuthMiddleware, legacyXsrfCheck, upload.any(), async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    const objectId = parseInt(id, 10);
    const { grants, username, uid } = req.legacyUser || {};

    // Grant check — PHP checks WRITE grant before setting attributes
    if (!await checkGrant(pool, db, grants || {}, objectId, 0, 'WRITE', username || '')) {
      return res.status(200).json([{ error: 'Insufficient privileges' }]);
    }

    // Merge query+body: smartq.js line 959 sends &t{ref}=value in URL query string for select2 inline edit
    const attributes = extractAttributes({ ...req.query, ...req.body });

    // Build file map from uploaded files (field name = t{typeId})
    const fileByField = {};
    if (req.files && req.files.length > 0) {
      for (const f of req.files) {
        fileByField[f.fieldname] = f;
        // Ensure file fields are included in attributes even if body has no text value
        if (/^t\d+$/.test(f.fieldname) && !(parseInt(f.fieldname.substring(1), 10) in attributes)) {
          attributes[parseInt(f.fieldname.substring(1), 10)] = '';
        }
      }
    }

    if (Object.keys(attributes).length === 0) {
      return res.status(200).json([{ error: 'No attributes provided'  }]);
    }

    let uploadedFilePath = null;
    let lastReqId = '';
    const tzone = parseInt(req.body.tzone || req.query.tzone || '0', 10);
    const clientIp = req.ip || '';

    for (const [attrTypeId, attrValue] of Object.entries(attributes)) {
      const typeIdNum = parseInt(attrTypeId, 10);
      let finalValue = String(attrValue);

      // Fetch attribute metadata (base_type, attrs) to detect references and :MULTI:
      const { rows: attrMeta } = await execSql(pool, `SELECT t AS base_type, val, up FROM \`${db}\` WHERE id = ? LIMIT 1`, [typeIdNum], { label: 'post_db_m_set_id_select' });
      const meta = attrMeta.length > 0 ? attrMeta[0] : null;

      // Handle inline file upload (saveInlineFile in smartq.js)
      const uploadedFile = fileByField[`t${attrTypeId}`];
      if (uploadedFile) {
        // File blacklist check
        if (isBlacklisted(uploadedFile.originalname)) {
          logger.warn('[Legacy _m_set] Blacklisted file rejected', { db, filename: uploadedFile.originalname });
          continue;
        }

        const subdir = getSubdir(db, objectId);
        const uploadDir = path.join(legacyPath, 'download', db, subdir);
        fs.mkdirSync(uploadDir, { recursive: true });
        const ext = path.extname(uploadedFile.originalname);
        const baseName = getFilename(db, objectId);
        const safeName = `${baseName}${ext}`;
        fs.writeFileSync(path.join(uploadDir, safeName), uploadedFile.buffer);
        finalValue = safeName;
        uploadedFilePath = `${db}/download/${subdir}/${safeName}`;
        logger.info('[Legacy _m_set] File saved', { db, attrTypeId, safeName });
      }

      // File deletion: when value cleared and type is FILE, delete old file
      // PHP parity: RemoveDir() handles both files and directories recursively
      if (meta && meta.base_type === TYPE.FILE && !finalValue && !uploadedFile) {
        const existing = await getRequisiteByType(db, objectId, typeIdNum);
        if (existing && existing.val) {
          const subdir = getSubdir(db, objectId);
          const oldPath = path.join(legacyPath, 'download', db, subdir, path.basename(existing.val));
          removeDir(oldPath);
        }
      }

      // Apply resolveBuiltIn then formatVal before storage
      // PHP line 7923: skip BuiltIn() resolution for system type IDs (101=activity_type, 102=role_link, 103=level, 132=xsrf_token, 49=mask)
      const BUILTIN_SKIP_IDS = [101, 102, 103, 132, 49];
      if (!BUILTIN_SKIP_IDS.includes(typeIdNum)) {
        finalValue = resolveBuiltIn(finalValue, req.legacyUser || {}, db, tzone, clientIp, req.headers || {});
      }
      if (meta) {
        finalValue = String(formatVal(meta.base_type, finalValue, tzone));
      }

      // Mask-level write restriction: reject values barred by role mask
      // Port of PHP Val_barred_by_mask() called before writing (index.php:896-919)
      if (await valBarredByMask(pool, db, grants || {}, typeIdNum, finalValue)) {
        continue; // Skip barred attribute silently
      }

      // Reference storage fix: if type is a reference (NOT in REV_BASE_TYPE), store in t column
      if (meta && !REV_BASE_TYPE[meta.base_type]) {
        const refVal = parseInt(finalValue, 10);
        // Validate reference if value is a positive integer
        if (refVal > 0) {
          await checkNewRef(pool, db, typeIdNum, refVal);
        }
        const existing = await getRequisiteByType(db, objectId, typeIdNum);
        if (existing) {
          // Reference: update t column, not val
          await execSql(pool, `UPDATE \`${db}\` SET t = ? WHERE id = ?`, [refVal, existing.id], { label: 'query_update' });
          lastReqId = String(existing.id);
        } else {
          const attrOrder = await calcOrder(pool, db, objectId, typeIdNum);
          const newId = await insertRow(db, objectId, attrOrder, refVal, '');
          lastReqId = String(newId);
        }
        continue;
      }

      // Multiselect: if type has :MULTI: in attrs, split comma values and insert multiple rows
      if (meta) {
        const { rows: attrAttrs } = await execSql(pool, `SELECT val FROM \`${db}\` WHERE up = ? AND t = ${TYPE.CHARS} LIMIT 1`, [typeIdNum], { label: 'query_select' });
        const attrs = attrAttrs.length > 0 ? String(attrAttrs[0].val) : '';
        if (attrs.includes(':MULTI:') && finalValue.includes(',')) {
          const values = finalValue.split(',').map(v => v.trim()).filter(v => v);
          for (const mv of values) {
            const attrOrder = await calcOrder(pool, db, objectId, typeIdNum);
            await insertRow(db, objectId, attrOrder, typeIdNum, mv);
          }
          await checkDuplicatedReqs(pool, db, objectId, typeIdNum);
          lastReqId = '';
          continue;
        }
      }

      const existing = await getRequisiteByType(db, objectId, typeIdNum);
      if (existing) {
        await updateRowValue(db, existing.id, finalValue);
        lastReqId = String(existing.id);
      } else {
        const attrOrder = await calcOrder(pool, db, objectId, typeIdNum);
        const newId = await insertRow(db, objectId, attrOrder, typeIdNum, finalValue);
        lastReqId = String(newId);
      }

      // Check for duplicates after each attribute update
      await checkDuplicatedReqs(pool, db, objectId, typeIdNum);
    }

    logger.info('[Legacy _m_set] Attributes set', { db, id: objectId });

    // PHP _m_set die() format: {"id":"<reqId>", "obj":<objectId>, "next_act":"nul", "args":"<filePath>", "warnings":""}
    // PHP: $id = "" if no req written, or string(lastReqId); $obj = objectId (integer, from intval URL param)
    // PHP uses next_act (not "a"), includes warnings:"", and obj is the integer object id
    return res.json({
      id: lastReqId,
      obj: objectId,
      next_act: 'nul',
      args: uploadedFilePath || '',
      warnings: '',
    });
  } catch (error) {
    logger.error('[Legacy _m_set] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _m_move - Move object to new parent
 * POST /:db/_m_move/:id
 * Parameters: up (new parent ID)
 */
router.post('/:db/_m_move/:id', legacyAuthMiddleware, legacyXsrfCheck, async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const objectId = parseInt(id, 10);
    const newParentId = parseInt(req.body.up, 10);

    const pool = getPool();
    const { grants, username } = req.legacyUser || {};

    // Grant check on source object and target parent
    if (!await checkGrant(pool, db, grants || {}, objectId, 0, 'WRITE', username || '')) {
      return res.status(200).json([{ error: 'Insufficient privileges' }]);
    }
    if (!await checkGrant(pool, db, grants || {}, newParentId, 0, 'WRITE', username || '')) {
      return res.status(200).json([{ error: 'Insufficient privileges for target parent' }]);
    }

    // Fetch full object info (t, up, ord) before moving
    const { rows: objInfo } = await execSql(pool, `SELECT t, up, ord FROM \`${db}\` WHERE id = ? LIMIT 1`, [objectId], { label: 'post_db_m_move_id_select' });
    if (objInfo.length === 0) {
      return res.status(200).json([{ error: 'Object not found' }]);
    }
    const objType = objInfo[0].t;
    const oldParentId = objInfo[0].up;
    const oldOrd = objInfo[0].ord;

    // Metadata protection: can't move root-level types
    if (oldParentId === 0) {
      return res.status(200).json([{ error: 'Cannot move metadata object' }]);
    }

    // Type mismatch guard: old parent and new parent must be of the same type
    const { rows: parentRows } = await execSql(pool, `SELECT old_p.t AS ut, new_p.t AS tt
       FROM \`${db}\` old_p, \`${db}\` new_p
       WHERE old_p.id = ? AND new_p.id = ?`, [oldParentId, newParentId], { label: 'post_db_m_move_id_select' });
    if (parentRows.length === 0) {
      return res.status(200).json([{ error: 'Parent not found' }]);
    }
    if (parentRows[0].ut !== parentRows[0].tt) {
      return res.status(200).json([{ error: `Types mismatch ${objType}!=${parentRows[0].tt}` }]);
    }

    // Same-parent no-op: skip if already under the target parent
    if (oldParentId === newParentId) {
      legacyRespond(req, res, db, {
        id: objectId,
        obj: null,
        next_act: 'object',
        args: newParentId !== 1 ? `moved&&F_U=${newParentId}` : 'moved&',
      });
      return;
    }

    // Order adjustment in old parent: shift down peers after removed object
    await execSql(pool, `UPDATE \`${db}\` SET ord = ord - 1 WHERE up = ? AND t = ? AND ord > ?`, [oldParentId, objType, oldOrd], { label: 'post_db_m_move_id_update' });

    const newOrder = await calcOrder(pool, db, newParentId, objType);
    await execSql(pool, `UPDATE \`${db}\` SET up = ?, ord = ? WHERE id = ?`, [newParentId, newOrder, objectId], { label: 'post_db_m_move_id_update' });

    logger.info('[Legacy _m_move] Object moved', { db, id: objectId, newParentId });

    // PHP api_dump(): {id:objectId, obj:null, next_act:"object", args, warnings}
    // PHP: $id not reassigned (stays objectId), $obj = null
    // PHP args: "moved&" prefix always; if newParent != 1 append "&F_U=$newParent"
    legacyRespond(req, res, db, {
      id: objectId,
      obj: null,
      next_act: 'object',
      args: newParentId !== 1 ? `moved&&F_U=${newParentId}` : 'moved&',
    });
  } catch (error) {
    logger.error('[Legacy _m_move] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

// ============================================================================
// Query Action Routes (Phase 1 MVP - Real Implementation)
// ============================================================================

/**
 * _dict - Get type dictionary (list of types with their definitions)
 * GET/POST /:db/_dict/:typeId?
 */
router.all('/:db/_dict/:typeId?', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    let query;
    let params = [];

    if (typeId) {
      // Get specific type with its requisites
      const type = parseInt(typeId, 10);
      query = `
        SELECT t.id, t.val AS name, t.t AS base_type, t.ord,
               r.id AS req_id, r.val AS req_name, r.t AS req_type, r.ord AS req_ord
        FROM ${db} t
        LEFT JOIN ${db} r ON r.up = t.id
        WHERE t.id = ?
        ORDER BY r.ord
      `;
      params = [type];
    } else {
      // Get all types (root-level objects with up=0)
      query = `SELECT id, val AS name, t AS base_type, ord FROM ${db} WHERE up = 0 ORDER BY val`;
    }

    const { rows: rows } = await execSql(pool, query, params, { label: 'query_query' });

    if (typeId && rows.length > 0) {
      // Format as type with requisites
      const type = {
        id: rows[0].id,
        name: rows[0].name,
        baseType: rows[0].base_type,
        order: rows[0].ord,
        requisites: rows
          .filter(r => r.req_id)
          .map(r => ({
            id: r.req_id,
            name: r.req_name,
            type: r.req_type,
            order: r.req_ord,
          })),
      };
      return res.json(type);
    }

    // Return list of types
    const types = rows.map(row => ({
      id: row.id,
      name: row.name,
      baseType: row.base_type,
      order: row.ord,
    }));

    res.json(types);
  } catch (error) {
    logger.error('[Legacy _dict] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _list - Get list of objects
 * GET/POST /:db/_list/:typeId
 * Parameters: up (parent), LIMIT, F (offset/from), q (search)
 */
router.all('/:db/_list/:typeId', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    const type = parseInt(typeId, 10);
    const parentId = req.query.up !== undefined || req.body.up !== undefined
      ? parseInt(req.query.up || req.body.up, 10)
      : null;
    const limit = parseInt(req.query.LIMIT || req.query.limit || req.body.LIMIT || req.body.limit || '50', 10);
    const offset = parseInt(req.query.F || req.query.offset || req.body.F || req.body.offset || '0', 10);
    const search = req.query.q || req.body.q || '';

    // Sort: sort=0 → by val, sort=<reqId> → by requisite value
    const sortCol = req.query.sort || req.body.sort || '';
    const sortDir = (req.query.dir || req.body.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const sortReqId = sortCol && sortCol !== '0' ? parseInt(sortCol, 10) : 0;

    // Filters: f_0=text → by name; f_<reqId>=text → by requisite value
    const colFilters = {}; // reqId → filterText
    const allParams = { ...req.query, ...req.body };
    for (const [k, v] of Object.entries(allParams)) {
      if (k.startsWith('f_') && v) {
        const colId = parseInt(k.slice(2), 10);
        if (!isNaN(colId)) colFilters[colId] = v;
      }
    }

    // Build query with optional JOINs for sort/filter by requisite
    const joinParts = [];
    const joinParams = [];
    let joinIdx = 0;

    // Sort JOIN (if sorting by a requisite)
    let orderExpr = sortCol === '0' ? `a.val ${sortDir}` : `a.ord`;
    if (sortReqId) {
      const alias = `sort_j`;
      joinParts.push(`LEFT JOIN \`${db}\` ${alias} ON ${alias}.up = a.id AND ${alias}.t = ?`);
      joinParams.push(sortReqId);
      orderExpr = `${alias}.val ${sortDir}`;
    }

    // Filter JOINs (for requisite column filters)
    const filterJoins = [];
    const filterWhere = [];
    const filterParams = [];

    for (const [colId, filterText] of Object.entries(colFilters)) {
      const colIdNum = parseInt(colId, 10);
      if (colIdNum === 0) continue; // handled in WHERE below
      const alias = `fj${++joinIdx}`;
      joinParts.push(`LEFT JOIN \`${db}\` ${alias} ON ${alias}.up = a.id AND ${alias}.t = ?`);
      joinParams.push(colIdNum);
      filterWhere.push(`${alias}.val LIKE ?`);
      filterParams.push(`%${filterText}%`);
    }

    const selectCols = `a.id, a.val, a.up, a.t, a.ord`;
    const fromClause = `FROM \`${db}\` a`;
    const joinClause = joinParts.join(' ');

    const whereParts = ['a.t = ?'];
    const whereParams = [type];

    if (parentId !== null) {
      whereParts.push('a.up = ?');
      whereParams.push(parentId);
    }
    if (search) {
      // PHP also searches across requisite values with OR — match across val AND any child req val
      whereParts.push(
        '(a.val LIKE ? OR EXISTS (SELECT 1 FROM `' + db + '` req WHERE req.up = a.id AND req.val LIKE ?))'
      );
      whereParams.push(`%${search}%`, `%${search}%`);
    }
    if (colFilters[0]) {
      whereParts.push('a.val LIKE ?');
      whereParams.push(`%${colFilters[0]}%`);
    }
    for (const fw of filterWhere) {
      whereParts.push(fw);
    }

    const whereClause = `WHERE ${whereParts.join(' AND ')}`;
    const allQueryParams = [...joinParams, ...whereParams, ...filterParams];

    const query = `SELECT ${selectCols} ${fromClause} ${joinClause} ${whereClause} ORDER BY ${orderExpr} LIMIT ? OFFSET ?`;
    const countQuery = `SELECT COUNT(*) as total ${fromClause} ${joinClause} ${whereClause}`;
    const params = [...allQueryParams, limit, offset];
    const countParams = [...allQueryParams];

    const { rows: rows } = await execSql(pool, query, params, { label: 'sortDir_query' });
    const { rows: countRows } = await execSql(pool, countQuery, countParams, { label: 'sortDir_query' });
    const total = countRows[0]?.total || 0;

    // Batch-load requisite values for all returned objects so the client can
    // display column values without a second round-trip.
    // reqs: { [typeId]: val } keyed by requisite type id.
    const reqMap = {};
    if (rows.length > 0) {
      const objIds = rows.map(r => r.id);
      const ph = objIds.map(() => '?').join(',');
      const { rows: reqVals } = await execSql(pool, `SELECT up, t, val FROM \`${db}\` WHERE up IN (${ph}) ORDER BY up, ord`, objIds, { label: 'sortDir_select' });
      for (const rv of reqVals) {
        if (!reqMap[rv.up]) reqMap[rv.up] = {};
        reqMap[rv.up][rv.t] = rv.val;
      }
    }

    const objects = rows.map(row => ({
      id: row.id,
      val: row.val,
      up: row.up,
      t: row.t,
      ord: row.ord,
      reqs: reqMap[row.id] || {},
    }));

    // Return in PHP-compatible format
    res.json({
      data: objects,
      total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('[Legacy _list] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _list_join - List objects with multi-join queries
 * GET/POST /:db/_list_join/:typeId
 * Parameters: up (parent), LIMIT, F (offset/from), q (search), join (comma-separated requisite IDs to join)
 *
 * This endpoint supports complex multi-join queries that fetch object data
 * along with requisite values in a single query.
 */
router.all('/:db/_list_join/:typeId', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    const type = parseInt(typeId, 10);
    const parentId = req.query.up !== undefined || req.body.up !== undefined
      ? parseInt(req.query.up || req.body.up, 10)
      : null;
    const limit = parseInt(req.query.LIMIT || req.body.LIMIT || '50', 10);
    const offset = parseInt(req.query.F || req.body.F || '0', 10);
    const search = req.query.q || req.body.q || '';
    const joinReqs = (req.query.join || req.body.join || '').split(',').filter(Boolean).map(id => parseInt(id, 10));

    // Get type requisites for join
    const { rows: reqRows } = await execSql(pool, `SELECT id, val, t FROM ${db} WHERE up = ? ORDER BY ord`, [type], { label: 'joinReqs_select' });

    // Parse requisite info
    const requisites = reqRows.map(r => {
      const aliasMatch = r.val.match(/:ALIAS=([^:]+):/);
      return {
        id: r.id,
        name: removeMasks(r.val).trim(),
        alias: aliasMatch ? aliasMatch[1] : `req_${r.id}`,
        type: r.t
      };
    });

    // Determine which requisites to join
    const reqsToJoin = joinReqs.length > 0
      ? requisites.filter(r => joinReqs.includes(r.id))
      : requisites.slice(0, 5); // Default: first 5 requisites

    // Build multi-join query
    let selectParts = ['obj.id', 'obj.val', 'obj.up', 'obj.t', 'obj.ord'];
    let joinParts = [];
    let joinIdx = 0;

    for (const req of reqsToJoin) {
      const alias = `r${joinIdx++}`;
      selectParts.push(`${alias}.val AS ${req.alias}`);
      joinParts.push(`LEFT JOIN ${db} ${alias} ON ${alias}.up = obj.id AND ${alias}.t = ${req.id}`);
    }

    let query = `SELECT ${selectParts.join(', ')} FROM ${db} obj ${joinParts.join(' ')} WHERE obj.t = ?`;
    let countQuery = `SELECT COUNT(*) as total FROM ${db} WHERE t = ?`;
    const params = [type];
    const countParams = [type];

    if (parentId !== null) {
      query += ` AND obj.up = ?`;
      countQuery += ` AND up = ?`;
      params.push(parentId);
      countParams.push(parentId);
    }

    if (search) {
      query += ` AND obj.val LIKE ?`;
      countQuery += ` AND val LIKE ?`;
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }

    query += ` ORDER BY obj.ord LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const { rows: rows } = await execSql(pool, query, params, { label: 'joinReqs_query' });
    const { rows: countRows } = await execSql(pool, countQuery, countParams, { label: 'joinReqs_query' });
    const total = countRows[0]?.total || 0;

    // PHP-compatible format: data as array of arrays [id, val, req1_val, req2_val, ...]
    const dataArrays = rows.map(row => {
      const arr = [row.id, row.val];
      for (const req of reqsToJoin) {
        arr.push(row[req.alias] !== undefined ? row[req.alias] : null);
      }
      return arr;
    });

    logger.info('[Legacy _list_join] Multi-join query', { db, type, joinedReqs: reqsToJoin.length, rows: dataArrays.length });

    res.json({
      data: dataArrays,
      total,
      limit,
      offset,
      requisites: reqsToJoin.map(r => ({ id: r.id, val: r.name }))
    });
  } catch (error) {
    logger.error('[Legacy _list_join] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_main - Get type metadata with requisites
 * GET/POST /:db/_d_main/:typeId
 */
router.all('/:db/_d_main/:typeId', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    const type = parseInt(typeId, 10);

    // Get type info
    const { rows: typeRows } = await execSql(pool, `SELECT id, val AS name, t AS base_type, ord FROM ${db} WHERE id = ?`, [type], { label: 'joinReqs_select' });

    if (typeRows.length === 0) {
      return res.status(404).json([{ error: 'Type not found' }]);
    }

    // Get requisites (children of the type)
    const { rows: reqRows } = await execSql(pool, `SELECT id, val AS name, t AS type, ord FROM ${db} WHERE up = ? ORDER BY ord`, [type], { label: 'joinReqs_select' });

    // Parse requisite modifiers from value
    const requisites = reqRows.map(row => {
      let name = row.name || '';
      let alias = null;
      let required = false;
      let multi = false;

      // Extract :ALIAS=xxx:
      const aliasMatch = name.match(/:ALIAS=(.*?):/);
      if (aliasMatch) {
        alias = aliasMatch[1];
        name = name.replace(aliasMatch[0], '');
      }

      // Extract :!NULL:
      if (name.includes(':!NULL:')) {
        required = true;
        name = name.replace(':!NULL:', '');
      }

      // Extract :MULTI:
      if (name.includes(':MULTI:')) {
        multi = true;
        name = name.replace(':MULTI:', '');
      }

      // Detect reference fields: if type is not a known base type code,
      // it's a reference to another user-defined type.
      const isRef = !REV_BASE_TYPE[row.type];
      const refType = isRef ? row.type : null;

      return {
        id: row.id,
        name: name.trim(),
        alias,
        type: row.type,
        refType,           // non-null when this requisite references another type
        order: row.ord,
        required,
        multi,
      };
    });

    const result = {
      id: typeRows[0].id,
      name: typeRows[0].name,
      baseType: typeRows[0].base_type,
      order: typeRows[0].ord,
      requisites,
    };

    res.json(result);
  } catch (error) {
    logger.error('[Legacy _d_main] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * terms - List all terms/types
 * GET /:db/terms
 *
 * PHP: index.php lines 8919–8942
 * PHP filters types through Grant_1level($id) — shows only those the user has access to.
 * Node.js now replicates this behavior using the grant1Level function.
 */
router.get('/:db/terms', legacyAuthMiddleware, async (req, res) => {
  const { db } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();

    // Get user grants from token cookie if available
    const token = req.cookies[db] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    let grants = {};
    let username = '';

    if (token) {
      try {
        // Validate token and get user role
        const { rows: userRows } = await execSql(pool, `
          SELECT u.id, u.val AS username, role_def.id AS role_id
          FROM ${db} tok
          JOIN ${db} u ON tok.up = u.id
          LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
          WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
          LIMIT 1
        `, [token], { label: 'get_db_terms_select' });

        if (userRows.length > 0) {
          username = userRows[0].username;
          grants = await getGrants(pool, db, userRows[0].role_id, {
            username: userRows[0].username, roleId: userRows[0].role_id,
          });
        }
      } catch (e) {
        logger.warn('[Legacy terms] Failed to load grants', { error: e.message });
      }
    }

    // Match PHP terms query: all top-level objects where id!=t, val!='', t!=0
    // Left join to get the type of each requisite (child record) per PHP logic
    const { rows: rows } = await execSql(pool, `SELECT a.id, a.val, a.t, a.ord, reqs.t AS reqs_t
       FROM \`${db}\` a
       LEFT JOIN \`${db}\` reqs ON reqs.up = a.id
       WHERE a.up = 0 AND a.id != a.t AND a.val != '' AND a.t != 0
       ORDER BY a.val`, [], { label: 'get_db_terms_select' });

    // Replicate PHP terms filtering logic:
    // - Skip CALCULATABLE (t=15) and BUTTON (t=7) base types
    // - Track which type IDs are used as requisite types ($req)
    // - Only show types not used as requisites elsewhere
    // Use Map to preserve insertion order (SQL ORDER BY a.val → alphabetical like PHP)
    // Plain objects in JS sort numeric keys ascending, breaking PHP ordering.
    const base   = new Map(); // id -> t
    const typ    = new Map(); // id -> val (insertion-ordered, like PHP array)
    const reqMap = new Set(); // ids used as requisites

    for (const row of rows) {
      const revBt = REV_BASE_TYPE[row.t] || null;
      if (revBt === 'CALCULATABLE' || revBt === 'BUTTON') continue;

      base.set(row.id, row.t);
      if (!reqMap.has(row.id)) {
        typ.set(row.id, row.val);
      }
      if (row.reqs_t) {
        typ.delete(row.reqs_t);
        reqMap.add(row.reqs_t);
      }
    }

    // Build response array matching PHP: [{id, type, name}]
    // PHP line 8939: {"id":$id,"type":$base[$id],"name":htmlspecialchars($val)}
    // PHP: if(Grant_1level($id)) $json .= ...
    const types = [];
    for (const [id, val] of typ) {
      // Apply Grant_1level filtering (PHP line 8938)
      const grantLevel = await grant1Level(pool, db, grants, id, username);
      if (grantLevel) {
        types.push({
          id,
          type: base.get(id),
          name: htmlEsc(val),
        });
      }
    }

    res.json(types);
  } catch (error) {
    logger.error('[Legacy terms] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * xsrf - Get XSRF token and session info
 * GET /:db/xsrf
 *
 * PHP: runs after Validate_Token(), returns full session state:
 *   {"_xsrf":"...","token":"...","user":"...","role":"...","id":...,"msg":""}
 * Requires valid token cookie — used by the SPA on page load to verify session.
 */
router.get('/:db/xsrf', async (req, res) => {
  const { db } = req.params;
  const token = extractToken(req, db);

  if (!token || !isValidDbName(db)) {
    // No token — return minimal info (client will redirect to login)
    return res.status(200).json({ _xsrf: '', token: null, user: '', role: '', id: 0, msg: '' });
  }

  try {
    const pool = getPool();
    // PHP uses CROSS JOIN to resolve role definition name via role link:
    // LEFT JOIN ($z r CROSS JOIN $z role_def) ON r.up=u.id AND role_def.id=r.t AND role_def.t=ROLE
    // role_def.val = role name (lowercased by PHP strtolower)
    const { rows: rows } = await execSql(pool, `SELECT u.id uid, u.val uname, xsrf.val xsrf_val, role_def.val role_val
       FROM ${db} u
       JOIN ${db} tok ON tok.up=u.id AND tok.t=${TYPE.TOKEN} AND tok.val=?
       LEFT JOIN ${db} xsrf ON xsrf.up=u.id AND xsrf.t=${TYPE.XSRF}
       LEFT JOIN (${db} r CROSS JOIN ${db} role_def)
         ON r.up=u.id AND role_def.id=r.t AND role_def.t=${TYPE.ROLE}
       WHERE u.t=${TYPE.USER}
       LIMIT 1`, [token], { label: 'get_db_xsrf_select' });

    if (rows.length === 0) {
      // Invalid token — clear cookie, return empty session
      res.clearCookie(db, { path: '/' });
      return res.status(200).json({ _xsrf: '', token: null, user: '', role: '', id: '0', msg: '' });
    }

    const user = rows[0];
    // PHP reads $GLOBALS["GLOBAL_VARS"]["xsrf"] which is the DB-stored value.
    // Use the stored xsrf_val as authoritative; fall back to recomputed if not set.
    const xsrf = user.xsrf_val || generateXsrf(token, db, db);

    return res.status(200).json({
      _xsrf: xsrf,
      token,
      user: user.uname,
      // PHP: strtolower($row["role"]) where role = role_def.val
      role: (user.role_val || '').toLowerCase(),
      // PHP: "id":"123" (string from mysqli_fetch_array)
      id: String(user.uid),
      msg: '',
    });
  } catch (error) {
    logger.error({ error: error.message, db }, '[Legacy xsrf] Error');
    return res.status(200).json({ _xsrf: '', token: null, user: '', role: '', id: 0, msg: '' });
  }
});

/**
 * _ref_reqs - Get reference requisites for dropdown lists
 * GET /:db/_ref_reqs/:refId
 *
 * PHP: index.php lines 8944–9086
 * Returns: {"<id>": "<main_val> / <req1_val> / <req2_val>", ...}
 * Missing values shown as " / --"
 *
 * Supports:
 *   ?q=<search> - Filter by value (LIKE %search%)
 *   ?q=@<id> - Search by ID
 *   ?r=<id> - Restrict to specific ID
 *   ?r=<id1>,<id2> - Restrict to multiple IDs
 */
router.get('/:db/_ref_reqs/:refId', legacyAuthMiddleware, async (req, res) => {
  const { db, refId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    const id = parseInt(refId, 10);
    const searchQuery = req.query.q || '';
    // Guard search input against SQL injection (Issue #308)
    if (searchQuery) checkInjection(searchQuery);
    const restrictParam = req.query.r || '';
    const limitParam = Math.min(parseInt(req.query.LIMIT || req.query.limit || '80', 10) || 80, 500);
    const z = sanitizeIdentifier(db);

    // Get the reference type info and its requisites (children)
    // PHP: dic = row["dic"] from the reference definition
    const { rows: refRows } = await execSql(pool, `SELECT r.t AS dic, r.val AS attr, def_reqs.t, req_orig.t AS base,
              CASE WHEN base.id != base.t THEN 1 ELSE 0 END AS is_ref, req.id AS req_id
       FROM ${z} r
       JOIN ${z} dic ON dic.id = r.t
       JOIN ${z} par ON par.id = r.up AND par.up = 0
       LEFT JOIN ${z} def_reqs ON def_reqs.up = r.t
       LEFT JOIN ${db} req_orig ON req_orig.id = def_reqs.t
       LEFT JOIN ${db} base ON base.id = req_orig.t
       LEFT JOIN ${db} req ON req.up = dic.t AND req.t = def_reqs.t
       WHERE r.id = ?
       ORDER BY def_reqs.ord`, [id], { label: 'get_db_ref_reqs_refId_select' });

    if (refRows.length === 0) {
      // Fallback to simple query if the complex query returns nothing
      const { rows: simpleRows } = await execSql(pool, `SELECT t, val FROM ${db} WHERE id = ?`, [id], { label: 'get_db_ref_reqs_refId_select' });
      if (simpleRows.length === 0) {
        return res.status(404).json([{ error: 'Reference not found' }]);
      }

      const refTypeId = simpleRows[0].t;
      let query = `SELECT id, val FROM ${db} WHERE t = ?`;
      const params = [refTypeId];

      // Handle restrict parameter
      if (restrictParam) {
        const restrictIds = restrictParam.split(',').filter(v => /^\d+$/.test(v)).map(v => parseInt(v, 10));
        if (restrictIds.length > 0) {
          query += ` AND id IN (${restrictIds.join(',')})`;
        }
      }

      if (searchQuery) {
        // Use constructWhere to parse search DSL (@id, %like%, IN(), etc.)
        const searchFilter = searchQuery.startsWith('@')
          ? { F: searchQuery }
          : { F: `%${searchQuery}%` };
        const cwCtx = { revBT: {}, refTyps: {}, multi: new Set(), db };
        const cw = constructWhere(String(refTypeId), searchFilter, String(refTypeId), false, cwCtx);
        if (cw.where) {
          // Replace vals.val/vals.id with val/id (simple query uses no alias)
          query += cw.where.replace(/\bvals\./g, '').replace(/\ba\d+\./g, '');
          params.push(...cw.params);
        }
      }

      query += ` ORDER BY val LIMIT ${limitParam}`;
      const { rows: rows } = await execSql(pool, query, params, { label: 'get_db_ref_reqs_refId_query' });
      const result = {};
      for (const row of rows) {
        result[row.id] = row.val || '--';
      }
      return res.json(result);
    }

    // Check for dynamic formula (attrs block) in reference type val
    // PHP: removeMasks(r.val) strips :!NULL:, :MULTI:, :ALIAS=...: — if what remains
    // starts with '&' it's a PHP block reference (e.g. "&my_dropdown_block").
    // PHP evaluates it via Get_block_data(). For regular field names ("Field1", "::Name")
    // PHP tries Get_block_data but finds no block and falls through to the normal query.
    // Node.js: only treat as formula when it genuinely starts with '&'.
    const rawAttr = refRows[0].attr || '';
    const attrsFormula = removeMasks(rawAttr).trim();

    if (attrsFormula.startsWith('&')) {
      // Dynamic formula: the attr value is a report block reference (e.g. "&my_dropdown_report").
      // PHP: Get_block_data($attrs) — default case resolves block name to a report,
      //      calls Compile_Report + Execute, then reads ids/vals/alts columns from $blocks.
      // PHP also sets REQREF["1"] (ID filter) or REQREF["2"] (value LIKE filter) from ?q=.
      //
      // Node.js: look up the report by name, compile, build filters from ?q=, execute,
      // and map the first two visible columns to {id: display_value}.
      const blockName = attrsFormula; // e.g. "&my_report"
      logger.info('[Legacy _ref_reqs] Evaluating dynamic formula via report', {
        db, id, formula: blockName
      });

      try {
        // Resolve the report: lookup by block name (strip leading '&')
        const reportName = blockName.startsWith('&') ? blockName.slice(1) : blockName;
        const { rows: repRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE val = ? AND t = ${TYPE.REPORT} LIMIT 1`, [reportName], { label: 'query_select' });

        // Also try the full block name (with '&') if bare name not found
        let reportId = repRows.length > 0 ? repRows[0].id : null;
        if (!reportId) {
          const { rows: repRows2 } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE val = ? AND t = ${TYPE.REPORT} LIMIT 1`, [blockName], { label: 'query_select' });
          reportId = repRows2.length > 0 ? repRows2[0].id : null;
        }
        // Also try numeric block name (direct report ID)
        if (!reportId && /^\d+$/.test(reportName)) {
          const numId = parseInt(reportName, 10);
          const { rows: repRows3 } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE id = ? AND t = ${TYPE.REPORT} LIMIT 1`, [numId], { label: 'query_select' });
          reportId = repRows3.length > 0 ? numId : null;
        }

        if (reportId) {
          const report = await compileReport(pool, db, reportId);
          if (report) {
            // Build filters from ?q= parameter — PHP REQREF logic:
            //   REQREF["1"] = @<id>  → filter on first visible column by ID
            //   REQREF["2"] = %<search>% → filter on second visible column by LIKE
            const filters = {};
            if (searchQuery) {
              // Find first two visible (non-hidden) columns
              const visibleCols = report.columns.filter(c => !c.hidden);
              if (searchQuery.startsWith('@')) {
                // ID-based search: apply to first visible column
                if (visibleCols.length > 0) {
                  filters[visibleCols[0].alias] = { from: searchQuery };
                }
              } else {
                // Value search: apply LIKE to second visible column (or first if only one)
                const searchVal = searchQuery.includes('%') ? searchQuery : `%${searchQuery}%`;
                const targetCol = visibleCols.length > 1 ? visibleCols[1] : visibleCols[0];
                if (targetCol) {
                  filters[targetCol.alias] = { like: searchQuery.includes('%') ? undefined : searchQuery };
                  if (searchQuery.includes('%')) {
                    filters[targetCol.alias] = { from: searchQuery };
                  }
                }
              }
            }

            const results = await executeReport(pool, db, report, filters, limitParam, 0);

            // Map results to dropdown: PHP reads $blocks[$attrs] which has id[], val[], alt[] arrays.
            // The first column is IDs, second is display values, third is alt values.
            // In Node.js report results, each row has { id, val, <alias1>, <alias2>, ... }.
            // The row.id is the main object ID (first column), and subsequent columns provide display values.
            const formulaResult = {};
            const resultVisibleCols = report.columns.filter(c => !c.hidden);

            for (const row of results.data) {
              // PHP: ids = first column, vals = second column, alts = third column
              // The row.id from report execution is the main object ID
              const rowId = row.id;
              if (rowId === undefined || rowId === null) continue;
              if (!(/^\d+$/.test(String(rowId)))) continue; // PHP: die if non-numeric id

              // Display value: prefer second visible column (val), fall back to third (alt), then main_val
              let displayVal = '';
              if (resultVisibleCols.length > 0) {
                displayVal = row[resultVisibleCols[0].alias] || '';
              }
              // If first visible column gave nothing, try main_val
              if (!displayVal) {
                displayVal = row.val || row.main_val || '';
              }

              if (!formulaResult[rowId]) {
                formulaResult[rowId] = displayVal || '--';
              }
            }

            logger.info('[Legacy _ref_reqs] Formula evaluation returned results', {
              db, id, reportId, count: Object.keys(formulaResult).length
            });
            return res.json(formulaResult);
          }
        }

        // Report not found — fall back to simple dictionary query
        logger.warn('[Legacy _ref_reqs] Report not found for formula, using simple fallback', {
          db, id, formula: blockName, reportName
        });
      } catch (formulaError) {
        logger.warn('[Legacy _ref_reqs] Formula evaluation failed, using simple fallback', {
          db, id, formula: blockName, error: formulaError.message
        });
      }

      // Fallback: return all objects of dic type (when report not found or errors)
      const searchQ = searchQuery.startsWith('@')
        ? null : (searchQuery ? `%${searchQuery.replace(/'/g, "''")}%` : null);
      const searchId = searchQuery.startsWith('@') ? parseInt(searchQuery.slice(1), 10) : null;
      const fbWhere = ['vals.t = ?', 'pars.id = vals.up', 'pars.up != 0'];
      const fbParams = [refRows[0].dic];
      if (searchId && !isNaN(searchId)) { fbWhere.push('vals.id = ?'); fbParams.push(searchId); }
      else if (searchQ)                  { fbWhere.push('vals.val LIKE ?'); fbParams.push(searchQ); }
      if (restrictParam) {
        const rids = restrictParam.split(',').filter(v => /^\d+$/.test(v)).map(Number);
        if (rids.length === 1)       { fbWhere.push('vals.id = ?');         fbParams.push(rids[0]); }
        else if (rids.length > 1)    { fbWhere.push(`vals.id IN (${rids.join(',')})`); }
      }
      const { rows: fbRows } = await execSql(pool, `SELECT vals.id, vals.val FROM \`${db}\` vals JOIN \`${db}\` pars ON pars.id = vals.up WHERE ${fbWhere.join(' AND ')} ORDER BY vals.val LIMIT ${limitParam}`, fbParams, { label: 'query_select' });
      const fbResult = {};
      for (const r of fbRows) fbResult[r.id] = r.val || '--';
      return res.json(fbResult);
    }

    // Extract dictionary type and requisites info
    const dic = refRows[0].dic;
    const refReqs = [];
    const reqIds = [];

    for (const row of refRows) {
      if (row.req_id && !reqIds.includes(row.req_id)) {
        reqIds.push(row.req_id);
        refReqs.push({
          reqId: row.req_id,
          base: row.base,
          isRef: row.is_ref === 1
        });
      }
    }

    // Build the query with joins for requisite values.
    // PHP structure (lines 9073-9076):
    //   SELECT vals.id, vals.val ref_val, <reqs>
    //   FROM (SELECT vals.id, vals.val, <sub_reqs> FROM z vals <joins>, z pars
    //         WHERE pars.id=vals.up AND pars.up!=0 AND vals.t=$dic <search> <restrict>
    //         LIMIT 80) vals
    //   ORDER BY vals.val
    // Key: LIMIT is inside the subquery (limits before sorting), ORDER BY is outside.
    let innerSelectCols = 'vals.id, vals.val';
    let outerSelectCols = 'vals.id, vals.val AS ref_val';
    let joinClauses = '';

    for (const rq of refReqs) {
      const reqAlias = `a${rq.reqId}`;
      innerSelectCols += `, ${reqAlias}.val AS ${reqAlias}val`;
      outerSelectCols += `, ${reqAlias}val`;

      if (rq.isRef) {
        // Reference type - join through intermediate table (PHP: LEFT JOIN (z r{req} CROSS JOIN z a{req}) ON ...)
        // PHP parity (index.php:535-558): apply USE INDEX (PRIMARY) hint when no selective filter
        const refHint = hintNeeded(searchQuery) ? ' USE INDEX (PRIMARY)' : '';
        joinClauses += ` LEFT JOIN (\`${db}\` r${rq.reqId} CROSS JOIN \`${db}\` ${reqAlias}${refHint}) ON r${rq.reqId}.up = vals.id AND ${reqAlias}.id = r${rq.reqId}.t AND ${reqAlias}.t = ${rq.base}`;
      } else {
        // Direct requisite (PHP: LEFT JOIN z a{req} ON a{req}.up=vals.id AND a{req}.t={req_id})
        joinClauses += ` LEFT JOIN \`${db}\` ${reqAlias} ON ${reqAlias}.up = vals.id AND ${reqAlias}.t = ${rq.reqId}`;
      }
    }

    // Build WHERE clause for the inner subquery
    let whereClause = `vals.t = ${dic}`;

    // Handle restrict parameter (?r=<id> or ?r=<id1>,<id2>)
    // PHP: if(isset($_GET["r"])) $where .= " AND t1.t=".$_GET["r"]
    // Apply restriction to first requisite join column when requisites exist
    if (restrictParam) {
      const restrictIds = restrictParam.split(',').filter(v => /^\d+$/.test(v)).map(v => parseInt(v, 10));
      if (restrictIds.length > 0 && refReqs.length > 0) {
        // PHP applies restrict to the first requisite's type column
        const firstReqAlias = `a${refReqs[0].reqId}`;
        if (restrictIds.length === 1) {
          whereClause += ` AND ${firstReqAlias}.t = ${restrictIds[0]}`;
        } else {
          whereClause += ` AND ${firstReqAlias}.t IN (${restrictIds.join(',')})`;
        }
      } else if (restrictIds.length > 0) {
        // No requisites — fall back to filtering by vals.id
        if (restrictIds.length === 1) {
          whereClause += ` AND vals.id = ${restrictIds[0]}`;
        } else {
          whereClause += ` AND vals.id IN (${restrictIds.join(',')})`;
        }
      }
    }

    // Handle search parameter (?q=<search> or ?q=@<id>)
    let searchClause = '';
    const searchParams = [];
    if (searchQuery) {
      if (searchQuery.startsWith('@')) {
        // Use constructWhere for ID-based search DSL
        const cwCtx = { revBT: {}, refTyps: {}, multi: new Set(), db };
        const cw = constructWhere(String(dic), { F: searchQuery }, String(dic), false, cwCtx);
        if (cw.where) {
          searchClause = cw.where;
          searchParams.push(...cw.params);
        }
      } else {
        // PHP: CONCAT(vals.val, '/', COALESCE(a{req}.val,''), ...) LIKE '%search%'
        let searchConcat = 'vals.val';
        for (const rq of refReqs) {
          searchConcat = `CONCAT(${searchConcat}, '/', COALESCE(a${rq.reqId}.val, ''))`;
        }
        searchClause = ` AND ${searchConcat} LIKE ?`;
        searchParams.push(`%${searchQuery}%`);
      }
    }

    // PHP SQL: subquery with LIMIT inside (limits before sort), ORDER BY outside
    const sql = `
      SELECT ${outerSelectCols}
      FROM (
        SELECT ${innerSelectCols}
        FROM \`${db}\` vals
        ${joinClauses}
        JOIN \`${db}\` pars ON pars.id = vals.up AND pars.up != 0
        WHERE ${whereClause}${searchClause}
        LIMIT ${limitParam}
      ) vals
      ORDER BY vals.val
    `;

    logger.debug('[Legacy _ref_reqs] Query', { db, id, sql: sql.replace(/\s+/g, ' ').trim() });

    const { rows: rows } = await execSql(pool, sql, searchParams, { label: 'query_query' });

    // Build result with concatenated requisite values
    // PHP: foreach($ref_reqs as $v) $list[$row["id"]] .= isset($row[$v."val"]) ? " / ".$row[$v."val"] : " / --";
    const result = {};
    for (const row of rows) {
      let displayValue = row.ref_val || '';

      // Append requisite values with " / " separator
      for (const rq of refReqs) {
        const reqVal = row[`a${rq.reqId}val`];
        displayValue += reqVal ? ` / ${reqVal}` : ' / --';
      }

      result[row.id] = displayValue;
    }

    // Grant mask filtering: filter out requisites that the user's role masks as hidden
    const { grants } = req.legacyUser || {};
    if (grants && grants.mask) {
      // Get the parent type ID for mask lookup
      const typeId = refRows[0].dic;
      if (grants.mask[typeId]) {
        const mask = grants.mask[typeId];
        for (const objId of Object.keys(result)) {
          if (mask[objId] === 'HIDE') {
            delete result[objId];
          }
        }
      }
    }

    logger.info('[Legacy _ref_reqs] Retrieved', { db, id, count: Object.keys(result).length, hasReqs: refReqs.length > 0 });

    res.json(result);
  } catch (error) {
    logger.error('[Legacy _ref_reqs] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _connect - Check database connection (or proxy to CONNECT requisite URL if id given)
 * GET/POST /:db/_connect[/:id]
 */
router.all('/:db/_connect/:id?', legacyAuthMiddleware, async (req, res) => {
  const { db, id: idParam } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  const objectId = parseInt(idParam || '0', 10);

  try {
    const pool = getPool();

    // PHP: if $id == 0 → error; else fetch CONNECT requisite URL and proxy
    if (objectId) {
      const { rows: [row] } = await execSql(pool, `SELECT val FROM \`${db}\` WHERE up = ? AND t = ${TYPE.CONNECT} LIMIT 1`, [objectId], { label: 'query_select' });
      if (!row || !row.val) {
        return res.status(200).send('');
      }
      // Build proxy URL: append all GET params (PHP: foreach($_GET as $k=>$v) $url .= "&$k=$v")
      const connectorUrl = row.val;
      const extraParams = new URLSearchParams(req.query).toString();
      const sep = connectorUrl.includes('?') ? '&' : '?';
      const proxyUrl = connectorUrl + (extraParams ? sep + extraParams : '');

      // Use native fetch (Node.js 18+) or fall back to debug response
      const fetchFn = typeof fetch !== 'undefined' ? fetch : null;
      if (!fetchFn) {
        return res.status(200).send(JSON.stringify({ proxy: proxyUrl }));
      }

      // Build fetch options — handle POST with optional multipart file uploads
      // PHP parity: index.php line 3440 — if POST body has file refs, use build_post_fields()
      const fetchOpts = { headers: { 'User-Agent': 'Integram' } };

      // Check for POST data in request body (URL-encoded string)
      const rawPost = typeof req.body === 'string' ? req.body
        : (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0)
          ? new URLSearchParams(req.body).toString()
          : '';

      if (rawPost) {
        fetchOpts.method = 'POST';
        if (needsMultipartPost(rawPost)) {
          // File references detected — build multipart/form-data
          const userId = req.legacyUser ? req.legacyUser.uid : 0;
          fetchOpts.body = await buildPostFields(rawPost, db, userId);
          // Let fetch set Content-Type with boundary automatically
        } else {
          // Plain POST — send as application/x-www-form-urlencoded
          fetchOpts.body = rawPost;
          fetchOpts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      }

      const upstream = await fetchFn(proxyUrl, fetchOpts);
      const body = await upstream.text();
      return res.status(upstream.ok ? 200 : upstream.status).send(body);
    }

    // No id — DB ping (legacy behaviour)
    if (await dbExists(db)) {
      res.json({ status: 'Ok', message: 'Connection successful' });
    } else {
      res.status(404).json([{ error: 'Database not found' }]);
    }
  } catch (error) {
    res.status(200).json([{ error: 'Connection failed'  }]);
  }
});

// ============================================================================
// DDL Action Routes (Phase 2 - Real Implementation)
// ============================================================================

/**
 * Helper function to parse and update modifiers in requisite name
 * Modifiers are stored in the val field: :ALIAS=xxx::!NULL::MULTI:Name
 */
function parseModifiers(val) {
  let name = val || '';
  let alias = null;
  let required = false;
  let multi = false;

  // Extract :ALIAS=xxx:
  const aliasMatch = name.match(/:ALIAS=(.*?):/);
  if (aliasMatch) {
    alias = aliasMatch[1];
    name = name.replace(aliasMatch[0], '');
  }

  // Extract :!NULL:
  if (name.includes(':!NULL:')) {
    required = true;
    name = name.replace(':!NULL:', '');
  }

  // Extract :MULTI:
  if (name.includes(':MULTI:')) {
    multi = true;
    name = name.replace(':MULTI:', '');
  }

  return { name: name.trim(), alias, required, multi };
}

/**
 * Helper function to build modifier string
 */
function buildModifiers(name, alias, required, multi) {
  let val = '';
  if (alias) val += `:ALIAS=${alias}:`;
  if (required) val += ':!NULL:';
  if (multi) val += ':MULTI:';
  val += name;
  return val;
}

/**
 * _d_new - Create new type
 * POST /:db/_d_new/:parentTypeId?
 * Parameters: val (type name), t (base type), parentTypeId (optional parent)
 */
router.post('/:db/_d_new/:parentTypeId?', legacyAuthMiddleware, legacyXsrfCheck, legacyDdlGrantCheck, async (req, res) => {
  const { db, parentTypeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const parentId = parseInt(parentTypeId || req.body.up || '0', 10);
    const name = req.body.val || req.body.name || '';

    // PHP line 8630-8631: if($val == "") my_die("Empty type")
    if (!name) {
      return res.status(200).json([{ error: 'Type name (val) is required'  }]);
    }

    // PHP line 8632-8633: if(!isset($_REQUEST["t"])) my_die("Base type is not set")
    if (req.body.t === undefined && req.query.t === undefined) {
      return res.status(200).json([{ error: 'Base type is not set' }]);
    }

    const baseType = parseInt(req.body.t ?? req.query.t, 10);

    // PHP line 8634-8635: if(!isset($GLOBALS["basics"][$_REQUEST["t"]]) && ($_REQUEST["t"] !== "0"))
    //   my_die("Base type is invalid: ...")
    if (!REV_BASE_TYPE[baseType] && baseType !== 0) {
      return res.status(200).json([{ error: `Base type is invalid: ${baseType}` }]);
    }

    // PHP line 8636-8641: duplicate (val, t) check at root level
    // SELECT id FROM $z WHERE val='...' AND t=$t AND id!=t
    // If duplicate found: return existing id with warning (not an error)
    if (parentId === 0) {
      const pool = getPool();
      const { rows: dupeRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE val = ? AND t = ? AND id != t LIMIT 1`, [name, baseType], { label: 'post_db_d_new_parentTypeId_select' });
      if (dupeRows.length > 0) {
        const existingId = dupeRows[0].id;
        logger.info('[Legacy _d_new] Type already exists, returning existing', { db, existingId, name, baseType });
        return legacyRespond(req, res, db, {
          id: '', obj: existingId, next_act: 'edit_types', args: 'ext',
          warnings: `The Type ${name} already exists!`
        });
      }
    }

    // PHP line 7788: $unique = isset($_REQUEST["unique"]) ? 1 : 0
    // PHP line 8327: "Ord=1 means the Obj must be unique" — for root-level types (up=0) ord IS the unique flag
    // PHP _d_new: Insert(0, $unique, $t, $val) — always inserts at up=0, ord = unique flag (0 or 1)
    // For child types (parentId != 0, Node.js extension), use sequential ord via getNextOrder
    const order = (parentId === 0)
      ? ((req.body.unique !== undefined || req.query.unique !== undefined) ? 1 : 0)
      : await getNextOrder(db, parentId);

    // Insert the new type
    const id = await insertRow(db, parentId, order, baseType, name);

    logger.info('[Legacy _d_new] Type created', { db, id, name, baseType, parentId });

    // PHP api_dump(): {id:"", obj:newTypeId, next_act:"edit_types", args:"ext"}
    // PHP: $id is empty string (not reassigned after Insert call), $obj = Insert() result (new type id)
    legacyRespond(req, res, db, { id: '', obj: id, next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_new] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_save - Save/update type
 * POST /:db/_d_save/:typeId
 * Parameters: val (new name), t (new base type)
 */
router.post('/:db/_d_save/:typeId', legacyAuthMiddleware, legacyXsrfCheck, legacyDdlGrantCheck, async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(typeId, 10);
    const pool = getPool();

    // PHP _d_save (line 8593): UPDATE $z SET t=$t, val='...', ord='$unique' WHERE id=$id
    // Always updates val, t, and ord (unique flag).
    // $unique = isset($_REQUEST["unique"]) ? 1 : 0 (line 7788)
    const val = req.body.val;
    const t = req.body.t !== undefined ? parseInt(req.body.t, 10) : undefined;
    // unique flag: 1 if param present, 0 otherwise (like PHP)
    const unique = (req.body.unique !== undefined || req.query.unique !== undefined) ? 1 : 0;

    if (val === undefined && t === undefined) {
      return res.status(200).json([{ error: 'No fields to update'  }]);
    }

    // PHP parity: duplicate name check — cannot rename type to an existing name
    if (val !== undefined) {
      const { rows: dupeRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE up = 0 AND val = ? AND id != ? LIMIT 1`, [val, id], { label: 'unique_select' });
      if (dupeRows.length > 0) {
        return res.status(200).json([{ error: `Type with name "${val}" already exists` }]);
      }
    }

    const updates = [];
    const params = [];
    if (val !== undefined) { updates.push('val = ?'); params.push(val); }
    if (t !== undefined) { updates.push('t = ?'); params.push(t); }
    // Always update ord (unique flag) when saving a type, matching PHP behavior
    updates.push('ord = ?');
    params.push(unique);

    params.push(id);
    await execSql(pool, `UPDATE \`${db}\` SET ${updates.join(', ')} WHERE id = ?`, params, { label: 'unique_update' });

    logger.info('[Legacy _d_save] Type saved', { db, id, updates: req.body });

    // PHP api_dump(): {id, obj, next_act:"edit_types", args, warnings}
    legacyRespond(req, res, db, { id, obj: id, next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_save] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_del - Delete type
 * POST /:db/_d_del/:typeId
 */
router.post('/:db/_d_del/:typeId', legacyAuthMiddleware, legacyXsrfCheck, legacyDdlGrantCheck, async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(typeId, 10);
    const pool = getPool();

    // PHP parity: hard-block if type has existing instances (die() in PHP)
    const { rows: [instRow] } = await execSql(pool, `SELECT COUNT(id) AS cnt FROM \`${db}\` WHERE t = ?`, [id], { label: 'post_db_d_del_typeId_select' });
    if (instRow && instRow.cnt > 0) {
      return res.status(400).json({
        error: `Cannot delete the Type in case there are objects of this type (total objects: ${instRow.cnt})!`
      });
    }

    // PHP parity: hard-block if type or its requisites are used in reports (my_die() in PHP)
    const { rows: repRows } = await execSql(pool, `SELECT reqs.id FROM \`${db}\`, \`${db}\` reqs
       WHERE \`${db}\`.t = ${TYPE.REP_COLS} AND \`${db}\`.val = reqs.id
       AND (reqs.up = ? OR reqs.id = ?) LIMIT 1`, [id, id], { label: 'post_db_d_del_typeId_select' });
    if (repRows.length > 0) {
      return res.status(400).json({
        error: `The type or its requisites are used in reports`
      });
    }

    // PHP parity: hard-block if type or its requisites are used in roles (die() in PHP)
    const { rows: roleRows } = await execSql(pool, `SELECT objs.t, objs.val FROM \`${db}\`, \`${db}\` r, \`${db}\` objs
       WHERE r.t = ${TYPE.ROLE} AND r.up = 1 AND objs.up = r.id
       AND objs.val = \`${db}\`.id AND (\`${db}\`.up = ? OR \`${db}\`.id = ?) LIMIT 1`, [id, id], { label: 'post_db_d_del_typeId_select' });
    if (roleRows.length > 0) {
      return res.status(400).json({
        error: `The type or its requisites are used in roles!`
      });
    }

    // Use recursiveDelete — type may have requisites/children
    await recursiveDelete(pool, db, id);

    logger.info('[Legacy _d_del] Type deleted', { db, id });

    // PHP api_dump(): {id:typeId, obj:null, next_act:"edit_types", args:"ext"}
    // PHP: $id stays as original typeId, $obj not set (null), next_act defaults to "edit_types"
    // args: PHP always appends "ext" for all _d_* actions
    legacyRespond(req, res, db, { id, obj: null, next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_del] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_req - Add requisite to type
 * POST /:db/_d_req/:typeId
 * Parameters: val (requisite name), t (requisite type), alias, required, multi
 */
router.post('/:db/_d_req/:typeId', legacyAuthMiddleware, legacyXsrfCheck, legacyDdlGrantCheck, async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const parentId = parseInt(typeId, 10);
    const reqType = parseInt(req.body.t || '8', 10); // Default to CHARS
    const name = req.body.val || req.body.name || '';
    const alias = req.body.alias || null;
    const required = req.body.required === '1' || req.body.required === true;
    let multi = req.body.multi === '1' || req.body.multi === true;
    const multiselect = req.body.multiselect !== undefined;
    const pool = getPool();

    if (!name) {
      return res.status(200).json([{ error: 'Requisite name (val) is required'  }]);
    }

    // PHP parity (Add_Req): validate before adding requisite
    // 1. Target type exists
    const { rows: targetRows } = await execSql(pool, `SELECT id, up FROM \`${db}\` WHERE id = ? LIMIT 1`, [parentId], { label: 'post_db_d_req_typeId_select' });
    if (targetRows.length === 0) {
      return res.status(200).json([{ error: `Type ${parentId} does not exist` }]);
    }

    // 2. Target is metadata row (up = 0) — cannot add requisite to instance
    if (targetRows[0].up !== 0) {
      return res.status(200).json([{ error: 'Cannot add requisite to an instance, only to type definitions' }]);
    }

    // 3. Not self-referencing (type cannot reference itself)
    if (reqType === parentId) {
      return res.status(200).json([{ error: 'Type cannot reference itself' }]);
    }

    // 4. Not duplicate — check if requisite of this type already exists
    // PHP (index.php:8565-8569): when duplicate found, return existing id with warning, not error
    const { rows: dupeRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE up = ? AND t = ? LIMIT 1`, [parentId, reqType], { label: 'post_db_d_req_typeId_select' });
    if (dupeRows.length > 0) {
      return legacyRespond(req, res, db, {
        id: dupeRows[0].id,
        obj: parentId,
        next_act: 'edit_types',
        args: 'ext',
        warnings: 'Requisite already exists'
      });
    }

    // 5. MULTI_MASK auto-application (PHP parity: index.php ~8575)
    // If the requisite type is a reference (its own t is not a basic type)
    // and the multiselect parameter is set, auto-apply :MULTI: flag.
    if (!multi && multiselect) {
      const { rows: reqTypeRows } = await execSql(pool, `SELECT t FROM \`${db}\` WHERE id = ? LIMIT 1`, [reqType], { label: 'post_db_d_req_typeId_select' });
      if (reqTypeRows.length > 0 && REV_BASE_TYPE[reqTypeRows[0].t] === undefined) {
        multi = true;
        logger.info('[Legacy _d_req] MULTI_MASK auto-applied for reference type', { db, reqType });
      }
    }

    // Build value with modifiers
    const val = buildModifiers(name, alias, required, multi);

    // Get next order
    const order = await getNextOrder(db, parentId);

    // Insert the requisite
    const id = await insertRow(db, parentId, order, reqType, val);

    logger.info('[Legacy _d_req] Requisite added', { db, id, parentId, name, reqType });

    // PHP api_dump(): {id:req_id, obj:type_id, next_act:"edit_types", args:"ext", warnings}
    legacyRespond(req, res, db, { id, obj: parentId, next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_req] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_alias - Set alias for requisite
 * POST /:db/_d_alias/:reqId
 * Parameters: alias (new alias value)
 */
router.post('/:db/_d_alias/:reqId', legacyAuthMiddleware, legacyXsrfCheck, legacyDdlGrantCheck, async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(reqId, 10);
    const newAlias = req.body.alias || req.body.val || '';
    const pool = getPool();

    // PHP parity: reject colons in alias — reserved for internal markers like :MULTI:
    if (newAlias.includes(':')) {
      return res.status(200).json([{ error: 'Alias cannot contain colon character' }]);
    }

    // Get current value
    const obj = await getObjectById(db, id);
    if (!obj) {
      return res.status(404).json([{ error: 'Requisite not found' }]);
    }

    // PHP parity (lines 8604-8607): hierarchy check — parent (obj.t) must be metadata root (up=0)
    const parent = await getObjectById(db, obj.t);
    if (!parent || parent.up !== 0) {
      return res.status(200).json([{ error: 'Error in subordination of the link object' }]);
    }

    // Parse existing modifiers
    const modifiers = parseModifiers(obj.val);

    // Update alias and rebuild value
    const newVal = buildModifiers(modifiers.name, newAlias || null, modifiers.required, modifiers.multi);

    await execSql(pool, `UPDATE ${db} SET val = ? WHERE id = ?`, [newVal, id], { label: 'post_db_d_alias_reqId_update' });

    logger.info('[Legacy _d_alias] Alias set', { db, id, alias: newAlias });

    // PHP api_dump(): {id:parent, obj:parent, next_act:"edit_types", args:"ext"}
    // PHP line 8625: $id = $obj = $up — both set to parent type ID (string from DB row)
    legacyRespond(req, res, db, { id: String(obj.up), obj: String(obj.up), next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_alias] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_null - Toggle NOT NULL flag for requisite
 * POST /:db/_d_null/:reqId
 * Parameters: required (1/0 or true/false)
 */
router.post('/:db/_d_null/:reqId', legacyAuthMiddleware, legacyXsrfCheck, legacyDdlGrantCheck, async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(reqId, 10);
    const pool = getPool();

    // Get current value
    const obj = await getObjectById(db, id);
    if (!obj) {
      return res.status(404).json([{ error: 'Requisite not found' }]);
    }

    // Metadata verification: only allow toggling nullable on metadata-level requisites (parent.up === 0)
    const { rows: parentRows } = await execSql(pool, `SELECT up FROM \`${db}\` WHERE id = ? LIMIT 1`, [obj.up], { label: 'post_db_d_null_reqId_select' });
    if (parentRows.length === 0 || parentRows[0].up !== 0) {
      return res.status(200).json([{ error: 'Can only toggle NULL on type definitions, not instances' }]);
    }

    // Parse existing modifiers
    const modifiers = parseModifiers(obj.val);

    // Toggle or set required flag
    const newRequired = req.body.required !== undefined
      ? (req.body.required === '1' || req.body.required === true)
      : !modifiers.required;

    // Rebuild value with updated flag
    const newVal = buildModifiers(modifiers.name, modifiers.alias, newRequired, modifiers.multi);

    await execSql(pool, `UPDATE ${db} SET val = ? WHERE id = ?`, [newVal, id], { label: 'post_db_d_null_reqId_update' });

    logger.info('[Legacy _d_null] NOT NULL toggled', { db, id, required: newRequired });

    // PHP api_dump(): {id:reqId, obj:parentTypeId, next_act:"edit_types", args:"ext"}
    // PHP: $id = reqId (integer URL param); $obj = $row["up"] (parent type string from DB row)
    legacyRespond(req, res, db, { id, obj: String(obj.up), next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_null] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_multi - Toggle MULTI flag for requisite
 * POST /:db/_d_multi/:reqId
 * Parameters: multi (1/0 or true/false)
 */
router.post('/:db/_d_multi/:reqId', legacyAuthMiddleware, legacyXsrfCheck, legacyDdlGrantCheck, async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(reqId, 10);
    const pool = getPool();

    // Get current value
    const obj = await getObjectById(db, id);
    if (!obj) {
      return res.status(404).json([{ error: 'Requisite not found' }]);
    }

    // Metadata verification: only allow toggling multi on metadata-level requisites (parent.up === 0)
    const { rows: parentRows } = await execSql(pool, `SELECT up FROM \`${db}\` WHERE id = ? LIMIT 1`, [obj.up], { label: 'post_db_d_multi_reqId_select' });
    if (parentRows.length === 0 || parentRows[0].up !== 0) {
      return res.status(200).json([{ error: 'Can only toggle MULTI on type definitions, not instances' }]);
    }

    // Parse existing modifiers
    const modifiers = parseModifiers(obj.val);

    // Toggle or set multi flag
    const newMulti = req.body.multi !== undefined
      ? (req.body.multi === '1' || req.body.multi === true)
      : !modifiers.multi;

    // Rebuild value with updated flag
    const newVal = buildModifiers(modifiers.name, modifiers.alias, modifiers.required, newMulti);

    await execSql(pool, `UPDATE ${db} SET val = ? WHERE id = ?`, [newVal, id], { label: 'post_db_d_multi_reqId_update' });

    logger.info('[Legacy _d_multi] MULTI toggled', { db, id, multi: newMulti });

    // PHP api_dump(): {id:reqId, obj:parentTypeId, next_act:"edit_types", args:"ext"}
    // PHP: $id = reqId (integer URL param); $obj = $row["up"] (parent type string from DB row)
    legacyRespond(req, res, db, { id, obj: String(obj.up), next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_multi] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_attrs - Set modifiers for requisite
 * POST /:db/_d_attrs/:reqId
 * Parameters: alias, required, multi (sets all modifiers at once)
 */
router.post('/:db/_d_attrs/:reqId', legacyAuthMiddleware, legacyXsrfCheck, legacyDdlGrantCheck, async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(reqId, 10);
    const pool = getPool();

    // Get current value
    const obj = await getObjectById(db, id);
    if (!obj) {
      return res.status(404).json([{ error: 'Requisite not found' }]);
    }

    // Parse existing modifiers
    const modifiers = parseModifiers(obj.val);

    // Update modifiers from request (keep existing if not provided)
    const newAlias = req.body.alias !== undefined ? (req.body.alias || null) : modifiers.alias;
    const newRequired = req.body.required !== undefined
      ? (req.body.required === '1' || req.body.required === true)
      : modifiers.required;
    const newMulti = req.body.multi !== undefined
      ? (req.body.multi === '1' || req.body.multi === true)
      : modifiers.multi;

    // Update name if provided
    const newName = req.body.name || req.body.val || modifiers.name;

    // Rebuild value
    const newVal = buildModifiers(newName, newAlias, newRequired, newMulti);

    await execSql(pool, `UPDATE ${db} SET val = ? WHERE id = ?`, [newVal, id], { label: 'post_db_d_attrs_reqId_update' });

    logger.info('[Legacy _d_attrs] Modifiers updated', { db, id, alias: newAlias, required: newRequired, multi: newMulti });

    // PHP api_dump(): {id:reqId, obj:parentTypeId, next_act:"edit_types", args:"ext"}
    // PHP returns parent type ID (from req.body.up or obj.up) for frontend refresh
    const parentTypeId = parseInt(req.body.up || obj.up, 10);
    legacyRespond(req, res, db, { id, obj: String(parentTypeId), next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_attrs] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_up - Move requisite up (decrease order)
 * POST /:db/_d_up/:reqId
 */
router.post('/:db/_d_up/:reqId', legacyAuthMiddleware, legacyXsrfCheck, legacyDdlGrantCheck, async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(reqId, 10);
    const pool = getPool();

    // Get current object
    const obj = await getObjectById(db, id);
    if (!obj) {
      return res.status(404).json([{ error: 'Requisite not found' }]);
    }

    // Find the previous sibling (same parent, lower order)
    const { rows: siblings } = await execSql(pool, `SELECT id, ord FROM ${db} WHERE up = ? AND ord < ? ORDER BY ord DESC LIMIT 1`, [obj.up, obj.ord], { label: 'post_db_d_up_reqId_select' });

    if (siblings.length === 0) {
      // Already at top — still return PHP api_dump() format
      // PHP: $id = $row["up"] (parent string from DB row), $obj = $id (also parent string)
      return legacyRespond(req, res, db, { id: String(obj.up), obj: String(obj.up), next_act: 'edit_types', args: 'ext' });
    }

    const prevSibling = siblings[0];

    // Atomic swap using single CASE WHEN UPDATE (PHP parity — prevents intermediate inconsistent state)
    // PHP matches by ord values (WHERE ord=X OR ord=Y), which updates all rows
    // with those ord values. Node.js matches by id (WHERE id IN) for precision.
    // This diverges from PHP when duplicate ord values exist.
    await execSql(pool, `UPDATE ${db} SET ord = CASE WHEN id = ? THEN ? WHEN id = ? THEN ? END WHERE id IN (?, ?)`, [id, prevSibling.ord, prevSibling.id, obj.ord, id, prevSibling.id], { label: 'post_db_d_up_reqId_update' });

    logger.info('[Legacy _d_up] Requisite moved up', { db, id, newOrd: prevSibling.ord });

    // PHP api_dump(): {id:parent, obj:parent, next_act:"edit_types", args:"ext"}
    // PHP: $id = $row["up"] (parent string from DB row), $obj = $id (also parent string)
    legacyRespond(req, res, db, { id: String(obj.up), obj: String(obj.up), next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_up] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_ord - Set order for requisite
 * POST /:db/_d_ord/:reqId
 * Parameters: order (new order value) — PHP uses $_REQUEST["order"] not "ord"
 */
router.post('/:db/_d_ord/:reqId', legacyAuthMiddleware, legacyXsrfCheck, legacyDdlGrantCheck, async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(reqId, 10);
    // PHP line 8721: $newOrd = (int)$_REQUEST["order"]  (not "ord")
    const newOrd = parseInt(req.body.order || req.query.order, 10);

    if (isNaN(newOrd) || newOrd < 1) {
      return res.status(200).json([{ error: 'Invalid order'  }]);
    }

    const pool = getPool();

    // PHP: SELECT req.ord, req.up FROM $z req, $z par WHERE req.id=$id AND par.id=req.up AND par.up=0
    const { rows: [reqRow] } = await execSql(pool, `SELECT req.ord, req.up FROM \`${db}\` req, \`${db}\` par WHERE req.id=? AND par.id=req.up AND par.up=0`, [id], { label: 'post_db_d_ord_reqId_select' });

    if (!reqRow) {
      return res.status(200).json([{ error: `Id=${id} not found`  }]);
    }

    const parentId = reqRow.up;
    const oldOrd = reqRow.ord;

    if (String(newOrd) !== String(oldOrd)) {
      // PHP line 8730-8731: reorder range of siblings between old and new positions
      // UPDATE $z SET ord=(CASE WHEN id=$rid THEN LEAST($newOrd, maxOrd) ELSE ord+SIGN($ord-$newOrd) END)
      //   WHERE up=$id AND ord BETWEEN LEAST($ord, $newOrd) AND GREATEST($ord, $newOrd)
      // Use CAST to SIGNED to prevent UNSIGNED underflow when ord shifts below 0
      await execSql(pool, `
        UPDATE \`${db}\` SET ord=(CASE WHEN id=? THEN LEAST(?, (SELECT max(ord) FROM (SELECT ord FROM \`${db}\` WHERE up=?) AS t))
                                       ELSE GREATEST(0, CAST(ord AS SIGNED)+SIGN(?-?)) END)
        WHERE up=? AND ord BETWEEN LEAST(?,?) AND GREATEST(?,?)`, [id, newOrd, parentId, oldOrd, newOrd, parentId, oldOrd, newOrd, oldOrd, newOrd], { label: 'post_db_d_ord_reqId_update' });
    }

    logger.info('[Legacy _d_ord] Order set', { db, id, ord: newOrd });

    // PHP (index.php:8726-8733): $id is only reassigned to $row["up"] (parentId)
    // when the order actually changed. If newOrd === oldOrd, $id stays as reqId.
    // $obj=$id is set after the if-block, so $obj always equals the final $id.
    const responseId = (String(newOrd) !== String(oldOrd)) ? String(parentId) : String(id);
    legacyRespond(req, res, db, { id: responseId, obj: responseId, next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_ord] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_del_req - Delete requisite
 * POST /:db/_d_del_req/:reqId
 */
router.post('/:db/_d_del_req/:reqId', legacyAuthMiddleware, legacyXsrfCheck, legacyDdlGrantCheck, async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(reqId, 10);
    const pool = getPool();
    const forced = req.body.forced !== undefined || req.query.forced !== undefined;

    // PHP parity: fetch requisite definition row + its parent type info
    const { rows: [defRow] } = await execSql(pool, `SELECT def.up, def.t AS typ, def.ord, r.t AS parentT, r.val AS parentVal
       FROM \`${db}\` def, \`${db}\` r WHERE def.id = ? AND r.id = def.t`, [id], { label: 'post_db_d_del_req_reqId_select' });
    if (!defRow) {
      return res.status(200).json([{ error: 'Requisite not found' }]);
    }
    const typeId = defRow.up;
    const myord = defRow.ord;
    const isBasic = REV_BASE_TYPE[defRow.parentT] !== undefined;

    // PHP parity: check if requisite data exists in object instances
    let usageSql;
    if (isBasic) {
      // Basic type: count objects of parent type that have this requisite column
      usageSql = `SELECT COUNT(1) AS cnt FROM \`${db}\` obj, \`${db}\` req
                  WHERE obj.t = ? AND (req.t = ? OR req.t = ?) AND req.up = obj.id`;
    } else {
      // Reference type: count objects of parent type referencing this req by val
      usageSql = `SELECT COUNT(1) AS cnt FROM \`${db}\` obj, \`${db}\` req
                  WHERE obj.t = ? AND req.up = obj.id AND req.val = ?`;
    }

    const usageParams = isBasic ? [typeId, defRow.typ, id] : [typeId, String(id)];
    const { rows: [usageRow] } = await execSql(pool, usageSql, usageParams, { label: 'post_db_d_del_req_reqId_query' });

    if (usageRow && usageRow.cnt > 0) {
      if (forced) {
        // PHP parity: forced — delete requisite data from instances
        const cleanSql = isBasic
          ? `SELECT req.id FROM \`${db}\` obj, \`${db}\` req
             WHERE obj.t = ? AND (req.t = ? OR req.t = ?) AND req.up = obj.id`
          : `SELECT req.id FROM \`${db}\` obj, \`${db}\` req
             WHERE obj.t = ? AND req.up = obj.id AND req.val = ?`;
        const { rows: cleanRows } = await execSql(pool, cleanSql, usageParams, { label: 'post_db_d_del_req_reqId_query' });
        for (const row of cleanRows) {
          await recursiveDelete(pool, db, row.id);
        }
        // PHP parity: also clean grants referencing this requisite
        const { rows: grantRows } = await execSql(pool, `SELECT reqs.id FROM \`${db}\`, \`${db}\` reqs
           WHERE \`${db}\`.t = ${TYPE.ROLE} AND \`${db}\`.up = 1
           AND reqs.up = \`${db}\`.id AND reqs.val = ?`, [String(id)], { label: 'post_db_d_del_req_reqId_select' });
        for (const row of grantRows) {
          await recursiveDelete(pool, db, row.id);
        }
      } else {
        // PHP parity: hard-block deletion (my_die() in PHP)
        return res.status(400).json({
          error: `You are going to delete a requisite if there are records of this type (total records: ${usageRow.cnt})!`
        });
      }
    }

    // PHP parity: hard-block if requisite is used in reports or roles (my_die() — no forced override)
    const { rows: [repRoleRow] } = await execSql(pool, `SELECT ${TYPE.REP_COLS} AS t FROM \`${db}\` WHERE t = ${TYPE.REP_COLS} AND val = ?
       UNION SELECT reqs.t FROM \`${db}\`, \`${db}\` reqs
       WHERE \`${db}\`.t = ${TYPE.ROLE} AND \`${db}\`.up = 1
       AND reqs.up = \`${db}\`.id AND reqs.val = ? LIMIT 1`, [String(id), String(id)], { label: 'post_db_d_del_req_reqId_select' });
    if (repRoleRow) {
      return res.status(400).json({
        error: `The requisite is used in reports or roles!`
      });
    }

    // Delete the requisite
    await recursiveDelete(pool, db, id);

    // Renumber remaining siblings after deletion
    await execSql(pool, `UPDATE \`${db}\` SET ord = ord - 1 WHERE up = ? AND ord > ?`, [typeId, myord], { label: 'post_db_d_del_req_reqId_update' });

    logger.info('[Legacy _d_del_req] Requisite deleted', { db, id, forced });

    // PHP api_dump(): {id:type_id, obj:type_id, next_act:"edit_types", args:"ext"}
    // PHP: $id = $obj = $row["up"] (parent type string from DB row), so both are strings
    legacyRespond(req, res, db, { id: String(typeId), obj: String(typeId), next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_del_req] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_ref - Create reference type for a given type
 * POST /:db/_d_ref/:typeId
 * PHP: $id = typeId (URL param) = the type to make referenceable
 * PHP line 8647: if($id == 0) die("Invalid link")
 * PHP line 8649: SELECT ref.id FROM obj LEFT JOIN ref ON ref.up=0 AND ref.t=$id AND ref.val=''
 * PHP line 8661: Insert(0, 0, $id, "", "Create Ref") — up=0, ord=0, t=$id, val=""
 */
router.post('/:db/_d_ref/:typeId', legacyAuthMiddleware, legacyXsrfCheck, legacyDdlGrantCheck, async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(typeId, 10);

    if (!id) {
      return res.status(200).json([{ error: `Invalid link (${id})`  }]);
    }

    const pool = getPool();

    // PHP: SELECT obj.up, obj.t, ref.id FROM $z obj LEFT JOIN $z ref ON ref.up=0 AND ref.t=$id AND ref.val='' WHERE obj.id=$id
    const { rows: [row] } = await execSql(pool, `SELECT obj.up, obj.t, ref.id refId FROM \`${db}\` obj LEFT JOIN \`${db}\` ref ON ref.up=0 AND ref.t=? AND ref.val='' WHERE obj.id=?`, [id, id], { label: 'post_db_d_ref_typeId_select' });

    if (!row) {
      return res.status(200).json([{ error: `${id} type not found`  }]);
    }

    // PHP: if(($row["up"] != 0) || ($row["t"] == $id)) die("Invalid $id type")
    if (row.up !== 0 || row.t === id) {
      return res.status(200).json([{ error: `Invalid ${id} type`  }]);
    }

    let refId;
    if (row.refId > 0) {
      // Reference already exists — return existing
      refId = row.refId;
    } else {
      // PHP: $obj = Insert(0, 0, $id, "", "Create Ref")
      refId = await insertRow(db, 0, 0, id, '');
    }

    logger.info('[Legacy _d_ref] Reference created/found', { db, id, refId });

    // PHP api_dump(): {id:$id (original type id), obj:$obj (ref row id), next_act:"edit_types", args:"ext"}
    legacyRespond(req, res, db, { id, obj: refId, next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_ref] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

// ============================================================================
// Additional DML Actions (Phase 2)
// ============================================================================

/**
 * _m_up - Move object up (decrease order)
 * POST /:db/_m_up/:id
 */
router.post('/:db/_m_up/:id', legacyAuthMiddleware, legacyXsrfCheck, async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const objectId = parseInt(id, 10);
    const pool = getPool();
    const { grants, username } = req.legacyUser || {};

    // Grant check — PHP checks WRITE grant before move-up
    if (!await checkGrant(pool, db, grants || {}, objectId, 0, 'WRITE', username || '')) {
      return res.status(200).json([{ error: 'Insufficient privileges' }]);
    }

    // Get current object
    const obj = await getObjectById(db, objectId);
    if (!obj) {
      return res.status(404).json([{ error: 'Object not found' }]);
    }

    // Find the previous sibling (same parent and type, lower order)
    const { rows: siblings } = await execSql(pool, `SELECT id, ord FROM ${db} WHERE up = ? AND t = ? AND ord < ? ORDER BY ord DESC LIMIT 1`, [obj.up, obj.t, obj.ord], { label: 'post_db_m_up_id_select' });

    if (siblings.length === 0) {
      // Already at top — still return PHP api_dump() format
      // PHP: $id = $row["t"] (typeId), $obj = null, $arg = "F_U=$up" always
      return legacyRespond(req, res, db, { id: String(obj.t), obj: null, next_act: 'object', args: `F_U=${obj.up}` });
    }

    const prevSibling = siblings[0];

    // Atomic swap using single CASE WHEN UPDATE (replaces 2 separate UPDATEs)
    // PHP matches by ord values (WHERE ord=X OR ord=Y), which updates all rows
    // with those ord values. Node.js matches by id (WHERE id IN) for precision.
    // This diverges from PHP when duplicate ord values exist.
    await execSql(pool, `UPDATE ${db} SET ord = CASE WHEN id = ? THEN ? WHEN id = ? THEN ? END WHERE id IN (?, ?)`, [objectId, prevSibling.ord, prevSibling.id, obj.ord, objectId, prevSibling.id], { label: 'post_db_m_up_id_update' });

    logger.info('[Legacy _m_up] Object moved up', { db, id: objectId, newOrd: prevSibling.ord });

    // PHP api_dump(): {id:typeId, obj:null, next_act:"object", args:"F_U=$up" always}
    // PHP: $id = $row["t"] (typeId of the moved object), $obj = null, $arg = "F_U=$up" always
    legacyRespond(req, res, db, { id: String(obj.t), obj: null, next_act: 'object', args: `F_U=${obj.up}` });
  } catch (error) {
    logger.error('[Legacy _m_up] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _m_ord - Set order for object
 * POST /:db/_m_ord/:id
 * Parameters: order (new order value, in query string: ?JSON&order=N)
 */
router.post('/:db/_m_ord/:id', legacyAuthMiddleware, legacyXsrfCheck, async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const objectId = parseInt(id, 10);
    // PHP uses $_REQUEST["order"] — comes from query string ?JSON&order=N
    const newOrd = parseInt(req.query.order ?? req.body.order ?? req.body.ord, 10);

    if (isNaN(newOrd) || newOrd < 1) {
      // PHP returns plain text "Invalid order" for invalid order parameter
      return res.status(200).send('Invalid order');
    }

    const pool = getPool();
    const { grants, username } = req.legacyUser || {};

    // Grant check — PHP checks WRITE grant before reordering
    if (!await checkGrant(pool, db, grants || {}, objectId, 0, 'WRITE', username || '')) {
      return res.status(200).json([{ error: 'Insufficient privileges' }]);
    }

    // PHP: SELECT obj.ord, obj.up FROM $z obj, $z par
    //      WHERE obj.id=$id AND par.id=obj.up AND par.up!=0
    // (par.up!=0 ensures object is a data record, not a root type)
    const { rows: [row] } = await execSql(pool, `SELECT obj.ord, obj.up FROM \`${db}\` obj
       JOIN \`${db}\` par ON par.id = obj.up AND par.up != 0
       WHERE obj.id = ?`, [objectId], { label: 'post_db_m_ord_id_select' });

    if (!row) {
      return res.status(200).json([{ error: `Id=${objectId} not found` }]);
    }

    const parentId = row.up;
    const oldOrd   = row.ord;

    if (String(newOrd) !== String(oldOrd)) {
      // PHP: UPDATE $z SET ord=(CASE WHEN id=$rid THEN LEAST($newOrd, max_ord)
      //                             ELSE ord+SIGN($ord-$newOrd) END)
      //      WHERE up=$parentId AND ord BETWEEN LEAST($ord,$newOrd) AND GREATEST($ord,$newOrd)
      // Use CAST to SIGNED to prevent UNSIGNED underflow when ord shifts below 0
      await execSql(pool, `UPDATE \`${db}\`
         SET ord = CASE
           WHEN id = ? THEN LEAST(?, (SELECT maxo FROM (SELECT MAX(ord) AS maxo FROM \`${db}\` WHERE up = ?) AS t))
           ELSE GREATEST(0, CAST(ord AS SIGNED) + SIGN(? - ?))
         END
         WHERE up = ? AND ord BETWEEN LEAST(?,?) AND GREATEST(?,?)`, [objectId, newOrd, parentId, oldOrd, newOrd, parentId, oldOrd, newOrd, oldOrd, newOrd], { label: 'post_db_m_ord_id_update' });
    }

    logger.info('[Legacy _m_ord] Order set', { db, id: objectId, ord: newOrd });

    // PHP api_dump(): {id:parentId, obj:parentId, next_act:"_m_ord"|req.next_act, args:"", warnings}
    // PHP: $id = $row["up"] (parent), $obj = $id (also parent), $next_act defaults to "_m_ord"
    // PHP mysqli_fetch_array returns strings, so id and obj are strings like "1"
    const nextAct = req.body.next_act || req.query.next_act || '_m_ord';
    legacyRespond(req, res, db, { id: String(parentId), obj: String(parentId), next_act: nextAct, args: '' });
  } catch (error) {
    logger.error('[Legacy _m_ord] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _m_id - Change object ID (reserved operation)
 * POST /:db/_m_id/:id
 */
router.post('/:db/_m_id/:id', legacyAuthMiddleware, legacyXsrfCheck, async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database' }]);
  }

  try {
    const pool = getPool();
    const oldId = parseInt(id, 10);
    const newId = parseInt(req.body.new_id || req.query.new_id, 10);
    const { grants, username } = req.legacyUser || {};

    if (!newId || newId <= 0) {
      return res.status(200).json([{ error: 'new_id must be a positive integer' }]);
    }
    if (oldId === newId) {
      return res.status(200).json([{ error: 'new_id must differ from current id' }]);
    }

    // Grant check — PHP checks WRITE grant before ID change
    if (!await checkGrant(pool, db, grants || {}, oldId, 0, 'WRITE', username || '')) {
      return res.status(200).json([{ error: 'Insufficient privileges' }]);
    }

    // Check that the old object exists and get its parent
    const { rows: objRows } = await execSql(pool, `SELECT id, up FROM \`${db}\` WHERE id = ? LIMIT 1`, [oldId], { label: 'post_db_m_id_id_select' });
    if (objRows.length === 0) {
      return res.status(200).json([{ error: 'Object not found' }]);
    }
    const up = objRows[0].up;

    // Metadata guard: can't change ID of metadata (root-level types)
    if (objRows[0].up === 0) {
      return res.status(200).json([{ error: 'Cannot change ID of metadata object' }]);
    }

    // Check that new_id is not already in use
    const { rows: existRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE id = ? LIMIT 1`, [newId], { label: 'post_db_m_id_id_select' });
    if (existRows.length > 0) {
      return res.status(200).json([{ error: `ID ${newId} is already in use` }]);
    }

    // PHP: 3 UPDATEs to rename the id everywhere it appears — wrap in transaction
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(`UPDATE \`${db}\` SET id = ? WHERE id = ?`, [newId, oldId]);
      await conn.query(`UPDATE \`${db}\` SET up = ? WHERE up = ?`, [newId, oldId]);
      await conn.query(`UPDATE \`${db}\` SET t  = ? WHERE t  = ?`, [newId, oldId]);
      await conn.commit();
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }

    logger.info('[Legacy _m_id] ID changed', { db, oldId, newId, up });

    // PHP: $next_act defaults to $a = "_m_id" (line 9172), $arg stays ""
    const nextAct = req.body.next_act || req.query.next_act || '_m_id';
    legacyRespond(req, res, db, { id: newId, obj: newId, next_act: nextAct, args: '' });
  } catch (error) {
    logger.error('[Legacy _m_id] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message }]);
  }
});

// ============================================================================
// Phase 3: Metadata and Advanced Query Actions
// ============================================================================

/**
 * obj_meta - Get object metadata with requisites
 * GET/POST /:db/obj_meta/:id
 */
router.all('/:db/obj_meta/:id', legacyAuthMiddleware, async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    const objectId = parseInt(id, 10);

    // PHP obj_meta query (index.php line 8827):
    // SELECT obj.id, obj.up, obj.t, obj.val,
    //   req.id req_t, req.t ref_id, refs.id ref, req.val attrs, req.ord,
    //   CASE WHEN refs.id IS NULL THEN typs.t ELSE refs.t END base_typ,
    //   CASE WHEN refs.id IS NULL THEN typs.val ELSE refs.val END req_val,
    //   CASE WHEN arrs.id IS NULL THEN NULL ELSE typs.id END arr_id
    // FROM $z obj LEFT JOIN $z req ON req.up=$id ...
    // WHERE obj.id=$id ORDER BY req.ord
    // Response keyed by req.ord: {"1": {id, val, type, arr_id?, ref?, ref_id?, attrs?}, ...}
    const query = `
      SELECT
        obj.id, obj.up, obj.t, obj.val,
        req.id AS req_t, req.t AS ref_id, refs.id AS ref_col, req.val AS attrs, req.ord,
        CASE WHEN refs.id IS NULL THEN typs.t ELSE refs.t END AS base_typ,
        CASE WHEN refs.id IS NULL THEN typs.val ELSE refs.val END AS req_val,
        CASE WHEN arrs.id IS NULL THEN NULL ELSE typs.id END AS arr_id
      FROM ${db} obj
      LEFT JOIN ${db} req ON req.up = ?
      LEFT JOIN ${db} typs ON typs.id = req.t
      LEFT JOIN ${db} refs ON refs.id = typs.t AND refs.t != refs.id
      LEFT JOIN ${db} arrs ON refs.id IS NULL AND arrs.up = typs.id AND arrs.ord = 1
      WHERE obj.id = ?
      ORDER BY req.ord
    `;

    const { rows: rows } = await execSql(pool, query, [objectId, objectId], { label: 'query_query' });

    if (rows.length === 0) {
      // PHP returns HTTP 200 with error JSON, not 404
      return res.status(200).json([{ error: 'Object not found' }]);
    }

    // Build response matching PHP format (line 8838-8857)
    // Top-level: id, up, type, val (all as strings from mysqli_fetch_array)
    const meta = {
      id: String(rows[0].id),
      up: String(rows[0].up),
      type: String(rows[0].t),
      val: rows[0].val || '',
    };

    // reqs keyed by req.ord (PHP line 8846: "\"" . $row["ord"] . "\":{...")
    // PHP: only include reqs key if requisites exist
    const reqs = {};
    for (const row of rows) {
      if (row.req_t == null) continue;  // no requisite row joined
      const reqEntry = {
        id:   String(row.req_t),
        val:  row.req_val != null ? String(row.req_val) : '',
        type: row.base_typ != null ? String(row.base_typ) : '',
      };
      if (row.arr_id != null) reqEntry.arr_id = String(row.arr_id);
      if (row.ref_col != null) {
        reqEntry.ref    = String(row.ref_col);
        reqEntry.ref_id = String(row.ref_id);
      }
      if (row.attrs) reqEntry.attrs = row.attrs;
      reqs[String(row.ord)] = reqEntry;
    }

    // PHP: omit reqs key when no requisites exist
    if (Object.keys(reqs).length > 0) {
      meta.reqs = reqs;
    }

    logger.info('[Legacy obj_meta] Metadata retrieved', { db, id: objectId });

    res.json(meta);
  } catch (error) {
    logger.error('[Legacy obj_meta] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * metadata - Get type/term metadata for all or specific type
 * GET/POST /:db/metadata/:typeId?
 */
router.all('/:db/metadata/:typeId?', legacyAuthMiddleware, async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();

    // Special case: /metadata/base returns base types (id=t, up=0)
    if (typeId === 'base') {
      const { rows: baseRows } = await execSql(pool, `SELECT id, val FROM ${db} WHERE up=0 AND id=t ORDER BY id`, [], { label: 'query_select' });
      return res.json(baseRows.map(r => ({ id: r.id, val: r.val })));
    }

    const isOneType = typeId && parseInt(typeId, 10) > 0;
    const id = isOneType ? parseInt(typeId, 10) : null;

    // Build query for types and their requisites
    let query;
    let params = [];

    if (isOneType) {
      query = `
        SELECT
          obj.id, obj.up, obj.t, obj.ord AS uniq, obj.val,
          req.id AS req_id, req.t AS req_type, req.val AS req_attrs, req.ord AS req_ord,
          COALESCE(refs.t, typs.t) AS base_typ,
          COALESCE(refs.val, typs.val) AS req_val,
          refs.id AS ref_id,
          CASE WHEN arrs.id IS NOT NULL THEN typs.id ELSE NULL END AS arr_id
        FROM ${db} obj
        LEFT JOIN ${db} req ON req.up = ?
        LEFT JOIN ${db} typs ON typs.id = req.t
        LEFT JOIN ${db} refs ON refs.id = typs.t AND refs.t != refs.id
        LEFT JOIN ${db} arrs ON refs.id IS NULL AND arrs.up = typs.id AND arrs.ord = 1
        WHERE obj.id = ?
        ORDER BY obj.id, req.ord
      `;
      params = [id, id];
    } else {
      query = `
        SELECT
          obj.id, obj.up, obj.t, obj.ord AS uniq, obj.val,
          req.id AS req_id, req.t AS req_type, req.val AS req_attrs, req.ord AS req_ord,
          COALESCE(refs.t, typs.t) AS base_typ,
          COALESCE(refs.val, typs.val) AS req_val,
          refs.id AS ref_id,
          CASE WHEN arrs.id IS NOT NULL THEN typs.id ELSE NULL END AS arr_id
        FROM ${db} obj
        LEFT JOIN ${db} req ON req.up = obj.id
        LEFT JOIN ${db} typs ON typs.id = req.t
        LEFT JOIN ${db} refs ON refs.id = typs.t AND refs.t != refs.id
        LEFT JOIN ${db} arrs ON refs.id IS NULL AND arrs.up = typs.id AND arrs.ord = 1
        WHERE obj.up = 0 AND obj.id != obj.t AND obj.val != '' AND obj.t != 0
        ORDER BY obj.id, req.ord
      `;
    }

    const { rows: rows } = await execSql(pool, query, params, { label: 'query_query' });

    // PHP (metadata all): first pass collects req-only types to skip.
    // "req-only" = type has no own requisites AND its ID is used as req.t by another type.
    // PHP: foreach $data as $row: if(!is_null($row["ref_id"])) $reqs[$row["ref_id"]] = $row["id"]
    //   where ref_id = req.t (PHP alias) = req_type (our alias)
    // Then second loop skips: if(!$row["ord"] && isset($reqs[$row["id"]]))
    const usedAsReqType = new Set();
    if (!isOneType) {
      for (const row of rows) {
        if (row.req_type != null) usedAsReqType.add(row.req_type);
      }
    }

    // Group rows by type ID
    const typesMap = new Map();

    for (const row of rows) {
      // PHP: if(!$row["ord"] && isset($reqs[$row["id"]])) continue;
      // Skip req-only types in the all-types case (not for single-type lookup)
      if (!isOneType && !row.req_ord && usedAsReqType.has(row.id)) continue;

      if (!typesMap.has(row.id)) {
        typesMap.set(row.id, {
          id: row.id.toString(),
          up: row.up.toString(),
          type: row.t.toString(),
          // PHP: val placed verbatim in JSON string — decode \uXXXX escapes that PHP treats as JSON
          val: decodeJsonEscapes(row.val || ''),
          unique: row.uniq.toString(),
          reqs: []
        });
      }

      if (row.req_ord) {
        // PHP metadata format: {num, id, val, orig, type, arr_id?, ref?, ref_id?, attrs}
        // orig = raw t value from the requisite row (req.t)
        // type = base type (COALESCE(refs.t, typs.t))
        // ref  = ref type ID (when typs.t points to another type)
        // ref_id = req.t (the column ID in the types table when referencing)
        // PHP: orig = refs.id if present else req.t  (Node aliases: refs.id→ref_id, req.t→req_type)
        const reqData = {
          num: row.req_ord,
          id: row.req_id.toString(),
          // PHP: addcslashes($val, "\\'") — escape backslash and single-quote
          val: (row.req_val || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
          orig: (row.ref_id || row.req_type || '').toString(),
          // PHP: "$row["base_typ"]" — 0 should give "0", only NULL gives ""
          type: row.base_typ != null ? String(row.base_typ) : '',
        };
        if (row.req_attrs) {
          // PHP: attrs placed verbatim — decode \uXXXX escapes (e.g., :ALIAS=\u041e...:)
          reqData.attrs = decodeJsonEscapes(row.req_attrs);
        }

        if (row.arr_id) {
          reqData.arr_id = row.arr_id.toString();
        }

        if (row.ref_id) {
          reqData.ref = row.ref_id.toString();
          reqData.ref_id = row.req_type.toString();
        }

        typesMap.get(row.id).reqs.push(reqData);
      }
    }

    const result = Array.from(typesMap.values());

    logger.info('[Legacy metadata] Metadata retrieved', { db, typeId: id, count: result.length });

    if (isOneType) {
      res.json(result[0] || { error: 'Type not found' });
    } else {
      res.json(result);
    }
  } catch (error) {
    logger.error('[Legacy metadata] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * jwt - JWT authentication
 * POST /:db/jwt
 *
 * PHP: index.php lines 7608–7616, authJWT() lines 7558–7577
 * PHP verifies RSA-SHA256 JWT (JWT_PUBLIC_KEY), extracts data.userId, looks up
 * user by username, regenerates session, returns {_xsrf, token, id, user}.
 *
 * Standalone: if INTEGRAM_JWT_PUBLIC_KEY env var is set → full RSA verify.
 * Otherwise → treat jwt field as a session token (backwards compat for non-RSA flows).
 * Response format always matches PHP authJWT() output.
 */
router.post('/:db/jwt', async (req, res) => {
  const { db } = req.params;
  const jwtToken = req.body.jwt || req.body.token || '';

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database' }]);
  }

  if (!jwtToken) {
    return res.status(200).json([{ error: 'JWT verification failed' }]);
  }

  try {
    const pool = getPool();
    let username = null;

    const publicKey = process.env.INTEGRAM_JWT_PUBLIC_KEY || '';

    if (publicKey) {
      // Full RSA-SHA256 verification — matches PHP verifyJWT()
      // PHP: openssl_verify("$header.$payload", $sig, $publicKey, OPENSSL_ALGO_SHA256)
      const parts = jwtToken.split('.');
      if (parts.length !== 3) {
        return res.status(200).json([{ error: 'JWT verification failed' }]);
      }
      const [headerB64, payloadB64, sigB64] = parts;
      const sigBuf = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      const data = Buffer.from(`${headerB64}.${payloadB64}`);
      const ok = crypto.verify('SHA256', data, { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, sigBuf);
      if (!ok) {
        return res.status(200).json([{ error: 'JWT verification failed' }]);
      }
      const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
      const now = Math.floor(Date.now() / 1000);
      if (!payload.iat || !payload.exp || now > payload.exp || now < payload.iat) {
        return res.status(200).json([{ error: 'JWT expired' }]);
      }
      // PHP: $params->data->userId
      username = payload?.data?.userId || payload?.sub || null;
      if (!username) {
        return res.status(200).json([{ error: 'JWT verification failed' }]);
      }
    }

    // PHP authJWT($username): look up user, regenerate session, return {_xsrf,token,id,user}
    // In standalone (no RSA key): treat jwt field as session token for backwards compat
    const whereClause = username
      ? `u.t = ${TYPE.USER} AND u.val = ?`
      : `u.t = ${TYPE.USER} AND tok.val = ?`;
    const whereParam = username || jwtToken;

    const { rows: rows } = await execSql(pool, `SELECT u.id uid, u.val uname, tok.id tok_id, tok.val tok_val, xsrf.id xsrf_id, xsrf.val xsrf_val
       FROM \`${db}\` u
       LEFT JOIN \`${db}\` tok  ON tok.up  = u.id AND tok.t  = ${TYPE.TOKEN}
       LEFT JOIN \`${db}\` xsrf ON xsrf.up = u.id AND xsrf.t = ${TYPE.XSRF}
       WHERE ${whereClause} LIMIT 1`, [whereParam], { label: 'post_db_jwt_select' });

    if (!rows.length) {
      return res.status(200).json([{ error: 'JWT verification failed' }]);
    }

    const user = rows[0];

    // PHP authJWT: updateTokens() regenerates token+xsrf, sets cookie
    const { token: newToken, xsrf: newXsrf } = await updateTokens(pool, db, {
      uid: user.uid,
      tok: user.tok_id,
      xsrf: user.xsrf_id,
      act: null,
    });

    res.cookie(db, newToken, { path: '/', httpOnly: false });

    logger.info('[Legacy jwt] JWT validated', { db, uid: user.uid });

    // PHP authJWT() response: {_xsrf, token, id, user}
    // id is a string (PHP mysqli_fetch_array returns strings)
    res.status(200).json({ _xsrf: newXsrf, token: newToken, id: String(user.uid), user: user.uname });
  } catch (error) {
    logger.error('[Legacy jwt] Error', { error: error.message, db });
    res.status(200).json([{ error: 'JWT verification failed' }]);
  }
});

/**
 * confirm - Confirm password change via reset link
 * GET/POST /:db/confirm
 *
 * PHP: index.php lines 7704-7713
 * Params: u=username, o=old_pwd_hash, p=new_pwd_hash
 * On success: login(db, u, "confirm") → API: {"message":"confirm","db":db,"login":u,"details":""}
 * On failure: login(db, u_encoded, "obsolete") → API: {"message":"obsolete","db":db,"login":u,"details":""}
 *
 * The GET handler is needed because the reset email sends a clickable link with query params.
 */
async function handleConfirm(req, res) {
  const { db } = req.params;
  // Accept params from both query string (GET from email link) and body (POST)
  const u = (req.query.u || req.body?.u || '').toLowerCase().trim();
  const o = req.query.o || req.body?.o || '';
  const p = req.query.p || req.body?.p || '';

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database' }]);
  }

  try {
    logger.info('[Legacy confirm] Request', { db, u });

    if (u && o && p) {
      const pool = getPool();
      // PHP: SELECT pwd.id FROM $z pwd, $z u WHERE pwd.up=u.id AND pwd.t=PASSWORD AND u.t=USER AND u.val='u' AND pwd.val='o'
      const { rows: [row] } = await execSql(pool, `SELECT pwd.id FROM \`${db}\` pwd, \`${db}\` u WHERE pwd.up=u.id AND pwd.t=? AND u.t=? AND u.val=? AND pwd.val=?`, [TYPE.PASSWORD, TYPE.USER, u, o], { label: 'u_select' });
      if (row) {
        // PHP: UPDATE $z SET val='p' WHERE id=$row[0]
        await execSql(pool, `UPDATE \`${db}\` SET val=? WHERE id=?`, [p, row.id], { label: 'u_update' });
        // PHP: login($z, $_REQUEST["u"], "confirm") → in API mode: {"message":"confirm","db":db,"login":u,"details":""}
        return res.status(200).json({ message: 'confirm', db, login: u, details: '' });
      }
    }

    // PHP: login($z, urlencode($_REQUEST["u"]), "obsolete")
    return res.status(200).json({ message: 'obsolete', db, login: encodeURIComponent(u), details: '' });
  } catch (error) {
    logger.error('[Legacy confirm] Error', { error: error.message, db });
    return res.status(200).json({ message: 'obsolete', db, login: encodeURIComponent(u), details: '' });
  }
}
router.get('/:db/confirm', handleConfirm);
router.post('/:db/confirm', handleConfirm);

/**
 * login - Login page action (redirect)
 * GET/POST /:db/login
 */
router.all('/:db/login', (req, res) => {
  const { db } = req.params;

  // Redirect to main database page (which will show login if not authenticated)
  res.redirect(`/${db}`);
});

/**
 * _new_db - Create new database (only from 'my' database)
 * GET/POST /my/_new_db
 */
router.all('/my/_new_db', async (req, res) => {
  const newDbName = req.query.db || req.body.db;
  const template = req.query.template || req.body.template || 'empty';
  const description = req.body.descr || '';

  // Validate new database name (3-15 chars, starts with letter)
  const USER_DB_MASK = /^[a-z][a-z0-9]{2,14}$/i;
  if (!newDbName || !USER_DB_MASK.test(newDbName)) {
    return res.status(200).json([{ error: 'Invalid database name. Must be 3-15 characters, starting with a letter.' }]);
  }

  // Check for reserved names
  const reservedNames = ['my', 'admin', 'root', 'system', 'test', 'demo', 'api', 'health'];
  if (reservedNames.includes(newDbName.toLowerCase())) {
    return res.status(200).json([{ error: `Database name "${newDbName}" is reserved` }]);
  }

  try {
    const pool = getPool();

    // Check if database name is already registered (PHP: isDbVacant)
    if (!(await isDbVacant(pool, 'my', newDbName))) {
      return res.status(200).json([{ error: `Database "${newDbName}" already exists` }]);
    }

    // Create new database table with standard schema
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${newDbName} (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        up BIGINT UNSIGNED NOT NULL DEFAULT 0,
        ord INT UNSIGNED NOT NULL DEFAULT 1,
        t BIGINT UNSIGNED NOT NULL DEFAULT 0,
        val TEXT,
        INDEX idx_up (up),
        INDEX idx_t (t),
        INDEX idx_up_t (up, t)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await execSql(pool, createTableQuery, [], { label: 'post_db_confirm_query' });

    // PHP parity: if template is specified and exists, copy structure from template DB
    let copiedFromTemplate = false;
    if (template && template !== 'empty' && isValidDbName(template)) {
      try {
        // Verify template table exists
        const { rows: tmplExists } = await execSql(pool, `SHOW TABLES LIKE ?`, [template], { label: 'post_db_confirm_show' });
        if (tmplExists.length > 0) {
          // Copy all metadata rows (up=0 = type definitions) from template
          // This copies type structure without instance data
          await execSql(pool, `
            INSERT INTO \`${newDbName}\` (id, up, ord, t, val)
            SELECT id, up, ord, t, val FROM \`${template}\` WHERE up = 0
          `, [], { label: 'post_db_confirm_insert' });
          // Copy requisite definitions (children of type definitions, i.e. rows whose up
          // is a metadata row). These define the schema/attributes for each type.
          await execSql(pool, `
            INSERT IGNORE INTO \`${newDbName}\` (id, up, ord, t, val)
            SELECT child.id, child.up, child.ord, child.t, child.val
            FROM \`${template}\` child
            JOIN \`${template}\` parent ON parent.id = child.up AND parent.up = 0
            WHERE child.up != 0
          `, [], { label: 'post_db_confirm_insert' });
          copiedFromTemplate = true;
          logger.info('[Legacy _new_db] Copied structure from template', { template, newDb: newDbName });
        }
      } catch (tmplErr) {
        logger.warn('[Legacy _new_db] Template copy failed, falling back to defaults', { template, error: tmplErr.message });
      }
    }

    if (!copiedFromTemplate) {
      // Initialize with basic types (similar to PHP template)
      const initQueries = [
        // Base types
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (1, 0, 1, 1, 'Объект')`,
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (8, 0, 2, 8, 'Строка')`,
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (12, 0, 3, 12, 'Текст')`,
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (13, 0, 4, 13, 'Число')`,
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (9, 0, 5, 9, 'Дата')`,
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (4, 0, 6, 4, 'Дата и время')`,
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (11, 0, 7, 11, 'Да/Нет')`,
        // User type
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (18, 0, 10, 8, 'Пользователь')`,
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (20, 18, 1, 6, ':!NULL:Пароль')`,
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (30, 18, 2, 8, 'Телефон')`,
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (41, 18, 3, 8, 'Email')`,
        // Role type
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (42, 0, 11, 8, 'Роль')`,
        // Token/Session types
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (125, 0, 12, 8, 'Токен')`,
        `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (40, 0, 13, 8, 'XSRF')`,
      ];

      for (const initQuery of initQueries) {
        try {
          await execSql(pool, initQuery, [], { label: 'query_query' });
        } catch (e) {
          // Ignore duplicate key errors
          if (!e.message.includes('Duplicate')) {
            logger.warn('[Legacy _new_db] Init query error', { error: e.message });
          }
        }
      }
    }

    // Get user ID from token cookie (PHP: $GLOBALS["GLOBAL_VARS"]["user_id"])
    const token = req.cookies.my || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    let userId = 0;
    let recordId = 0;

    if (token) {
      try {
        const { rows: userRows } = await execSql(pool, `SELECT u.id FROM my u JOIN my tok ON tok.up = u.id AND tok.t = ${TYPE.TOKEN} WHERE tok.val = ? LIMIT 1`, [token], { label: 'query_select' });
        if (userRows.length > 0) {
          userId = userRows[0].id;

          // PHP: $id = Insert($GLOBALS["GLOBAL_VARS"]["user_id"], 1, DATABASE, $db, "Register extra DB");
          const { rows: insertResult } = await execSql(pool, `INSERT INTO my (up, ord, t, val) VALUES (?, 1, ${TYPE.DATABASE}, ?)`, [userId, newDbName.toLowerCase()], { label: 'query_insert' });
          recordId = insertResult.insertId;

          // PHP also inserts date and template info
          await execSql(pool, `INSERT INTO my (up, ord, t, val) VALUES (?, 1, 275, ?)`, [recordId, new Date().toISOString().slice(0, 10).replace(/-/g, '')], { label: 'query_insert' });
          await execSql(pool, `INSERT INTO my (up, ord, t, val) VALUES (?, 1, 283, ?)`, [recordId, template], { label: 'query_insert' });
          if (description) {
            await execSql(pool, `INSERT INTO my (up, ord, t, val) VALUES (?, 1, 276, ?)`, [recordId, description], { label: 'query_insert' });
          }
        }
      } catch (e) {
        logger.warn('[Legacy _new_db] Failed to register DB in my table', { error: e.message });
      }
    }

    logger.info('[Legacy _new_db] Database created', { dbName: newDbName, template, userId, recordId });

    // PHP: api_dump(json_encode(array("status"=>"Ok","id"=>$id)), "_new_db.json");
    // id should be the insert ID from the my table, or fall back to database name if no auth
    res.json({
      status: 'Ok',
      id: recordId || newDbName,
    });
  } catch (error) {
    logger.error('[Legacy _new_db] Error', { error: error.message, dbName: newDbName });
    res.status(200).json([{ error: error.message  }]);
  }
});

// ============================================================================
// Phase 3: File Management Endpoints
// ============================================================================

/**
 * File upload endpoint — saves uploaded file to download/{db}/ like PHP does.
 * PHP: move_uploaded_file($_FILES['file']['tmp_name'], "download/$z/".$filename)
 * POST /:db/upload
 */
function createDiskUpload(db) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(legacyPath, 'download', db);
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // Sanitize filename: strip path separators, reject traversal attempts
      const safeName = path.basename(file.originalname).replace(/[/\\]/g, '_');
      cb(null, safeName);
    },
  });
  return multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    fileFilter: (req, file, cb) => {
      // Basic MIME / extension allow-list matching PHP behaviour
      const allowed = /\.(pdf|doc|docx|xls|xlsx|csv|txt|png|jpg|jpeg|gif|zip|rar|7z|odt|ods)$/i;
      if (!allowed.test(file.originalname)) {
        return cb(new Error('Wrong file extension!'));
      }
      cb(null, true);
    },
  });
}

router.post('/:db/upload', legacyAuthMiddleware, (req, res, next) => {
  const { db } = req.params;
  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database' }]);
  }

  // PHP parity: RepoGrant() must return WRITE for uploads
  const { grants, username } = req.legacyUser || {};
  const grant = repoGrant(grants || {}, db, username || '');
  if (grant !== 'WRITE') {
    logger.warn('[Legacy upload] Repo grant denied', { db, username, grant });
    return res.status(200).json([{ error: 'Insufficient permissions to access this workplace' }]);
  }

  // Instantiate multer with disk storage for this specific db
  createDiskUpload(db).single('file')(req, res, (err) => {
    if (err) {
      logger.error('[Legacy upload] Multer error', { error: err.message, db });
      return res.status(200).json([{ error: err.message }]);
    }
    next();
  });
}, async (req, res) => {
  const { db } = req.params;

  if (!req.file) {
    return res.status(200).json([{ error: 'No file uploaded' }]);
  }

  // MIME-type verification using file magic bytes (PHP uses finfo_file)
  // Read first 12 bytes to identify file type
  const MIME_SIGNATURES = [
    { ext: ['.pdf'],                       magic: [0x25, 0x50, 0x44, 0x46] },              // %PDF
    { ext: ['.png'],                       magic: [0x89, 0x50, 0x4E, 0x47] },              // \x89PNG
    { ext: ['.jpg', '.jpeg'],             magic: [0xFF, 0xD8, 0xFF] },                     // JPEG
    { ext: ['.gif'],                       magic: [0x47, 0x49, 0x46, 0x38] },              // GIF8
    { ext: ['.zip', '.docx', '.xlsx', '.odt', '.ods', '.rar'],
                                           magic: [0x50, 0x4B, 0x03, 0x04] },              // PK (ZIP-based)
    { ext: ['.rar'],                       magic: [0x52, 0x61, 0x72, 0x21] },              // Rar!
    { ext: ['.7z'],                        magic: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] }, // 7z
    { ext: ['.txt', '.csv'],              magic: null },                                    // text — allow any
    { ext: ['.doc', '.xls'],              magic: [0xD0, 0xCF, 0x11, 0xE0] },              // OLE (MS legacy)
  ];

  const fileExt = path.extname(req.file.originalname).toLowerCase();
  const filePath = req.file.path;

  try {
    const fd = fs.openSync(filePath, 'r');
    const headerBuf = Buffer.alloc(12);
    fs.readSync(fd, headerBuf, 0, 12, 0);
    fs.closeSync(fd);

    const sig = MIME_SIGNATURES.find(s => s.ext.includes(fileExt));
    if (sig && sig.magic !== null) {
      const matches = sig.magic.every((byte, i) => headerBuf[i] === byte);
      if (!matches) {
        fs.unlinkSync(filePath); // Remove the invalid file
        logger.warn('[Legacy upload] MIME mismatch', { db, filename: req.file.originalname, fileExt });
        return res.status(200).json([{ error: `File content does not match extension ${fileExt}` }]);
      }
    }
  } catch (mimeErr) {
    logger.warn('[Legacy upload] MIME check failed', { error: mimeErr.message });
    // Non-fatal: continue if we can't read the file header
  }

  logger.info('[Legacy upload] File saved', { db, filename: req.file.filename, size: req.file.size });

  // PHP redirects back to dir_admin after upload; API clients receive confirmation
  res.status(200).json({
    status: 'Ok',
    filename: req.file.filename,
    path: `/download/${db}/`,
  });
});

/**
 * File download endpoint
 * GET /:db/download/:filename
 */
router.get('/:db/download/:filename', legacyAuthMiddleware, async (req, res) => {
  const { db, filename } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  // PHP parity: RepoGrant() — any non-BARRED level (READ or WRITE) permits download
  const { grants, username } = req.legacyUser || {};
  const grant = repoGrant(grants || {}, db, username || '');
  if (grant === 'BARRED') {
    logger.warn('[Legacy download] Repo grant denied', { db, username, grant });
    return res.status(200).json([{ error: 'Insufficient permissions to access this workplace' }]);
  }

  try {
    const baseDir = path.join(legacyPath, 'download', db);
    const filePath = safePath(baseDir, filename);

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return res.status(404).json([{ error: 'File not found' }]);
    }

    logger.info('[Legacy download] File download', { db, filename });

    res.download(filePath, path.basename(filePath));
  } catch (error) {
    if (error.message === 'Invalid path') {
      return res.status(200).json([{ error: 'Invalid filename'  }]);
    }
    logger.error('[Legacy download] Error', { error: error.message, db });
    res.status(200).json([{ error: 'Download failed'  }]);
  }
});

/**
 * Directory listing endpoint
 * GET /:db/dir_admin
 */
router.get('/:db/dir_admin', legacyAuthMiddleware, async (req, res) => {
  const { db } = req.params;
  const { download, add_path, gf } = req.query;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  // PHP parity: RepoGrant() check before dir_admin (index.php:6610-6612)
  const { grants, username } = req.legacyUser || {};
  const grant = repoGrant(grants || {}, db, username || '');
  if (grant === 'BARRED') {
    logger.warn('[Legacy dir_admin] Repo grant denied', { db, username, grant });
    return res.status(200).json([{ error: 'Insufficient permissions to access this workplace' }]);
  }

  try {
    // PHP: download=1 → show download/{db}/ folder; download=0 or absent → templates/custom/{db}/
    const useDownload = download !== undefined && download !== '0' && download !== 'false';
    const folder = useDownload ? 'download' : 'templates';
    const basePath = useDownload
      ? path.join(legacyPath, 'download', db)
      : path.join(legacyPath, 'templates', 'custom', db);

    // Resolve add_path safely — safePath prevents traversal including URL-encoded variants
    let fullPath;
    try {
      fullPath = safePath(basePath, add_path || '');
    } catch {
      return res.status(200).json([{ error: 'Invalid path'  }]);
    }

    // Handle file download request
    if (gf) {
      let filePath;
      try {
        filePath = safePath(fullPath, gf);
      } catch {
        return res.status(200).json([{ error: 'Invalid filename'  }]);
      }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return res.download(filePath, path.basename(filePath));
      }
      return res.status(404).json([{ error: 'File not found' }]);
    }

    // Create directory if it doesn't exist
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }

    // List directory contents
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const dirs = [];
    const files = [];

    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..') continue;

      if (entry.isDirectory()) {
        dirs.push({ name: entry.name, type: 'directory' });
      } else {
        const stats = fs.statSync(path.join(fullPath, entry.name));
        files.push({
          name: entry.name,
          type: 'file',
          size: stats.size,
          sizeFormatted: normalSize(stats.size),
          modified: stats.mtime.toISOString()
        });
      }
    }

    logger.info('[Legacy dir_admin] Directory listing', { db, path: fullPath, dirs: dirs.length, files: files.length });

    res.json({
      success: true,
      folder,
      path: fullPath,
      add_path: add_path || '',
      directories: dirs,
      files
    });
  } catch (error) {
    logger.error('[Legacy dir_admin] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

// ============================================================================
// Phase 4: Full Report System with Filtering (remaining 10%)
// ============================================================================

const MAX_REPORT_SUBQUERY_DEPTH = 10;

/**
 * Build a SELECT SQL string for a compiled report (no execution, no LIMIT).
 * Used to produce subquery SQL when a report is referenced via [report_name].
 *
 * PHP equivalent: when Get_block_data($sub_query, FALSE) is called, the report
 * is compiled and its SQL stored in GLOBALS["STORED_REPS"][$id]["sql"].
 */
async function buildReportSubquerySQL(pool, db, report, depth = 0) {
  if (!report || !report.parentType || report.parentType <= 0) return null;

  const AGGR_FUNCS = new Set(['AVG', 'COUNT', 'MAX', 'MIN', 'SUM', 'GROUP_CONCAT']);
  const selectParts = ['a.id', 'a.val AS main_val'];
  const joinParts   = [];

  for (const col of report.columns) {
    if (!col.reqTypeId || isNaN(col.reqTypeId)) continue;

    const rawExpr = col.isMainCol ? 'a.val' : `\`${col.alias}\`.val`;
    let fieldExpr = rawExpr;
    if (col.formula) {
      // Resolve [report_name] refs in the formula before processing [THIS]
      let resolvedFormula = await resolveReportSubqueries(pool, db, col.formula, depth);
      fieldExpr = resolvedFormula.includes('[THIS]')
        ? resolvedFormula.replace(/\[THIS\]/g, rawExpr)
        : resolvedFormula;
    }
    if (col.func && AGGR_FUNCS.has(col.func)) {
      const bt = REV_BASE_TYPE[col.baseType] || 'SHORT';
      if (col.func === 'GROUP_CONCAT') {
        fieldExpr = `GROUP_CONCAT(DISTINCT ${fieldExpr})`;
      } else if (bt === 'NUMBER' || bt === 'SIGNED' || bt === 'DATETIME') {
        fieldExpr = `${col.func}(CAST(${fieldExpr} AS DOUBLE))`;
      } else {
        fieldExpr = `${col.func}(${fieldExpr})`;
      }
    } else if (col.func && !isAbnFunction(col.func)) {
      // Skip abn_* functions — they are post-processing, not SQL functions
      fieldExpr = `${col.func}(${fieldExpr})`;
    } else if (col.func && ABN_SQL_FIELD_FUNCS.has(col.func.toUpperCase())) {
      // SQL-level abn_* functions that change which column is selected
      const upper = col.func.toUpperCase();
      if (upper === 'ABN_ID')       fieldExpr = col.isMainCol ? 'a.id'  : `\`${col.alias}\`.id`;
      else if (upper === 'ABN_UP')  fieldExpr = col.isMainCol ? 'a.up'  : `\`${col.alias}\`.up`;
      else if (upper === 'ABN_TYP') fieldExpr = col.isMainCol ? 'a.t'   : `\`${col.alias}\`.t`;
      else if (upper === 'ABN_ORD') fieldExpr = col.isMainCol ? 'a.ord' : `\`${col.alias}\`.ord`;
    }

    selectParts.push(`${fieldExpr} AS \`${col.alias}\``);
    if (!col.isMainCol) {
      joinParts.push(
        `LEFT JOIN \`${db}\` \`${col.alias}\`` +
        ` ON \`${col.alias}\`.up = a.id AND \`${col.alias}\`.t = ${col.reqTypeId}`
      );
    }
  }

  const parts = [
    `SELECT ${selectParts.join(', ')}`,
    `FROM \`${db}\` a`,
    ...joinParts,
    `WHERE a.t = ${parseInt(report.parentType, 10)} AND a.up != 0`,
  ];

  // GROUP BY if report uses aggregates
  if (report.hasAggregates) {
    const groupParts = [];
    for (const col of report.columns) {
      if (col.hidden || col.isAggregate) continue;
      if (col.formula && /\b(SUM|AVG|COUNT|MIN|MAX|GROUP_CONCAT)\s*\(/i.test(col.formula)) continue;
      const expr = col.isMainCol ? 'a.val' : `\`${col.alias}\`.val`;
      groupParts.push(expr);
    }
    if (groupParts.length > 0) parts.push(`GROUP BY ${groupParts.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Resolve [report_name] references in a SQL string by replacing them with
 * compiled subquery SQL wrapped in parentheses.
 *
 * PHP equivalent: lines 2941-3021 of index.php — splits on '[' to find
 * report name tokens, calls Get_block_data(name, FALSE), and replaces
 * [name] / '[name]' with (compiled_sql) across all SQL parts.
 *
 * @param {object} pool    - DB pool
 * @param {string} db      - Database name
 * @param {string} sqlStr  - SQL string potentially containing [report_name] refs
 * @param {number} depth   - Current recursion depth (for infinite-loop guard)
 * @returns {Promise<string>} SQL with subqueries resolved
 */
async function resolveReportSubqueries(pool, db, sqlStr, depth = 0) {
  if (depth >= MAX_REPORT_SUBQUERY_DEPTH) {
    logger.warn('[Report] Subquery depth limit reached', { depth, db });
    return sqlStr;
  }

  // Find all [name] references (excluding [THIS] which is handled separately)
  const refPattern = /\[([^\]]+)\]/g;
  const refs = new Set();
  let match;
  while ((match = refPattern.exec(sqlStr)) !== null) {
    const name = match[1];
    if (name === 'THIS') continue;
    refs.add(name);
  }

  if (refs.size === 0) return sqlStr;

  let result = sqlStr;

  for (const reportName of refs) {
    // Look up report by name
    const { rows: nameRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE val = ? AND t = ${TYPE.REPORT} LIMIT 1`, [reportName], { label: 'resolveReportSubqueries_select' });
    if (nameRows.length === 0) {
      logger.warn('[Report] Subquery reference not found', { reportName, db });
      continue;
    }

    const subReportId = nameRows[0].id;
    const subReport = await compileReport(pool, db, subReportId);
    if (!subReport) {
      logger.warn('[Report] Failed to compile subquery report', { reportName, subReportId, db });
      continue;
    }

    let subSQL = await buildReportSubquerySQL(pool, db, subReport, depth + 1);
    if (!subSQL) {
      logger.warn('[Report] Failed to build subquery SQL', { reportName, subReportId, db });
      continue;
    }

    // Recursively resolve any nested [report_name] references in the subquery
    subSQL = await resolveReportSubqueries(pool, db, subSQL, depth + 1);

    const replacement = `(${subSQL})`;

    // Replace both '[name]' (quoted) and [name] (unquoted) — PHP does both
    result = result.replace(new RegExp(`'\\[${escapeRegex(reportName)}\\]'`, 'g'), replacement);
    result = result.replace(new RegExp(`\\[${escapeRegex(reportName)}\\]`, 'g'), replacement);

    logger.debug('[Report] Resolved subquery', { reportName, subReportId, depth });
  }

  return result;
}

/** Escape a string for use in a RegExp */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * HintNeeded — MySQL query optimizer hint for JOINs on reference requisites.
 * PHP parity: index.php lines 535–558.
 *
 * When a CROSS JOIN for reference resolution has no selective filter — or its
 * filter is a negation (!) or wildcard (%) — the MySQL optimizer may choose a
 * suboptimal plan.  In those cases we return true so callers add
 * USE INDEX (PRIMARY) to force the primary-key lookup path.
 *
 * Overload 1 — filter-value based (for constructWhere / object list):
 *   hintNeeded(filterValue)
 *   @param {string|undefined} filterValue — the active filter string, if any
 *
 * Overload 2 — report-column based (for executeReport):
 *   hintNeeded(col, requestFilters)
 *   @param {object}  col             — compiled report column (from compileReport)
 *   @param {object}  requestFilters  — runtime filters from the request (key → {from,to,eq,like})
 *
 * @returns {boolean} true when USE INDEX (PRIMARY) should be added to the CROSS JOIN
 */
function hintNeeded(colOrValue, requestFilters) {
  let filterVal;

  if (typeof colOrValue === 'object' && colOrValue !== null) {
    // ── Overload 2: report column ──────────────────────────────────────
    const col = colOrValue;
    const filters = requestFilters || {};

    // 1. Check request-level filters (PHP: $_REQUEST["FR_$str"] / $_REQUEST["TO_$str"])
    if (col.colName) {
      const normName = col.colName.replace(/ /g, '_');
      const reqFilter = filters[normName] || filters[col.alias] || filters[col.name];
      if (reqFilter) {
        filterVal = reqFilter.from || reqFilter.to || reqFilter.eq || reqFilter.like;
      }
    } else {
      const reqFilter = filters[col.alias] || filters[col.name];
      if (reqFilter) {
        filterVal = reqFilter.from || reqFilter.to || reqFilter.eq || reqFilter.like;
      }
    }

    // 2. Check stored filter definitions (PHP: $GLOBALS["STORED_REPS"][$id][REP_COL_FROM/TO][$k])
    if (filterVal === undefined || filterVal === null || filterVal === '') {
      filterVal = col.storedFrom || col.storedTo;
    }
  } else {
    // ── Overload 1: raw filter value ───────────────────────────────────
    filterVal = colOrValue;
  }

  // 3. If a selective (positive, non-wildcard) filter exists, hint is NOT needed
  if (filterVal !== undefined && filterVal !== null && filterVal !== '') {
    const s = String(filterVal);
    if (s.length > 0 && s[0] !== '!' && s[0] !== '%') {
      logger.debug('[HintNeeded] Hint NOT needed', { filter: s });
      return false;
    }
  }

  // 4. No selective filter → hint IS needed
  logger.debug('[HintNeeded] Hint needed (no selective filter)');
  return true;
}

/**
 * Compile a report — load columns, joins, and metadata.
 *
 * PHP data model for reports:
 *   REPORT row:   {id=R, up=ParentTypeId, t=22, val='Report Name'}
 *   REP_COLS row: {id=C, up=R, t=28, val='<reqTypeId>', ord=N}
 *     val = the REQUISITE ROW ID (or parent type ID for the main value column)
 *     JOIN on: LEFT JOIN db c_C ON c_C.up=a.id AND c_C.t=val
 *   REP_JOIN row: {id=J, up=R, t=44, val='<typeId>', ord=N}
 *     Defines an additional join expression
 */
async function compileReport(pool, db, reportId) {
  // PHP REP_COL_* sub-row type constants (children of each REP_COLS row)
  const REP_COL_FUNC    = 63;   // aggregate / wrapper function (SUM, AVG, COUNT, etc.)
  const REP_COL_TOTAL   = 65;   // totals row function
  const REP_COL_NAME    = 100;  // column display name override
  const REP_COL_FORMULA = 101;  // calculatable formula expression
  const REP_COL_FROM    = 102;  // stored filter FROM value (PHP: $GLOBALS["STORED_REPS"][$id][REP_COL_FROM][$k])
  const REP_COL_TO      = 103;  // stored filter TO value   (PHP: $GLOBALS["STORED_REPS"][$id][REP_COL_TO][$k])
  const REP_COL_HIDE    = 107;  // hidden column flag

  const report = {
    id: reportId,
    header: '',
    head: [],
    columns: [],
    types: {},
    names: {},
    baseOut: {},
    joins: [],
    filters: {},
    totals: {},
    rownum: 0,
    parentType: 0,
    hasAggregates: false,       // true when at least one column uses an aggregate function
    params: {},                 // PHP: $GLOBALS["STORED_REPS"][$id]["params"] — keyed by type id (e.g. 262 = REP_WHERE)
    repParams: {},              // PHP: $GLOBALS["STORED_REPS"][$id]["rep_params"] — keyed by param name
    refTyp: {},                 // PHP: $GLOBALS["STORED_REPS"][$id]["ref_typ"] — { [reqTypeId]: baseType } for ref columns
  };

  try {
    // Get report definition row
    const { rows: reportRows } = await execSql(pool, `SELECT id, val, t, up FROM \`${db}\` WHERE id = ?`, [reportId], { label: 'compileReport_select' });

    if (reportRows.length === 0) return null;

    report.header     = reportRows[0].val;
    // PHP: report.up = type this report is "about" (its parent type)
    report.parentType = parseInt(reportRows[0].up, 10) || 0;

    // Get REP_COLS rows.
    // val = requisite type ID (the JOIN key); we look up its display name from the type row.
    const { rows: colRows } = await execSql(pool, `SELECT
         col.id,
         col.val  AS req_type_raw,
         col.ord,
         typ.val  AS col_name,
         typ.t    AS col_base_t
       FROM \`${db}\` col
       LEFT JOIN \`${db}\` typ ON typ.id = CAST(col.val AS UNSIGNED)
       WHERE col.up = ? AND col.t = ${TYPE.REP_COLS}
       ORDER BY col.ord`, [reportId], { label: 'compileReport_select' });

    for (const col of colRows) {
      const reqTypeId = parseInt(col.req_type_raw, 10);
      // Label: prefer the looked-up type name, fall back to raw val
      const colLabel  = col.col_name || col.req_type_raw || String(reqTypeId);
      const alias     = `c${col.id}`;

      report.head.push(colLabel);
      report.names[report.head.length - 1]   = alias;
      report.types[report.head.length - 1]   = reqTypeId;
      report.baseOut[report.head.length - 1] = col.col_base_t || TYPE.CHARS;

      const colIsRef = !REV_BASE_TYPE[col.col_base_t] && (col.col_base_t || 0) > 0;

      report.columns.push({
        id:         col.id,
        name:       colLabel,
        alias,
        reqTypeId,          // ← which type to LEFT JOIN on
        isMainCol:  reqTypeId === report.parentType,  // main object's own val
        baseType:   col.col_base_t || TYPE.CHARS,
        isRef:      colIsRef,
        order:      col.ord,
      });

      // PHP: $GLOBALS["STORED_REPS"][$id]["ref_typ"][$reqTypeId] = col_base_t
      if (colIsRef) {
        report.refTyp[String(reqTypeId)] = col.col_base_t;
      }
    }

    // ── Fetch column sub-properties: REP_COL_FUNC, REP_COL_NAME, REP_COL_FORMULA, REP_COL_FROM, REP_COL_TO, REP_COL_HIDE, REP_COL_TOTAL ──
    // These are child rows of each REP_COLS row with specific `t` values.
    // PHP stores them in $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key], etc.
    const AGGR_FUNCS = new Set(['AVG', 'COUNT', 'MAX', 'MIN', 'SUM', 'GROUP_CONCAT']);
    if (report.columns.length > 0) {
      const colIds = report.columns.map(c => c.id);
      const colPh  = colIds.map(() => '?').join(',');
      const { rows: subRows } = await execSql(pool, `SELECT up, t, val FROM \`${db}\`
         WHERE up IN (${colPh}) AND t IN (${REP_COL_FUNC}, ${REP_COL_TOTAL}, ${REP_COL_NAME}, ${REP_COL_FORMULA}, ${REP_COL_FROM}, ${REP_COL_TO}, ${REP_COL_HIDE})`, colIds, { label: 'compileReport_select' });
      for (const sr of subRows) {
        const col = report.columns.find(c => c.id === sr.up);
        if (!col) continue;
        const tNum = parseInt(sr.t, 10);
        if (tNum === REP_COL_FUNC && sr.val) {
          col.func = sr.val.trim().toUpperCase();
          if (AGGR_FUNCS.has(col.func)) {
            col.isAggregate = true;
            report.hasAggregates = true;
          }
        } else if (tNum === REP_COL_NAME && sr.val) {
          col.colName = sr.val.trim();         // PHP: $GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$k]
        } else if (tNum === REP_COL_FORMULA && sr.val) {
          col.formula = sr.val.trim();
        } else if (tNum === REP_COL_FROM && sr.val) {
          col.storedFrom = sr.val.trim();      // PHP: $GLOBALS["STORED_REPS"][$id][REP_COL_FROM][$k]
        } else if (tNum === REP_COL_TO && sr.val) {
          col.storedTo = sr.val.trim();        // PHP: $GLOBALS["STORED_REPS"][$id][REP_COL_TO][$k]
        } else if (tNum === REP_COL_HIDE) {
          col.hidden = true;
        } else if (tNum === REP_COL_TOTAL && sr.val) {
          col.totalFunc = sr.val.trim().toUpperCase();
        }
      }
    }

    // ── Detect array-type (multi) requisites — PHP parity (index.php:1917-1939) ──
    // Query all requisites of object types referenced by report columns.
    // If a requisite's val attribute contains ':MULTI:', the column produces
    // one-to-many rows and needs GROUP_CONCAT or DISTINCT handling.
    if (report.columns.length > 0) {
      const colReqTypeIds = [...new Set(report.columns.filter(c => c.reqTypeId).map(c => c.reqTypeId))];
      if (colReqTypeIds.length > 0) {
        const reqPh = colReqTypeIds.map(() => '?').join(',');
        // PHP: SELECT ... col_def.up=0 ? col_def.id : col_def.up → the parent type
        // We find requisites of each column's parent type and check for :MULTI: in val
        const { rows: multiRows } = await execSql(pool, `SELECT DISTINCT
             CASE WHEN col_def.up = 0 THEN col_def.id ELSE col_def.up END AS typ,
             reqs.id AS req,
             reqs.val AS attr,
             reqs.t AS req_t
           FROM \`${db}\` col_def
           LEFT JOIN \`${db}\` reqs ON reqs.up = CASE WHEN col_def.up = 0 THEN col_def.id ELSE col_def.up END
           WHERE col_def.id IN (${reqPh})
             AND reqs.val LIKE '%:MULTI:%'`, colReqTypeIds, { label: 'query_select' });
        // Build a set of parent type IDs that have multi-valued requisites
        const multiParentTypes = new Set();
        for (const mr of multiRows) {
          if (mr.typ) multiParentTypes.add(parseInt(mr.typ, 10));
        }
        // Mark columns whose parent type has at least one multi requisite
        // PHP: when :MULTI: is detected, $distinct = "DISTINCT" is set for the whole query
        // and the column can produce multiple rows per main object.
        // We mark the column so executeReport can auto-apply GROUP_CONCAT.
        for (const col of report.columns) {
          const parentType = col.reqTypeId;
          if (parentType && multiParentTypes.has(parentType)) {
            col.isMulti = true;
          }
        }
        // Also check if any column's reqTypeId itself is a multi-valued requisite
        // (the requisite row's own val contains :MULTI:)
        const { rows: directMultiRows } = await execSql(pool, `SELECT id, val FROM \`${db}\` WHERE id IN (${reqPh}) AND val LIKE '%:MULTI:%'`, colReqTypeIds, { label: 'query_select' });
        for (const dm of directMultiRows) {
          const dmId = parseInt(dm.id, 10);
          for (const col of report.columns) {
            if (col.reqTypeId === dmId) col.isMulti = true;
          }
        }
      }
    }

    // Get REP_JOIN rows (explicit additional joins)
    const { rows: joinRows } = await execSql(pool, `SELECT id, val, t FROM \`${db}\` WHERE up = ? AND t = ${TYPE.REP_JOIN}`, [reportId], { label: 'query_select' });

    for (const join of joinRows) {
      report.joins.push({
        id:     join.id,
        typeId: parseInt(join.val, 10) || 0,
        t:      join.t,
      });
    }

    // ── Load stored report parameters (REP_WHERE, REP_IFNULL, REP_LIMIT, etc.) ──
    // PHP: sub-rows of the report with t values like 262 (REP_WHERE), 113 (REP_IFNULL), etc.
    // These are child rows where col/t is NOT REP_COLS (28) and NOT REP_JOIN (44),
    // and the row has no base type (not a column definition).
    // PHP query at index.php:1784 loads everything under rep.up=$id, then categorizes:
    //   - if jn == REP_JOIN → join
    //   - if base || id → column
    //   - else → param (keyed by col = the type id, e.g. 262)
    // We load param-type rows: children of the report whose t is one of the known param types.
    const PARAM_TYPES = [
      TYPE.REP_WHERE,    // 262
      TYPE.REP_IFNULL,   // 113
      TYPE.REP_LIMIT,    // 134
      TYPE.REP_HREFS,    // 95
      TYPE.REP_URL,      // 97
      TYPE.REP_ALIAS,    // 265
      TYPE.REP_JOIN_ON,  // 266
    ];
    const paramPh = PARAM_TYPES.map(() => '?').join(',');
    const { rows: paramRows } = await execSql(pool, `SELECT r.t, r.val, r.ord,
              COALESCE(def_orig.val, def.val) AS param_name
       FROM \`${db}\` r
       LEFT JOIN \`${db}\` def ON def.id = r.t AND r.t != ${TYPE.REP_COLS}
       LEFT JOIN \`${db}\` def_orig ON def_orig.id = def.t
       WHERE r.up = ? AND r.t IN (${paramPh})
       ORDER BY r.ord`, [reportId, ...PARAM_TYPES], { label: 'query_select' });
    for (const pr of paramRows) {
      const typeId = parseInt(pr.t, 10);
      const val = pr.val || '';
      // PHP concatenates values for the same param type (multi-row params / tail rows)
      if (report.params[typeId] !== undefined) {
        report.params[typeId] += val;
      } else {
        report.params[typeId] = val;
      }
      // Also store by param name (PHP: rep_params keyed by resolved type name)
      if (pr.param_name) {
        if (report.repParams[pr.param_name] !== undefined) {
          report.repParams[pr.param_name] += val;
        } else {
          report.repParams[pr.param_name] = val;
        }
      }
    }

    logger.debug('[Report] Compiled report', {
      db, reportId,
      parentType: report.parentType,
      columns: report.columns.length,
      joins: report.joins.length,
      hasAggregates: report.hasAggregates,
      multiColumns: report.columns.filter(c => c.isMulti).map(c => c.alias),
      storedWhere: report.params[TYPE.REP_WHERE] || null,
      storedParams: Object.keys(report.repParams),
    });

  } catch (error) {
    logger.error('[Report] Error compiling report', { error: error.message, db, reportId });
    return null;
  }

  return report;
}

/**
 * Check whether a given type is a reference type within a compiled report.
 *
 * ### Signature mapping (PHP 3-param → Node 2-param)
 *
 * PHP signature (index.php:1750):
 * ```php
 * function isRef($id, $par, $typ) {
 *   if(isset($GLOBALS["STORED_REPS"][$id]["ref_typ"][$typ]))
 *     return $GLOBALS["STORED_REPS"][$id]["ref_typ"][$typ];
 *   return false;
 * }
 * ```
 *
 * | PHP param | Node equivalent           | Notes                                    |
 * |-----------|---------------------------|------------------------------------------|
 * | `$id`     | `report.id`               | Report ID, embedded in the report object |
 * | `$par`    | `report.parentType`       | Parent type, embedded in the report obj  |
 * | `$typ`    | `typ` (2nd param)         | Type ID to look up — kept as-is          |
 *
 * **Why the signature changed:** In PHP, `$id` is used to index into the
 * global `$GLOBALS["STORED_REPS"]` array, and `$par` is available on that
 * same stored entry but is never used inside the function body. In the Node
 * port, `compileReport()` returns a self-contained report object that already
 * carries `id`, `parentType`, and `refTyp` — so the caller passes the report
 * object directly instead of a bare ID. This collapses the first two PHP
 * parameters into a single `report` object, reducing the arity from 3 to 2.
 *
 * @see {@link https://github.com/unidel2035/integram-standalone/issues/336}
 *
 * @param {object} report - Compiled report object (from compileReport).
 *   Must contain `report.refTyp` — a map of type-ID → reference-target-type.
 * @param {number|string} typ - Type ID to check for reference status.
 * @returns {number|false} The reference target type ID, or `false` if `typ`
 *   is not a reference type in this report.
 */
function isRef(report, typ) {
  const key = String(typ);
  if (report && report.refTyp && report.refTyp[key] !== undefined) {
    return report.refTyp[key];
  }
  return false;
}

/**
 * Execute report with proper LEFT JOINs per column.
 *
 * PHP equivalent: builds one LEFT JOIN per REP_COLS column joining the db
 * table to itself on (child.up = main.id AND child.t = reqTypeId).
 *
 * Filters: keys are column aliases or names; values are {from, to, eq, like}.
 */
async function executeReport(pool, db, report, filters = {}, limit = 100, offset = 0, orderParam = null, _subqueryDepth = 0, userCtx = null) {
  const results = { data: [], totals: {}, rownum: 0 };

  try {
    if (!report.parentType || report.parentType <= 0) {
      logger.warn('[Report] No parentType — cannot build query', { reportId: report.id });
      return results;
    }

    // ── SELECT ────────────────────────────────────────────────────────────
    // Always include the main object id and val
    const selectParts = ['a.id', 'a.val AS main_val', 'a.up', 'a.ord'];
    const joinParts   = [];
    // Track which columns have aggregate functions (for GROUP BY construction)
    const AGGR_FUNCS  = new Set(['AVG', 'COUNT', 'MAX', 'MIN', 'SUM', 'GROUP_CONCAT']);

    for (const col of report.columns) {
      if (!col.reqTypeId || isNaN(col.reqTypeId)) continue;

      // Raw field expression before any function wrapping
      const rawExpr = col.isMainCol ? 'a.val' : `\`${col.alias}\`.val`;

      // Handle REP_COL_FORMULA: replace [THIS] with the raw field reference,
      // then resolve any [report_name] subquery references in the formula.
      let fieldExpr = rawExpr;
      if (col.formula) {
        let resolvedFormula = col.formula;

        // Resolve [report_name] subqueries in the formula (PHP parity)
        resolvedFormula = await resolveReportSubqueries(pool, db, resolvedFormula, _subqueryDepth);

        if (resolvedFormula.includes('[THIS]')) {
          fieldExpr = resolvedFormula.replace(/\[THIS\]/g, rawExpr);
        } else {
          // Pure formula (calculatable column) — use formula as-is
          fieldExpr = resolvedFormula;
        }
      }

      // Wrap in aggregate / wrapper function if REP_COL_FUNC is set
      // PHP: if func is in aggr_funcs → wrap + mark as aggregate; otherwise wrap but no grouping
      if (col.func && AGGR_FUNCS.has(col.func)) {
        const bt = REV_BASE_TYPE[col.baseType] || 'SHORT';
        if (col.func === 'GROUP_CONCAT') {
          fieldExpr = `GROUP_CONCAT(DISTINCT ${fieldExpr})`;
        } else if (bt === 'NUMBER' || bt === 'SIGNED' || bt === 'DATETIME') {
          fieldExpr = `${col.func}(CAST(${fieldExpr} AS DOUBLE))`;
        } else {
          fieldExpr = `${col.func}(${fieldExpr})`;
        }
      } else if (col.func && !isAbnFunction(col.func)) {
        // Non-aggregate function (e.g. LENGTH, UPPER) — just wrap
        // Skip abn_* functions — they are post-processing, not SQL functions
        fieldExpr = `${col.func}(${fieldExpr})`;
      } else if (col.func && ABN_SQL_FIELD_FUNCS.has(col.func.toUpperCase())) {
        // SQL-level abn_* functions that change which column is selected
        const upper = col.func.toUpperCase();
        if (upper === 'ABN_ID')       fieldExpr = col.isMainCol ? 'a.id'  : `\`${col.alias}\`.id`;
        else if (upper === 'ABN_UP')  fieldExpr = col.isMainCol ? 'a.up'  : `\`${col.alias}\`.up`;
        else if (upper === 'ABN_TYP') fieldExpr = col.isMainCol ? 'a.t'   : `\`${col.alias}\`.t`;
        else if (upper === 'ABN_ORD') fieldExpr = col.isMainCol ? 'a.ord' : `\`${col.alias}\`.ord`;
      }

      // ── Auto GROUP_CONCAT for array-type (multi) requisites (#233) ─────
      // PHP parity: when a column references a multi-valued requisite (one-to-many)
      // and has no explicit aggregate function, auto-wrap with GROUP_CONCAT to
      // flatten multiple values into a comma-separated string.
      // This prevents row multiplication and matches PHP Compile_Report behavior.
      if (col.isMulti && !col.isAggregate && !col.func) {
        fieldExpr = `GROUP_CONCAT(DISTINCT ${fieldExpr} SEPARATOR ', ')`;
        col.isAggregate = true;
        col._autoGroupConcat = true;   // mark for debugging / GROUP BY logic
        report.hasAggregates = true;
      }

      // Store resolved expression on column for ORDER BY / GROUP BY reference
      col._resolvedExpr = fieldExpr;
      col._rawExpr      = rawExpr;

      if (col.isMainCol) {
        selectParts.push(`${fieldExpr} AS \`${col.alias}\``);
      } else {
        selectParts.push(`${fieldExpr} AS \`${col.alias}\``);
        // PHP parity (index.php:535-558): apply USE INDEX (PRIMARY) hint on heavy
        // report JOINs when the column has no selective filter, helping the MySQL
        // optimizer avoid full-table scans on CROSS-joined reference lookups.
        const colHint = hintNeeded(col, filters) ? ' USE INDEX (PRIMARY)' : '';
        joinParts.push(
          `LEFT JOIN \`${db}\` \`${col.alias}\`${colHint}` +
          ` ON \`${col.alias}\`.up = a.id AND \`${col.alias}\`.t = ${col.reqTypeId}`
        );
      }
    }

    // ── REP_JOIN rows (additional explicit JOINs defined on the report) ───
    // Each REP_JOIN row: val = typeId, means LEFT JOIN db rj{n} ON rj{n}.t = typeId AND rj{n}.up = a.id
    if (report.joins && report.joins.length > 0) {
      report.joins.forEach((j, idx) => {
        if (!j.typeId || isNaN(j.typeId)) return;
        const alias = `rj${idx}`;
        selectParts.push(`${alias}.val AS \`__rj${idx}\``);
        joinParts.push(
          `LEFT JOIN \`${db}\` ${alias}` +
          ` ON ${alias}.up = a.id AND ${alias}.t = ${j.typeId}`
        );
      });
    }

    // ── WHERE ─────────────────────────────────────────────────────────────
    const whereParts  = ['a.t = ?', 'a.up != 0'];
    const whereParams = [report.parentType];

    // Build revBT from report column metadata for constructWhere context
    const reportRevBT = {};
    for (const col of report.columns) {
      if (col.baseType) reportRevBT[col.alias] = REV_BASE_TYPE[col.baseType] || 'SHORT';
    }
    const reportCwCtx = { revBT: reportRevBT, refTyps: {}, multi: new Set(), db };

    for (const [key, filter] of Object.entries(filters)) {
      // Special key: filter by main object ID (used by dubRecDone)
      if (key === '_id') {
        if (filter.eq !== undefined && filter.eq !== '') {
          whereParts.push(`a.id = ?`);
          whereParams.push(filter.eq);
        }
        continue;
      }
      const col = report.columns.find(c => c.alias === key || c.name === key);
      if (!col) continue;
      // Filter on the joined table column (or a.val for main column)
      const expr = col.isMainCol ? 'a.val' : `\`${col.alias}\`.val`;

      // Use constructWhere for DSL-style filters (from/to/eq translated to F/FR/TO)
      // Guard filter values against SQL injection (Issue #308)
      const cwFilter = {};
      if (filter.from !== undefined && filter.from !== '') cwFilter.FR = checkInjection(String(filter.from));
      if (filter.to   !== undefined && filter.to   !== '') cwFilter.TO = checkInjection(String(filter.to));
      if (filter.eq   !== undefined && filter.eq   !== '') cwFilter.F  = checkInjection(String(filter.eq));
      if (filter.like !== undefined && filter.like !== '') cwFilter.F  = `%${checkInjection(String(filter.like))}%`;
      // If from has DSL syntax (%, !, @, etc.) and no TO, treat as F (exact/LIKE filter)
      if (cwFilter.FR && !cwFilter.TO && !cwFilter.F) {
        const fv = cwFilter.FR;
        if (fv.includes('%') || fv.startsWith('!') || fv.startsWith('@') || /^(IN|@IN)\s*\(/i.test(fv)) {
          cwFilter.F = fv;
          delete cwFilter.FR;
        }
      }

      if (Object.keys(cwFilter).length > 0) {
        // Use alias as key so constructWhere generates a{alias}.val references
        const cw = constructWhere(col.alias, cwFilter, col.alias, false, reportCwCtx);
        if (cw.where) {
          // Replace a{alias}.val with the actual column expression
          let cwWhere = cw.where.replace(/^ AND /, '');
          cwWhere = cwWhere.replace(new RegExp(`a${col.alias}\\.val`, 'g'), expr);
          cwWhere = cwWhere.replace(new RegExp(`a${col.alias}\\.id`, 'g'),
            col.isMainCol ? 'a.id' : `\`${col.alias}\`.id`);
          // Also handle vals.val/vals.id for curTyp match
          cwWhere = cwWhere.replace(/\bvals\.val\b/g, expr);
          cwWhere = cwWhere.replace(/\bvals\.id\b/g, col.isMainCol ? 'a.id' : `\`${col.alias}\`.id`);
          whereParts.push(cwWhere);
          whereParams.push(...cw.params);
        }
      }
    }

    // ── Stored WHERE filter (REP_WHERE) — PHP parity (index.php:2723-2725) ──
    // PHP: if request WHERE param is set, use it; otherwise use stored REP_WHERE from report metadata.
    // The WHERE clause is also run through BuiltIn placeholder substitution.
    {
      const requestWhere = filters._where || null;  // allow caller to pass explicit WHERE
      const storedWhere  = report.params[TYPE.REP_WHERE] || null;
      let rawWhere = requestWhere || storedWhere;
      if (rawWhere && typeof rawWhere === 'string' && rawWhere.trim().length > 0) {
        rawWhere = rawWhere.trim();
        // Resolve BuiltIn placeholders: [TODAY], [USER], %USER%, %DATE%, etc.
        // PHP resolves both bracket syntax ([TODAY]) and percent syntax (%USER%) in filters
        if (userCtx) {
          rawWhere = resolveAllBracketBuiltIns(rawWhere, userCtx);
          rawWhere = resolveBuiltIn(rawWhere, userCtx, db, userCtx.tzone || 0, userCtx.ip || '', userCtx.reqHeaders || {});
        }
        // PHP: prepend "AND" if the stored WHERE doesn't already start with AND
        if (rawWhere.substring(0, 3).toUpperCase() === 'AND') {
          whereParts.push(rawWhere.substring(3).trim());
        } else {
          whereParts.push(rawWhere);
        }
        logger.debug('[Report] Applied stored/request WHERE', { reportId: report.id, rawWhere });
      }
    }

    const lim = Math.min(parseInt(limit, 10)  || 100, 10000);
    const off = Math.max(parseInt(offset, 10) || 0,   0);

    // Build ORDER BY from ?ORDER=colId,-colId2 (smartq.js collectOrder())
    // Negative colId = DESC. colId matches report.columns[].id (the DB row id of the REP_COLS entry)
    let orderClause = 'a.ord';
    if (orderParam) {
      const orderParts = String(orderParam).split(',').map(part => {
        const desc  = part.trim().startsWith('-');
        const colId = parseInt(desc ? part.trim().slice(1) : part.trim(), 10);
        const col   = report.columns.find(c => c.id === colId);
        if (!col) return null;
        // When column has an aggregate function, ORDER BY must use the aggregate
        // expression (MySQL requirement: can't ORDER BY raw column not in GROUP BY)
        const expr  = col._resolvedExpr || (col.isMainCol ? 'a.val' : `\`${col.alias}\`.val`);
        return `${expr} ${desc ? 'DESC' : 'ASC'}`;
      }).filter(Boolean);
      if (orderParts.length > 0) orderClause = orderParts.join(', ');
    }

    // ── GROUP BY (when report has aggregate functions) ──────────────────
    // PHP: iterate all fields; those NOT aggregated and NOT hidden go into GROUP BY.
    // Calculatable columns whose formula already contains an aggregate function
    // (e.g. SUM(...), COUNT(...)) are also excluded from GROUP BY.
    let groupByClause = '';
    if (report.hasAggregates) {
      const groupParts = [];
      // Always group by the main object structural columns when aggregating
      // (unless the report is purely aggregated — in that case we group by
      // whichever non-aggregated columns exist)
      for (const col of report.columns) {
        if (col.hidden) continue;                              // hidden → skip
        if (col.isAggregate) continue;                         // aggregate func → skip
        // Calculatable column whose formula itself contains an aggregate call → skip
        if (col.formula && /\b(SUM|AVG|COUNT|MIN|MAX|GROUP_CONCAT)\s*\(/i.test(col.formula)) continue;

        // Use the raw (unwrapped) expression for GROUP BY
        const expr = col._rawExpr || (col.isMainCol ? 'a.val' : `\`${col.alias}\`.val`);
        groupParts.push(expr);
      }
      if (groupParts.length > 0) {
        groupByClause = `GROUP BY ${groupParts.join(', ')}`;
      }
      logger.debug('[Report] GROUP BY', { groupByClause });
    }

    const sqlParts = [
      `SELECT ${selectParts.join(', ')}`,
      `FROM \`${db}\` a`,
      ...joinParts,
      `WHERE ${whereParts.join(' AND ')}`,
    ];
    if (groupByClause) sqlParts.push(groupByClause);
    sqlParts.push(`ORDER BY ${orderClause}`);
    sqlParts.push(`LIMIT ${lim} OFFSET ${off}`);

    let sql = sqlParts.join('\n');

    // ── Resolve [report_name] subquery references (PHP parity) ──────────
    // PHP lines 2941-3021: scan all SQL parts for [report_name] patterns,
    // compile the referenced report, and replace with (subquery_sql).
    sql = await resolveReportSubqueries(pool, db, sql, _subqueryDepth);

    // ── BuiltIn placeholder substitution in full SQL (PHP parity: index.php:2727-2751) ──
    // PHP resolves [PLACEHOLDER] bracket-syntax and %PLACEHOLDER% percent-syntax in
    // both SELECT fields and WHERE filter after assembly.
    if (userCtx) {
      sql = resolveAllBracketBuiltIns(sql, userCtx);
      sql = resolveBuiltIn(sql, userCtx, db, userCtx.tzone || 0, userCtx.ip || '', userCtx.reqHeaders || {});
    }

    logger.debug('[Report] SQL', { sql });

    const { rows: rows } = await execSql(pool, sql, whereParams, { label: 'query_query' });

    // ── Map rows → named output ───────────────────────────────────────────
    // Collect columns that need abn_* post-processing (PHP parity: index.php:3364)
    const abnPostCols = report.columns.filter(c => c.func && isAbnPostProcessFunction(c.func));
    // Collect columns with JSON formula extraction (PHP parity: index.php:3490-3506)
    const jsonFormulaCols = report.columns.filter(c => c.formula &&
      (c.formula.toUpperCase().startsWith('JSON.') || c.formula.toUpperCase().startsWith('CURL.') || c.formula.toUpperCase().startsWith("'CURL.")));
    let rownum = 1;
    results.data = rows.map(row => {
      const out = { id: row.id, val: row.main_val };
      for (const col of report.columns) {
        let cellVal = row[col.alias] ?? '';
        // abn_ROWNUM: sequential row number (not from DB)
        if (col.func && col.func.toUpperCase() === 'ABN_ROWNUM') {
          cellVal = rownum++;
        }
        out[col.alias] = cellVal;
        // Companion ID value for {name}ID columns (used by smartq.js for obj-id / ref-id attributes)
        if (col.isMainCol)      out[col.alias + '_id'] = row.id;
        else if (col.isRef)     out[col.alias + '_id'] = row[col.alias] ?? '';
      }
      // Apply abn_* post-processing functions (abn_DATE2STR, abn_NUM2STR, etc.)
      for (const col of abnPostCols) {
        out[col.alias] = applyAbnFunction(col.func, out[col.alias]);
      }
      // Apply JSON formula extraction (PHP parity: index.php:3490-3506)
      // When REP_COL_FORMULA starts with "JSON.", extract the named key from the cell value.
      // When REP_COL_FORMULA starts with "CURL." or "'CURL.", extract from curl response (if available).
      for (const col of jsonFormulaCols) {
        const formula = col.formula;
        const cellVal = String(out[col.alias] ?? '');
        if (formula.toUpperCase().startsWith('JSON.')) {
          const jsonKey = formula.substring(5); // strip "JSON."
          if (jsonKey && cellVal.toUpperCase().indexOf(jsonKey.toUpperCase()) !== -1) {
            out[col.alias] = checkJson(jsonKey, cellVal);
          }
        }
      }
      return out;
    });

    results.rownum = results.data.length;

    // ── Totals for numeric columns ─────────────────────────────────────────
    // PHP supports per-column total functions via REP_COL_TOTAL (t=65).
    // Default for numeric columns: SUM. If totalFunc is set, use that instead.
    for (const col of report.columns) {
      const bt = REV_BASE_TYPE[col.baseType];
      const fn = col.totalFunc;  // explicit total function from report definition
      if (fn || bt === 'NUMBER' || bt === 'SIGNED') {
        const func = (fn || 'SUM').toUpperCase();
        const vals = results.data.map(row => parseFloat(row[col.alias]) || 0);
        if (vals.length === 0) { results.totals[col.alias] = 0; continue; }
        switch (func) {
          case 'SUM':           results.totals[col.alias] = vals.reduce((a, b) => a + b, 0); break;
          case 'AVG':           results.totals[col.alias] = vals.reduce((a, b) => a + b, 0) / vals.length; break;
          case 'MIN':           results.totals[col.alias] = Math.min(...vals); break;
          case 'MAX':           results.totals[col.alias] = Math.max(...vals); break;
          case 'COUNT':         results.totals[col.alias] = vals.length; break;
          case 'GROUP_CONCAT':  results.totals[col.alias] = results.data.map(r => r[col.alias]).filter(Boolean).join(','); break;
          default:              results.totals[col.alias] = vals.reduce((a, b) => a + b, 0); break;
        }
      }
    }

    logger.debug('[Report] Executed report', { db, reportId: report.id, rows: results.rownum });

  } catch (error) {
    logger.error('[Report] Error executing report', { error: error.message, db, reportId: report.id });
  }

  return results;
}

/**
 * Report generation endpoint with full filtering support
 * GET/POST /:db/report/:reportId
 */
router.all('/:db/report/:reportId?', async (req, res) => {
  const { db, reportId } = req.params;
  const { execute, format } = req.query;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    let id = reportId ? parseInt(reportId, 10) : null;

    // PHP supports report lookup by name (e.g. /:db/report/MyRoleMenu)
    if (reportId && !id) {
      const { rows: nameRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE val = ? AND t = ${TYPE.REPORT} LIMIT 1`, [decodeURIComponent(reportId)], { label: 'func_select' });
      if (nameRows.length > 0) id = nameRows[0].id;
    }

    if (!id) {
      // List available reports
      const { rows: rows } = await execSql(pool, `SELECT id, val AS name, ord FROM ${db} WHERE t = ${TYPE.REPORT} ORDER BY ord`, [], { label: 'func_select' });

      // PHP returns plain array — match that format
      return res.json(rows.map(r => ({ id: r.id, name: r.name, val: r.name, ord: r.ord })));
    }

    // Compile report
    const report = await compileReport(pool, db, id);

    if (!report) {
      return res.status(404).json([{ error: 'Report not found' }]);
    }

    // PHP parity: load grants and add granted flag per column
    const token = req.cookies[db] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    let username = '';
    let grants = {};
    if (token) {
      const { rows: userRows } = await execSql(pool, `
        SELECT u.id, u.val AS username, role_def.id AS role_id
        FROM ${db} tok
        JOIN ${db} u ON tok.up = u.id
        LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
        WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
        LIMIT 1
      `, [token], { label: 'func_select' });
      if (userRows.length > 0) {
        username = userRows[0].username;
        grants = await getGrants(pool, db, userRows[0].role_id, {
          username: userRows[0].username, roleId: userRows[0].role_id,
        });
      }
    }
    for (const col of report.columns) {
      col.granted = await checkGrant(pool, db, grants, col.reqTypeId, 0, 'READ', username);
    }

    // If execution is requested, run the report
    // PHP also executes for JSON_KV, JSON_CR, JSON_HR, JSON_DATA flags (they select output format, not trigger)
    const q = req.query;
    // PHP executes the report for all JSON flags including plain ?JSON
    // CSV export (?csv or ?format=csv) also triggers execution
    const wantCsv = q.csv !== undefined || format === 'csv';
    const shouldExecute = execute || req.method === 'POST' ||
      q.JSON !== undefined || q.json !== undefined ||
      q.JSON_KV !== undefined || q.JSON_CR !== undefined || q.JSON_HR !== undefined ||
      q.JSON_DATA !== undefined || q.RECORD_COUNT !== undefined ||
      wantCsv;

    if (shouldExecute) {
      // Parse filters from request
      const filters = {};
      const params = { ...req.query, ...req.body };

      // SmartQ sends FR_${displayName} where spaces→underscores, not FR_${alias}
      for (const col of report.columns) {
        const nameKey = col.name.replace(/ /g, '_');
        const filter = {};

        if (params[`FR_${nameKey}`]) { filter.from = params[`FR_${nameKey}`]; }
        if (params[`TO_${nameKey}`]) { filter.to   = params[`TO_${nameKey}`]; }
        if (params[`EQ_${nameKey}`]) { filter.eq   = params[`EQ_${nameKey}`]; }
        if (params[`LIKE_${nameKey}`]) { filter.like = params[`LIKE_${nameKey}`]; }

        if (Object.keys(filter).length > 0) {
          filters[col.alias] = filter;
        }
      }

      // PHP parity: handle TOTALS request parameter (e.g. "colId:SUM,colId2:AVG")
      // This overrides per-column total functions at runtime.
      if (params.TOTALS) {
        const AGGR_VALID = new Set(['AVG', 'COUNT', 'MAX', 'MIN', 'SUM', 'GROUP_CONCAT']);
        for (const entry of String(params.TOTALS).split(',')) {
          const [colRef, funcName] = entry.split(':');
          if (!colRef || !funcName) continue;
          const fn = funcName.trim().toUpperCase();
          if (!AGGR_VALID.has(fn)) continue;
          // colRef can be a column id or name
          const col = report.columns.find(c =>
            String(c.id) === colRef || c.name === colRef || c.alias === colRef
          );
          if (col) col.totalFunc = fn;
        }
      }

      // PHP parity: handle SELECT request parameter with inline functions
      // (e.g. "colId:SUM,colId2:AVG") — sets REP_COL_FUNC at runtime
      if (params.SELECT) {
        const AGGR_VALID = new Set(['AVG', 'COUNT', 'MAX', 'MIN', 'SUM', 'GROUP_CONCAT']);
        for (const entry of String(params.SELECT).replace(/\\,/g, '\x00').split(',')) {
          const parts = entry.replace(/\x00/g, ',').replace(/\\:/g, '\x01').split(':');
          const colRef  = (parts[0] || '').replace(/\x01/g, ':').trim();
          const funcStr = (parts[1] || '').replace(/\x01/g, ':').trim().toUpperCase();
          if (!colRef || !funcStr) continue;
          const col = report.columns.find(c =>
            String(c.id) === colRef || c.name === colRef || c.alias === colRef
          );
          if (col) {
            col.func = funcStr;
            if (AGGR_VALID.has(funcStr)) {
              col.isAggregate = true;
              report.hasAggregates = true;
            }
          }
        }
      }

      // ID-exact filter: dubRecDone/createDone sends FR_${colName}ID=objId to locate new record
      // smartq sends raw name (with spaces); filter inputs use underscore-replaced names
      for (const col of report.columns) {
        const nameKey = col.name.replace(/ /g, '_');
        // Check both underscore-replaced and raw name (dubRecDone/createDone use raw DOM text)
        const idVal = params[`FR_${nameKey}ID`] || params[`FR_${col.name}ID`];
        if (idVal && !filters._id) {
          filters._id = { eq: idVal };
          break;
        }
      }

      // Parse LIMIT: smartq.js sends "offset,count" (e.g. "0,50" or "50,50") or just "50"
      // When LIMIT is absent (TOTALS request) use a large limit to get accurate totals
      let limit = 100, offset = 0;
      const rawLimit = params.LIMIT || params.limit;
      if (rawLimit) {
        const parts = String(rawLimit).split(',');
        if (parts.length === 2) {
          offset = parseInt(parts[0], 10) || 0;
          limit = parseInt(parts[1], 10) || 100;
        } else {
          limit = parseInt(parts[0], 10) || 100;
          offset = parseInt(params.F || params.offset || 0, 10);
        }
      } else {
        // No LIMIT = drawFoot/TOTALS request — fetch all rows for accurate totals
        limit = 99999;
        offset = parseInt(params.F || params.offset || 0, 10);
      }

      // PHP parity: ?WHERE= request parameter overrides stored REP_WHERE
      if (params.WHERE) {
        filters._where = params.WHERE;
      }

      // Build user context for BuiltIn placeholder substitution in stored WHERE
      const reportUserCtx = req.legacyUser ? {
        username: req.legacyUser.username || username || '',
        uid: req.legacyUser.uid || '',
        role: req.legacyUser.role || '',
        roleId: req.legacyUser.roleId || '',
        tzone: req.legacyUser.tzone || 0,
        ip: req.ip || '',
        reqHeaders: req.headers || {},
        remoteHost: req.headers['x-forwarded-host'] || req.headers['host'] || '',
        userAgent: req.headers['user-agent'] || '',
        referer: req.headers['referer'] || '',
      } : null;

      const orderParam = params.ORDER || params.order || null;
      const results = await executeReport(pool, db, report, filters, limit, offset, orderParam, 0, reportUserCtx);

      // Format data for display
      const formattedData = results.data.map(row => {
        const formatted = { ...row };
        for (const col of report.columns) {
          if (formatted[col.alias] !== undefined) {
            formatted[`${col.alias}_formatted`] = formatValView(col.baseType, formatted[col.alias]);
          }
        }
        return formatted;
      });

      logger.info('[Legacy report] Report executed', { db, reportId: id, rows: results.rownum });

      // RECORD_COUNT: smartq.js calls ?JSON&RECORD_COUNT → {count: N}
      if (req.query.RECORD_COUNT !== undefined) {
        // Fetch all matching rows to get true count (no LIMIT)
        const cntResults = await executeReport(pool, db, report, filters, 999999, 0, null, 0, reportUserCtx);
        return res.json({ count: cntResults.rownum });
      }

      // CSV export (?csv or ?format=csv)
      // PHP behaviour: when ?csv is set, LIMIT is removed so all matching rows are exported.
      // Re-fetch without LIMIT to ensure complete export.
      if (wantCsv) {
        let csvData = results.data;
        if (limit < 99999) {
          const allResults = await executeReport(pool, db, report, filters, 999999, 0, orderParam, 0, reportUserCtx);
          csvData = allResults.data;
        }

        const { csv, filename } = formatReportCsv(report, csvData, id);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
      }

      // PHP-compatible JSON output formats
      // PHP parity: field_names param filters output to specific columns only
      const fieldNamesParam = req.query.field_names || req.body?.field_names;
      const fieldNamesSet = fieldNamesParam
        ? new Set(fieldNamesParam.split(',').map(s => s.trim()))
        : null;

      if (q.JSON_KV !== undefined) {
        // [{col_name: val, ...}, ...] — array of objects using column names as keys
        const cols = fieldNamesSet
          ? report.columns.filter(c => fieldNamesSet.has(c.name))
          : report.columns;
        const rows = results.data.map(row => {
          const obj = {};
          for (const col of cols) obj[col.name] = row[col.alias] ?? '';
          return obj;
        });
        return res.json(rows);
      }

      if (q.JSON_DATA !== undefined) {
        // {col_name: [val0, val1, ...], ...} — object with column names → arrays of all row values
        const cols = fieldNamesSet
          ? report.columns.filter(c => fieldNamesSet.has(c.name))
          : report.columns;
        const obj = {};
        for (const col of cols) obj[col.name] = results.data.map(row => row[col.alias] ?? '');
        return res.json(obj);
      }

      if (q.JSON_CR !== undefined) {
        // PHP JSON_CR: columns[i] = {id, name, type:"string"}
        // PHP bug: $key gets overwritten in the foreach, so type switch always uses last $key
        // meaning type is effectively always "string"
        const filteredCols = fieldNamesSet
          ? report.columns.filter(c => fieldNamesSet.has(c.name))
          : report.columns;
        const cols = filteredCols.map((col, i) => ({ id: String(col.id || i), name: col.name, type: 'string' }));
        // PHP parity: rows is an object keyed by numeric row index (0, 1, 2...), NOT by row.id
        // All values are strings (PHP returns DB strings as-is, no numeric conversion)
        const rowsObj = {};
        for (let idx = 0; idx < results.data.length; idx++) {
          const row = results.data[idx];
          const r = {};
          for (const col of filteredCols) {
            r[String(col.id || '')] = String(row[col.alias] ?? '');
          }
          rowsObj[idx] = r;
        }
        return res.json({ columns: cols, rows: rowsObj, totalCount: results.data.length });
      }

      if (q.JSON_HR !== undefined) {
        // Hierarchical format: group rows by their parent (up field).
        // Returns {columns:[...], groups:{parentId:[{colId:val,...}]}, totalCount:N}
        // PHP's JSON_HR was never finished (has var_dump) — this is a sensible implementation.
        const cols = report.columns.map(col => ({ id: col.id, name: col.name, type: col.reqTypeId || 0 }));
        const groups = {};
        for (const row of results.data) {
          const parentId = row.up || 0;
          if (!groups[parentId]) groups[parentId] = [];
          const entry = {};
          for (const col of report.columns) entry[col.id] = row[col.alias] ?? '';
          groups[parentId].push(entry);
        }
        return res.json({ columns: cols, groups, totalCount: results.data.length });
      }

      if (isApiRequest(req)) {
        // PHP default JSON: column-major data[col_index][row_index]
        // smartq.js getRep: iterates `for(i in json.data[0])` (rows of first col)
        // smartq.js drawLine: uses `json.data[j][i]` (col j, row i)
        // smartq.js drawFoot: checks 'totals' in json.columns[0] → embed totals in each column
        const totalsMap = results.totals || {};
        // Build column entries; for object/ref columns emit a hidden {name}ID companion column
        // so smartq.js can set obj-id / ref-id attributes via zis.columns[col.name+'ID'].col
        const colEntries = [];
        for (const col of report.columns) {
          colEntries.push({
            def: {
              id: String(col.id),
              name: col.name,
              // type = requisite type ID as string (PHP mysqli returns strings for DB integers)
              type: String(col.reqTypeId || 0),
              format: REV_BASE_TYPE[col.baseType] || 'CHARS',
              align: col.align || 'LEFT',
              totals: totalsMap[col.alias] !== undefined ? totalsMap[col.alias] : null,
              // ref = truthy for reference columns; smartq uses ref-id vs obj-id
              ref: col.isRef ? col.baseType : null,
              // PHP parity: granted flag per column
              granted: col.granted,
            },
            alias: col.alias,
          });
          // Companion hidden ID column: smartq detects name ending in 'ID' and sets ids[i]=0
          if (col.isMainCol || col.isRef) {
            colEntries.push({
              def: {
                id: col.id,          // truthy so smartq processes it in the ID detection branch
                name: col.name + 'ID',
                type: col.reqTypeId || 0,
                format: 'CHARS',
                align: 'LEFT',
                totals: null,
                ref: col.isRef ? col.baseType : null,
              },
              alias: col.alias + '_id',
            });
          }
        }
        const cols = colEntries.map(e => e.def);
        // Column-major: data[column_index] = [row0_val, row1_val, ...]
        const data = colEntries.map(e =>
          results.data.map(row => row[e.alias] !== undefined ? row[e.alias] : '')
        );
        return res.json({ columns: cols, data, rownum: results.rownum });
      }

      // Non-API (browser) fallback — report.html reads json.columns and row-major json.data
      const simpleCols = report.columns.map(col => ({
        id: col.id, name: col.name, align: col.align || 'LEFT', granted: col.granted
      }));
      const rowData = results.data.map(row =>
        report.columns.map(col => row[col.alias] !== undefined ? row[col.alias] : '')
      );
      const topTotals = report.columns.map(col =>
        (results.totals || {})[col.alias] !== undefined ? (results.totals || {})[col.alias] : null
      );
      return res.json({
        title: report.header,
        columns: simpleCols,
        data: rowData,
        totals: topTotals,
        rownum: results.rownum
      });
    }

    // Return report definition only
    logger.info('[Legacy report] Report metadata retrieved', { db, reportId: id });

    if (isApiRequest(req)) {
      return res.json({
        id: report.id,
        name: report.header,
        val: report.header,
        title: report.header,
        columns: report.columns,
        head: report.head,
        types: report.types,
      });
    }

    res.json({
      report: {
        id: report.id,
        name: report.header,
        columns: report.columns,
        head: report.head,
        types: report.types,
        filters: report.filters
      }
    });
  } catch (error) {
    logger.error('[Legacy report] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * Export data endpoint with full requisite support
 * GET /:db/export/:typeId
 */
router.get('/:db/export/:typeId', async (req, res) => {
  const { db, typeId } = req.params;
  const { format = 'csv', include_reqs = '1' } = req.query;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    const type = parseInt(typeId, 10);

    // Get type requisites for header
    const { rows: reqRows } = await execSql(pool, `SELECT id, val, t FROM ${db} WHERE up = ? ORDER BY ord`, [type], { label: 'get_db_export_typeId_select' });

    // Parse requisite names and aliases
    const requisites = reqRows.map(r => {
      const aliasMatch = r.val.match(/:ALIAS=([^:]+):/);
      return {
        id: r.id,
        name: removeMasks(r.val).trim(),
        alias: aliasMatch ? aliasMatch[1] : null,
        type: r.t
      };
    });

    // Get objects of the type
    const { rows: rows } = await execSql(pool, `SELECT id, val, up, ord FROM ${db} WHERE t = ? ORDER BY ord`, [type], { label: 'get_db_export_typeId_select' });

    // If include requisites, fetch all requisite values
    let exportData = rows;
    if (include_reqs === '1' && requisites.length > 0) {
      const objectIds = rows.map(r => r.id);

      if (objectIds.length > 0) {
        // Get all requisite values for these objects
        const { rows: reqValues } = await execSql(pool, `SELECT up AS obj_id, t AS req_type, val FROM ${db} WHERE up IN (?) AND t IN (?)`, [objectIds, requisites.map(r => r.id)], { label: 'get_db_export_typeId_select' });

        // Build a map of requisite values per object
        const reqValueMap = {};
        for (const rv of reqValues) {
          if (!reqValueMap[rv.obj_id]) reqValueMap[rv.obj_id] = {};
          reqValueMap[rv.obj_id][rv.req_type] = rv.val;
        }

        // Merge requisite values into export data
        exportData = rows.map(row => {
          const data = { ...row };
          for (const req of requisites) {
            const key = req.alias || `req_${req.id}`;
            data[key] = reqValueMap[row.id] ? reqValueMap[row.id][req.id] || '' : '';
          }
          return data;
        });
      }
    }

    if (format === 'json') {
      logger.info('[Legacy export] Data exported (JSON)', { db, typeId: type, count: exportData.length });
      return res.json({
        success: true,
        type: type,
        requisites: requisites,
        data: exportData,
        count: exportData.length
      });
    }

    // CSV export with requisites
    const baseHeaders = ['id', 'value', 'parent', 'order'];
    const reqHeaders = requisites.map(r => r.alias || r.name);
    const allHeaders = [...baseHeaders, ...reqHeaders];

    const csvHeader = allHeaders.join(',') + '\n';
    const csvRows = exportData.map(r => {
      const baseVals = [r.id, `"${(r.val || '').replace(/"/g, '""')}"`, r.up, r.ord];
      const reqVals = requisites.map(req => {
        const key = req.alias || `req_${req.id}`;
        const val = r[key] || '';
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      return [...baseVals, ...reqVals].join(',');
    }).join('\n');

    const csv = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${db}_type_${typeId}.csv`);

    logger.info('[Legacy export] Data exported (CSV)', { db, typeId: type, format, count: rows.length });

    res.send(csv);
  } catch (error) {
    logger.error('[Legacy export] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

// ============================================================================
// Phase 4: Grants Endpoint (remaining 10%)
// ============================================================================

/**
 * Get user grants for the current session
 * GET /:db/grants
 */
router.get('/:db/grants', async (req, res) => {
  const { db } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();

    // Get token from cookie or header
    const token = req.cookies[db] || req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json([{ error: 'No token provided' }]);
    }

    // Validate token and get user role
    const { rows: userRows } = await execSql(pool, `
      SELECT u.id, u.val AS username, role_def.id AS role_id, role_def.val AS role_name
      FROM ${db} tok
      JOIN ${db} u ON tok.up = u.id
      LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
      WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
      LIMIT 1
    `, [token], { label: 'get_db_grants_select' });

    if (userRows.length === 0) {
      return res.status(401).json([{ error: 'Invalid token' }]);
    }

    const user = userRows[0];

    // Get grants for the user's role
    const grants = await getGrants(pool, db, user.role_id, {
      username: user.username, uid: user.id, role: (user.role_name || '').toLowerCase(), roleId: user.role_id,
    });

    // Convert internal grants object {typeId: level, mask:{}, EXPORT:{}, DELETE:{}}
    // to PHP-compatible array [{id, type}]
    const grantsArray = Object.entries(grants)
      .filter(([k]) => /^\d+$/.test(k))
      .map(([k, v]) => ({ id: parseInt(k, 10), type: v }));

    logger.info('[Legacy grants] Grants retrieved', { db, username: user.username, grantCount: grantsArray.length });

    res.json({
      success: true,
      user: user.username,
      grants: grantsArray
    });
  } catch (error) {
    logger.error('[Legacy grants] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * Check grant for specific object/type
 * POST /:db/check_grant
 */
router.post('/:db/check_grant', async (req, res) => {
  const { db } = req.params;
  const { id, t, grant = 'READ' } = req.body;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  if (!id) {
    return res.status(200).json([{ error: 'Object ID required'  }]);
  }

  try {
    const pool = getPool();

    // Get token from cookie or header
    const token = req.cookies[db] || req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json([{ error: 'No token provided' }]);
    }

    // Validate token and get user
    const { rows: userRows } = await execSql(pool, `
      SELECT u.id, u.val AS username, role_def.id AS role_id
      FROM ${db} tok
      JOIN ${db} u ON tok.up = u.id
      LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
      WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
      LIMIT 1
    `, [token], { label: 'post_db_check_grant_select' });

    if (userRows.length === 0) {
      return res.status(401).json([{ error: 'Invalid token' }]);
    }

    const user = userRows[0];

    // Get grants
    const grants = await getGrants(pool, db, user.role_id, {
      username: user.username, uid: user.id, roleId: user.role_id,
    });

    // Check specific grant
    const hasGrant = await checkGrant(pool, db, grants, parseInt(id), parseInt(t) || 0, grant.toUpperCase(), user.username);

    logger.info('[Legacy check_grant] Grant checked', { db, id, t, grant, hasGrant });

    res.json({
      success: true,
      granted: hasGrant,
      id: parseInt(id),
      type: parseInt(t) || 0,
      level: grant.toUpperCase()
    });
  } catch (error) {
    logger.error('[Legacy check_grant] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

// ============================================================================
// csv_all - Full DB export to CSV (P0 Critical)
// PHP: index.php lines 4087–4177
// Exports all types and their objects with requisites to CSV format
// ============================================================================

/**
 * csv_all - Export full database to CSV
 * GET /:db/csv_all
 *
 * PHP: index.php lines 4087–4177
 * Requires EXPORT grant on root (1) or admin user.
 * Returns a ZIP file containing CSV with all types and data.
 */
router.get('/:db/csv_all', async (req, res) => {
  const { db } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).send('Invalid database');
  }

  try {
    const pool = getPool();

    // Get token and verify grants
    const token = req.cookies[db] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    let username = '';
    let grants = {};

    if (token) {
      const { rows: userRows } = await execSql(pool, `
        SELECT u.id, u.val AS username, role_def.id AS role_id
        FROM ${db} tok
        JOIN ${db} u ON tok.up = u.id
        LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
        WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
        LIMIT 1
      `, [token], { label: 'get_db_csv_all_select' });

      if (userRows.length > 0) {
        username = userRows[0].username;
        grants = await getGrants(pool, db, userRows[0].role_id, {
          username: userRows[0].username, roleId: userRows[0].role_id,
        });
      }
    }

    // Check EXPORT grant (PHP: if(!isset($GLOBALS["GRANTS"]["EXPORT"][1]) && user != admin))
    if (!grants.EXPORT?.[1] && username.toLowerCase() !== 'admin' && username !== db) {
      return res.status(403).send('You do not have permission to export the database');
    }

    // Get all types (PHP query from csv_all)
    const { rows: typeRows } = await execSql(pool, `
      SELECT a.id, a.val, IF(base.t=base.id,0,1) ref,
             IF(base.t=base.id,defs.val,base.val) req,
             COUNT(def_reqs.id) req_req, reqs.id req_id,
             defs.id req_t, defs.t req_base, a.t base
      FROM ${db} a
      LEFT JOIN ${db} reqs ON reqs.up=a.id
      LEFT JOIN ${db} defs ON defs.id=reqs.t
      LEFT JOIN ${db} def_reqs ON def_reqs.up=defs.id
      LEFT JOIN ${db} base ON base.id=defs.t
      WHERE a.up=0 AND a.id!=a.t AND a.val!='' AND a.t!=0
      GROUP BY reqs.id
      ORDER BY a.id, reqs.ord
    `, [], { label: 'get_db_csv_all_select' });

    // Build type structure with optimized JOINs (PHP parity: index.php 4101–4131)
    // PHP builds $select[$i], $join[$i] per type so all requisite values are fetched
    // in a single query via JOINs, instead of N+1 queries per object.
    const typ = {};    // id -> CSV header string
    const base = {};   // id -> base type id
    const reqs = {};   // id -> array of requisite IDs
    const select = {}; // id -> SQL SELECT fragment for JOINed requisites
    const join = {};   // id -> SQL JOIN fragment for requisites
    const arr = {};    // id -> true if this type is an array-type (has sub-requisites)
    const reqSet = new Set(); // Types used as requisites

    for (const row of typeRows) {
      const revBt = REV_BASE_TYPE[row.t] || null;
      if (revBt === 'CALCULATABLE' || revBt === 'BUTTON') continue;

      const i = row.id;
      base[i] = row.base;

      if (!reqSet.has(i) && !typ[i]) {
        typ[i] = maskCsvDelimiters(row.val);
        select[i] = '';
        join[i] = '';
        reqs[i] = [];
      }

      if (row.req) {
        if (!reqs[i]) reqs[i] = [];
        const rid = row.req_id;
        reqs[i].push(rid);
        base[rid] = row.req_base;
        delete typ[row.req]; // Remove types used as requisites from independent list
        reqSet.add(row.req);
        typ[i] = (typ[i] || '') + ';' + maskCsvDelimiters(row.req);

        // PHP: if($row["req_req"] > 0) — this requisite has sub-requisites (array type)
        if (row.req_req > 0) {
          arr[row.req_t] = true;
        } else {
          const r = row.req_base;
          if (row.ref === 1) {
            // PHP: reference JOIN — l$rid finds the link, r$rid resolves the referenced object
            join[i] += ` LEFT JOIN (${db} l${rid} CROSS JOIN ${db} r${rid} USE INDEX (PRIMARY)) ON l${rid}.up=obj.id AND r${rid}.id=l${rid}.t AND r${rid}.t=${r}`;
          } else {
            const revBtR = REV_BASE_TYPE[r] || null;
            if (['CHARS', 'MEMO', 'FILE', 'HTML'].includes(revBtR)) {
              // PHP: text-type requisites have a sub-row for the actual text content
              join[i] += ` LEFT JOIN ${db} r${rid} ON r${rid}.up=obj.id AND r${rid}.t=${rid} LEFT JOIN ${db} t${rid} ON t${rid}.up=r${rid}.id AND t${rid}.t=0 AND t${rid}.ord=0`;
              select[i] += `, IF(t${rid}.id IS NULL, 0, r${rid}.id) t${rid}`;
            } else {
              join[i] += ` LEFT JOIN ${db} r${rid} ON r${rid}.up=obj.id AND r${rid}.t=${rid}`;
            }
            select[i] += `, r${rid}.val v${rid}`;
          }
        }
      }
    }

    // Build CSV content with batched fetching (PHP parity: index.php 4132–4168)
    // PHP uses cursor-based pagination with batch size = 500000/(num_reqs+1)
    let csvContent = '\ufeff'; // BOM for UTF-8

    for (const typeId of Object.keys(typ)) {
      const id = parseInt(typeId, 10);
      csvContent += typ[typeId];

      const reqCount = (reqs[id] || []).length;
      const limit = Math.round(500000 / (reqCount + 1));
      let last = 0;
      let rowsNumber = 0;

      do {
        // PHP: fetch object IDs in batches using cursor pagination
        let idQuery;
        if (arr[id]) {
          // Array-type: extra parent check (obj.up's up must also be != 0)
          idQuery = `SELECT obj.id FROM ${db} obj, ${db} up WHERE obj.t=${id} AND obj.up!=0 AND up.id=obj.up AND up.up!=0 AND obj.id>${last} ORDER BY obj.id LIMIT ${limit}`;
        } else {
          idQuery = `SELECT id FROM ${db} obj WHERE t=${id} AND up!=0 AND id>${last} ORDER BY id LIMIT ${limit}`;
        }

        const { rows: idRows } = await execSql(pool, idQuery, [], { label: 'reqCount_query' });
        rowsNumber = idRows.length;

        if (idRows.length > 0) {
          const first = idRows[0].id;
          last = idRows[idRows.length - 1].id;

          // PHP: single query with all JOINs to fetch object + all requisite values at once
          const dataQuery = `SELECT obj.id, obj.val${select[id] || ''} FROM ${db} obj${join[id] || ''} WHERE obj.t=${id} AND obj.up!=0 AND obj.id>=${first} AND obj.id<=${last}`;
          const { rows: dataRows } = await execSql(pool, dataQuery, [], { label: 'reqCount_query' });

          let h = '';
          let prev = 0;
          for (const row of dataRows) {
            if (prev !== row.id) {
              h += '\n' + maskCsvDelimiters(formatValView(base[id], row.val));
              prev = row.id;
            }
            for (const rid of (reqs[id] || [])) {
              const v = row[`v${rid}`];
              h += ';' + maskCsvDelimiters(formatValView(base[rid], v));
            }
          }
          csvContent += h;
        }
      } while (rowsNumber === limit);

      csvContent += '\n\n';
    }

    // Create filename and wrap in ZIP
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '_').slice(0, 15);
    const csvFilename = `${db}_${timestamp}.csv`;
    const zipFilename = `${csvFilename}.zip`;
    const zipBuffer = buildZip(csvFilename, csvContent);

    // Set headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Content-Length', zipBuffer.length);

    logger.info('[Legacy csv_all] Export completed', { db, filename: zipFilename });

    res.send(zipBuffer);
  } catch (error) {
    logger.error('[Legacy csv_all] Error', { error: error.message, db });
    res.status(500).send('Export failed: ' + error.message);
  }
});

/**
 * Helper function to escape CSV delimiters
 * PHP: maskCsvDelimiters function
 */
function maskCsvDelimiters(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  // Escape semicolons and newlines for CSV
  return str.replace(/;/g, '\\;').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

/**
 * Format report results as CSV for download.
 * Matches PHP Compile_Report CSV export behavior:
 *   - Semicolon delimiter (fputcsv($handle, $data, ';'))
 *   - UTF-8 BOM prefix for Excel compatibility
 *   - Values containing semicolons, quotes, or newlines are quoted
 *   - Double-quotes inside values are escaped as ""
 *
 * @param {object}   report  - compiled report with .columns[]
 * @param {object[]} rows    - result data array
 * @param {number}   reportId - report ID for filename
 * @returns {{ csv: string, filename: string }}
 */
function formatReportCsv(report, rows, reportId) {
  const BOM = '\ufeff';
  const DELIM = ';';

  /** Escape a single cell value for semicolon-delimited CSV */
  function escapeCell(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    // If the value contains the delimiter, quotes, or newlines — wrap in quotes
    if (str.includes(DELIM) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // Header row: column display names
  const headerLine = report.columns.map(c => escapeCell(c.name)).join(DELIM);

  // Data rows
  const dataLines = rows.map(row =>
    report.columns.map(c => escapeCell(row[c.alias])).join(DELIM)
  );

  const csv = BOM + headerLine + '\n' + dataLines.join('\n');
  const filename = `report_${reportId}.csv`;

  return { csv, filename };
}

// ============================================================================
// Minimal ZIP builder (no external dependencies — uses Node built-in zlib)
// Produces a valid ZIP with a single deflated entry.
// ============================================================================

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC32_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Build a minimal valid ZIP file containing one entry.
 * @param {string} entryName - filename inside the ZIP
 * @param {Buffer|string} content - file content
 * @returns {Buffer}
 */
function buildZip(entryName, content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  const compressed = zlib.deflateRawSync(buf);
  const fileCrc = crc32(buf);
  const nameBuf = Buffer.from(entryName, 'utf8');

  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  // Local file header (30 bytes + filename)
  const lfh = Buffer.alloc(30 + nameBuf.length);
  lfh.writeUInt32LE(0x04034b50, 0);
  lfh.writeUInt16LE(20, 4);
  lfh.writeUInt16LE(0, 6);
  lfh.writeUInt16LE(8, 8);          // method: deflate
  lfh.writeUInt16LE(dosTime, 10);
  lfh.writeUInt16LE(dosDate, 12);
  lfh.writeUInt32LE(fileCrc, 14);
  lfh.writeUInt32LE(compressed.length, 18);
  lfh.writeUInt32LE(buf.length, 22);
  lfh.writeUInt16LE(nameBuf.length, 26);
  lfh.writeUInt16LE(0, 28);
  nameBuf.copy(lfh, 30);

  const dataOffset = 0;

  // Central directory header (46 bytes + filename)
  const cdh = Buffer.alloc(46 + nameBuf.length);
  cdh.writeUInt32LE(0x02014b50, 0);
  cdh.writeUInt16LE(20, 4);
  cdh.writeUInt16LE(20, 6);
  cdh.writeUInt16LE(0, 8);
  cdh.writeUInt16LE(8, 10);
  cdh.writeUInt16LE(dosTime, 12);
  cdh.writeUInt16LE(dosDate, 14);
  cdh.writeUInt32LE(fileCrc, 16);
  cdh.writeUInt32LE(compressed.length, 20);
  cdh.writeUInt32LE(buf.length, 24);
  cdh.writeUInt16LE(nameBuf.length, 28);
  cdh.writeUInt16LE(0, 30);
  cdh.writeUInt16LE(0, 32);
  cdh.writeUInt16LE(0, 34);
  cdh.writeUInt16LE(0, 36);
  cdh.writeUInt32LE(0, 38);
  cdh.writeUInt32LE(dataOffset, 42);
  nameBuf.copy(cdh, 46);

  const cdOffset = lfh.length + compressed.length;

  // End of central directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdh.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([lfh, compressed, cdh, eocd]);
}

/**
 * Read entries from a ZIP buffer. Supports stored (method 0) and deflate (method 8).
 * @param {Buffer} buf - ZIP file buffer
 * @returns {Array<{name: string, content: Buffer}>}
 */
function readZip(buf) {
  // Find End of Central Directory signature (search backwards)
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset < 0) throw new Error('Not a valid ZIP file');

  const cdCount  = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let pos = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const method     = buf.readUInt16LE(pos + 10);
    const compSize   = buf.readUInt32LE(pos + 20);
    const nameLen    = buf.readUInt16LE(pos + 28);
    const extraLen   = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOff   = buf.readUInt32LE(pos + 42);
    const name       = buf.slice(pos + 46, pos + 46 + nameLen).toString('utf8');

    // Local file header: 30 bytes fixed + name + extra
    const lfhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart   = localOff + 30 + nameLen + lfhExtraLen;
    const compData    = buf.slice(dataStart, dataStart + compSize);

    const content = method === 0 ? compData : zlib.inflateRawSync(compData);
    entries.push({ name, content });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// ============================================================================
// backup - Binary dump export (P0 Critical)
// PHP: index.php lines 4239–4284
// Exports all database rows in compact binary format (.dmp)
// ============================================================================

/**
 * backup - Export database to binary dump format
 * GET /:db/backup
 *
 * PHP: index.php lines 4239–4284
 * Requires EXPORT grant on root (1) or admin user.
 * Returns a dump file with compact row encoding.
 */
router.get('/:db/backup', async (req, res) => {
  const { db } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).send('Invalid database');
  }

  try {
    const pool = getPool();

    // Get token and verify grants
    const token = req.cookies[db] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    let username = '';
    let grants = {};

    if (token) {
      const { rows: userRows } = await execSql(pool, `
        SELECT u.id, u.val AS username, role_def.id AS role_id
        FROM ${db} tok
        JOIN ${db} u ON tok.up = u.id
        LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
        WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
        LIMIT 1
      `, [token], { label: 'get_db_backup_select' });

      if (userRows.length > 0) {
        username = userRows[0].username;
        grants = await getGrants(pool, db, userRows[0].role_id, {
          username: userRows[0].username, roleId: userRows[0].role_id,
        });
      }
    }

    // Check EXPORT grant
    if (!grants.EXPORT?.[1] && username.toLowerCase() !== 'admin' && username !== db) {
      return res.status(403).send('You do not have permission to export the database');
    }

    // Export all rows in PHP's compact format
    // PHP format: id_delta;up;t;ord;val\n
    let dumpContent = '\ufeff'; // BOM for UTF-8
    let lastId = 0;
    let lastUp = '';
    let lastT = '';

    const limit = 500000;
    let hasMore = true;

    while (hasMore) {
      const { rows: rows } = await execSql(pool, `
        SELECT id, up, t, ord, val
        FROM ${db}
        WHERE id > ?
        ORDER BY id
        LIMIT ?
      `, [lastId, limit], { label: 'get_db_backup_select' });

      if (rows.length < limit) {
        hasMore = false;
      }

      for (const row of rows) {
        let line = '';

        // Encode ID delta (PHP: if last+1 == current, use ";", else base36(delta))
        if (lastId + 1 === row.id) {
          line = ';';
        } else {
          line = (row.id - lastId).toString(36) + ';';
        }
        lastId = row.id;

        // Encode up (PHP: if changed, base36(up);, else empty or "/" for same)
        if (String(lastUp) !== String(row.up)) {
          line += parseInt(row.up).toString(36) + ';';
          lastUp = row.up;
        } else if (line === ';') {
          line = '/';
        } else {
          line += ';';
        }

        // Encode t (PHP: if changed, base36(t);, else just ;)
        if (String(lastT) !== String(row.t)) {
          line += parseInt(row.t).toString(36) + ';';
          lastT = row.t;
        } else {
          line += ';';
        }

        // Encode ord (PHP: if ord != 1, include it)
        if (row.ord !== 1 && row.ord !== '1') {
          line += row.ord;
        }

        // Encode val with newline escaping
        const escapedVal = String(row.val || '')
          .replace(/\r/g, '&ritrr;')
          .replace(/\n/g, '&ritrn;');

        dumpContent += line + ';' + escapedVal + '\n';
      }
    }

    // Create filename and wrap in ZIP
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '_').slice(0, 15);
    const dmpFilename = `${db}_${timestamp}.dmp`;
    const zipFilename = `${dmpFilename}.zip`;
    const zipBuffer = buildZip(dmpFilename, dumpContent);

    // Set headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Content-Length', zipBuffer.length);

    logger.info('[Legacy backup] Export completed', { db, filename: zipFilename, rows: lastId });

    res.send(zipBuffer);
  } catch (error) {
    logger.error('[Legacy backup] Error', { error: error.message, db });
    res.status(500).send('Backup failed: ' + error.message);
  }
});

// ============================================================================
// BKI export — constructHeader, exportHeader, exportTerms, Export_reqs
// PHP: index.php lines 1635–1749
// Exports object data in BKI (structured text) format
// ============================================================================

/**
 * constructHeader — recursively builds BKI header metadata for a type.
 * Populates ctx.localStruct, ctx.base, ctx.uniq, ctx.linx, ctx.refs,
 * ctx.arrays, ctx.pwds, ctx.multi with structural information.
 *
 * @param {object} pool   - MySQL connection pool
 * @param {string} db     - database (table) name
 * @param {number} id     - object/type ID to describe
 * @param {object} ctx    - shared context accumulator
 * @param {number} parent - parent ID (for recursion tracking)
 */
async function constructHeader(pool, db, id, ctx, parent = 0) {
  if (ctx.localStruct[id]) return; // already processed

  ctx.parents[id] = parent;

  const { rows: rows } = await execSql(pool, `
    SELECT CASE WHEN LENGTH(obj.val)=0 THEN obj.id ELSE obj.t END AS t,
           CASE WHEN LENGTH(obj.val)=0 THEN obj.t ELSE obj.val END AS val,
           req.id AS req_id, req.t AS req_t, refr.val AS req, refr.t AS ref_t,
           req.val AS attr, base.t AS base_t, arr.id AS arr,
           linx.i, obj.ord AS uniq
    FROM \`${db}\` obj
      LEFT JOIN (\`${db}\` req CROSS JOIN \`${db}\` refr CROSS JOIN \`${db}\` base)
        ON req.up = obj.id AND refr.id = req.t AND base.id = refr.t
      LEFT JOIN \`${db}\` arr ON arr.up = req.t AND arr.t != 0 AND arr.ord = 1
      CROSS JOIN (SELECT COUNT(1) AS i FROM \`${db}\` WHERE up = 0 AND t = ?) linx
    WHERE obj.id = ?
    ORDER BY req.ord
  `, [id, id], { label: 'constructHeader_select' });

  for (const row of rows) {
    if (!ctx.localStruct[id]) {
      // First row — build the type descriptor line (slot 0)
      const baseLabel = REV_BASE_TYPE[row.t] ? ':' + REV_BASE_TYPE[row.t] : '';
      const uniqueTag = String(row.uniq) === '1' ? ':unique' : '';
      ctx.localStruct[id] = { 0: `${id}:${MaskDelimiters(row.val)}${baseLabel}${uniqueTag}` };
      ctx.base[id] = row.t;
      ctx.uniq[id] = row.uniq;
      if (Number(row.i)) {
        // Other objects reference this type — need to export IDs
        ctx.linx[id] = '';
      }
    }

    if (row.req_t) {
      // This type has requisites
      if (row.ref_t !== row.base_t) {
        // Reference requisite
        const attrStr = row.attr ? ':' + MaskDelimiters(row.attr) : '';
        ctx.localStruct[id][row.req_id] = `ref:${row.req_id}:${row.req_t}${attrStr}`;
        if (!ctx.localStruct[row.req_t]) {
          await constructHeader(pool, db, row.req_t, ctx, id);
        }
        if (!ctx.localStruct[row.ref_t]) {
          await constructHeader(pool, db, row.ref_t, ctx, id);
        }
        ctx.refs[row.req_id] = row.ref_t;
        if (row.attr && String(row.attr).includes(':MULTI:')) {
          ctx.multi[row.req_id] = row.ref_t;
        }
      } else if (row.arr) {
        // Array requisite
        const attrStr = row.attr ? ':' + MaskDelimiters(row.attr) : '';
        ctx.localStruct[id][row.req_id] = `arr:${row.req_t}${attrStr}`;
        if (!ctx.localStruct[row.req_t]) {
          await constructHeader(pool, db, row.req_t, ctx, id);
          ctx.arrays[row.req_t] = '';
        }
      } else {
        // Simple (scalar) requisite
        const typeName = REV_BASE_TYPE[row.ref_t] || 'SHORT';
        const attrStr = row.attr ? ':' + MaskDelimiters(row.attr) : '';
        ctx.localStruct[id][row.req_id] = `${MaskDelimiters(row.req)}:${typeName}${attrStr}`;
        if (typeName === 'PWD') {
          ctx.pwds[row.req_id] = '';
        }
        ctx.base[row.req_id] = row.base_t;
      }
    }
  }
}

/**
 * exportHeader — serialises all collected localStruct entries into BKI header text.
 * @param {object} ctx - shared context with localStruct
 * @returns {string} header section
 */
function exportHeader(ctx) {
  let headStr = '';
  for (const id of Object.keys(ctx.localStruct)) {
    const entry = ctx.localStruct[id];
    // entry is an object keyed by 0, reqId, reqId, …  – join values with ";"
    const vals = Object.keys(entry)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => entry[k]);
    headStr += vals.join(';') + ';\r\n';
  }
  return headStr;
}

/**
 * exportTerms — ensures that a term/dictionary type referenced from a REP_COLS
 * row has its header emitted (possibly as a "subst:" substitution line).
 *
 * @param {object} pool - MySQL connection pool
 * @param {string} db   - database name
 * @param {number} id   - the term object ID
 * @param {object} ctx  - shared context
 */
async function exportTerms(pool, db, id, ctx) {
  ctx.termDefs[id] = 1;

  const { rows: rows } = await execSql(pool, `
    SELECT obj.t AS type, obj.up, type.t AS base
    FROM \`${db}\` obj, \`${db}\` type
    WHERE obj.id = ? AND type.id = obj.t
  `, [id], { label: 'exportTerms_select' });

  if (rows.length === 0) return;
  const row = rows[0];

  if (String(row.up) === '0') {
    // Top-level object — just ensure its header is built
    await constructHeader(pool, db, id, ctx);
  } else {
    // Sub-object — build parent header then create a "subst:" alias
    await constructHeader(pool, db, row.up, ctx);
    const parentStruct = ctx.localStruct[row.up];
    if (parentStruct) {
      for (const key of Object.keys(parentStruct)) {
        if (Number(key) === id) {
          ctx.localStruct[id] = { 0: `subst:${id}:${row.up}:${parentStruct[key]}` };
        }
      }
    }
  }
}

/**
 * CheckSubst — look up a structural ID substitution.
 * PHP parity: index.php lines 3991–3997
 *
 * During CSV/BKI import, when an imported type ID does not match an existing
 * local type, ResolveType() records a mapping in ctx.localStruct.subst.
 * CheckSubst returns the substituted (local) ID when one exists, or the
 * original ID unchanged.
 *
 * @param {number|string} i   - the structural / type ID to check
 * @param {object}        ctx - shared import context (must have localStruct)
 * @returns {number|string} substituted ID or original
 */
function checkSubst(i, ctx) {
  if (ctx.localStruct && ctx.localStruct.subst && ctx.localStruct.subst[i] !== undefined) {
    return ctx.localStruct.subst[i];
  }
  return i;
}

/**
 * CheckObjSubst — look up an object ID substitution.
 * PHP parity: index.php lines 3998–4004
 *
 * During CSV/BKI import, when an imported object row ID collides with an
 * existing row of a different type, the importer creates a new row and records
 * the old→new mapping in ctx.objSubst.  CheckObjSubst returns the substituted
 * (new) object ID when one exists, or the original ID unchanged.
 *
 * @param {number|string} i   - the object ID to check
 * @param {object}        ctx - shared import context (must have objSubst)
 * @returns {number|string} substituted ID or original
 */
function checkObjSubst(i, ctx) {
  if (ctx.objSubst && ctx.objSubst[i] !== undefined) {
    return ctx.objSubst[i];
  }
  return i;
}

/**
 * Export_reqs — recursively exports the data rows for a single object in BKI
 * format.  Mirrors PHP Export_reqs($id, $obj, $val, $ref).
 *
 * @param {object}  pool - MySQL pool
 * @param {string}  db   - database name
 * @param {number}  id   - type / structural ID
 * @param {number}  obj  - concrete object row ID
 * @param {string}  val  - masked value for the object
 * @param {object}  ctx  - shared context
 * @param {string}  ref  - ref prefix (empty or "val:")
 * @param {number}  fU   - F_U parameter (>1 means export order)
 * @returns {string} BKI data lines
 */
async function Export_reqs(pool, db, id, obj, val, ctx, ref = '', fU = 0) {
  if (ctx.exported[obj] !== undefined) return '';
  ctx.exported[obj] = '';

  let str = '';
  let children = '';
  let refs = '';

  if (ctx.data[obj] === undefined) {
    const reqs = {};

    const { rows: rows } = await execSql(pool, `
      SELECT DISTINCT obj.id, obj.t, obj.val, obj.ord,
             req.t AS req_t, req.val AS req_val, req.up AS rup, par.up AS ref
      FROM \`${db}\` obj
        LEFT JOIN \`${db}\` req ON req.id = obj.t
        LEFT JOIN \`${db}\` par ON par.id = req.up
      WHERE obj.up = ?
      ORDER BY obj.ord
    `, [obj], { label: 'Export_reqs_select' });

    for (const row of rows) {
      // If this is a REP_COLS reference to a term not yet in localStruct, export it
      if (Number(row.t) === TYPE.REP_COLS &&
          String(row.val) !== '0' &&
          !ctx.localStruct[row.val] &&
          !ctx.termDefs[row.val]) {
        await exportTerms(pool, db, Number(row.val), ctx);
      }

      if (Number(row.rup) !== id && Number(row.rup) !== 0) {
        // Reference value
        const key = row.val;
        reqs[key] = (reqs[key] !== undefined ? reqs[key] + ',' : '') + row.t;
        const refArg = String(row.ref) === '1' ? row.val + ':' : '0';
        refs += await Export_reqs(pool, db, Number(row.req_t), Number(row.t),
          MaskDelimiters(row.req_val), ctx, refArg, fU);
      } else if (ctx.arrays[row.t] !== undefined) {
        // Array child
        children += await Export_reqs(pool, db, Number(row.t), Number(row.id),
          row.val, ctx, '', fU);
      } else if (ctx.pwds[row.t] === undefined) {
        // Simple value (skip PWD hashes)
        reqs[row.t] = MaskDelimiters(row.val);
      }
    }

    // Build the line from localStruct column order
    const struct = ctx.localStruct[id];
    if (struct) {
      for (const key of Object.keys(struct).sort((a, b) => Number(a) - Number(b))) {
        if (Number(key) === 0) {
          str = MaskDelimiters(val) + ';';
        } else {
          str += (reqs[key] !== undefined ? reqs[key] : '') + ';';
        }
      }
    }

    // Determine line prefix
    if (ctx.arrays[id] !== undefined || ctx.linx[id] === undefined ||
        (ctx.rootId === id && fU > 1)) {
      str = `${id}::${str}\r\n`;
    } else {
      str = `${ref}${id}:${obj}:${str}\r\n`;
      ctx.data[obj] = '';
    }
  }

  return refs + str + children;
}

/**
 * BKI export route.
 * GET /:db/bki-export?id=<typeId>&F_U=<level>
 *
 * Produces a .bki file (zipped) containing:
 *   - Header lines (type structure)
 *   - DATA marker
 *   - Data rows
 */
router.get('/:db/bki-export', async (req, res) => {
  const { db } = req.params;
  const id = parseInt(req.query.id, 10);
  const fU = parseInt(req.query.F_U || '0', 10);

  if (!isValidDbName(db)) {
    return res.status(200).send('Invalid database');
  }
  if (!id || isNaN(id)) {
    return res.status(400).send('Missing or invalid id parameter');
  }

  try {
    const pool = getPool();

    // ── Auth & grant check (same as backup) ──
    const token = req.cookies[db] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    let username = '';
    let grants = {};

    if (token) {
      const { rows: userRows } = await execSql(pool, `
        SELECT u.id, u.val AS username, role_def.id AS role_id
        FROM \`${db}\` tok
        JOIN \`${db}\` u ON tok.up = u.id
        LEFT JOIN (\`${db}\` r CROSS JOIN \`${db}\` role_def)
          ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
        WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
        LIMIT 1
      `, [token], { label: 'get_db_bki-export_select' });

      if (userRows.length > 0) {
        username = userRows[0].username;
        grants = await getGrants(pool, db, userRows[0].role_id, {
          username: userRows[0].username, roleId: userRows[0].role_id,
        });
      }
    }

    if (!grants.EXPORT?.[1] && !grants.EXPORT?.[id] &&
        username.toLowerCase() !== 'admin' && username !== db) {
      return res.status(403).send('You do not have permission to export');
    }

    // ── Build BKI context ──
    const ctx = {
      localStruct: {},
      base: {},
      uniq: {},
      linx: {},
      refs: {},
      arrays: {},
      pwds: {},
      multi: {},
      parents: {},
      termDefs: {},
      exported: {},
      data: {},
      rootId: id,
    };

    // Step 1: build header structure for the root type
    await constructHeader(pool, db, id, ctx);

    // Step 2: iterate all objects of this type and export their data
    const { rows: objRows } = await execSql(pool, `
      SELECT id, t, val, up, ord
      FROM \`${db}\`
      WHERE t = ? AND t != up
      ORDER BY ord
    `, [id], { label: 'get_db_bki-export_select' });

    const dataLines = [];
    for (const row of objRows) {
      const line = await Export_reqs(pool, db, id, Number(row.id), row.val, ctx, '', fU);
      if (line) dataLines.push(line);
    }

    // Step 3: assemble BKI content
    const bkiContent = exportHeader(ctx) + 'DATA\r\n' + dataLines.join('');

    // Step 4: wrap in ZIP and send
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '_').slice(0, 15);
    const bkiFilename = `data_export_${db}_${timestamp}.bki`;
    const zipFilename = `${bkiFilename}.zip`;
    const zipBuffer = buildZip(bkiFilename, bkiContent);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Content-Length', zipBuffer.length);

    logger.info('[Legacy BKI export] Completed', { db, id, objects: objRows.length });
    res.send(zipBuffer);
  } catch (error) {
    logger.error('[Legacy BKI export] Error', { error: error.message, db });
    res.status(500).send('BKI export failed: ' + error.message);
  }
});

// ============================================================================
// BKI import — structured import with type resolution and ID substitution
// PHP: index.php lines 5222–5765 (&uni_obj_head import block)
// ============================================================================

// Name→ID mapping for base types (inverse of REV_BASE_TYPE)
// PHP parity: $GLOBALS["BT"] = array_flip($GLOBALS["basics"])
const BASE_TYPE_BY_NAME = {};
for (const [id, name] of Object.entries(REV_BASE_TYPE)) {
  BASE_TYPE_BY_NAME[name] = Number(id);
}

/**
 * ResolveType — find or create local type matching an imported type definition.
 * PHP parity: index.php lines 3970–3990
 *
 * If a local type with the same (val, base_type) exists at root, uses it.
 * Otherwise creates a new type row. Records old→new ID mapping in ctx.localStruct.subst.
 *
 * @param {object}   pool - MySQL pool
 * @param {string}   db   - database name
 * @param {string[]} typ  - parsed type descriptor [id, name, baseTypeName, "unique"?]
 * @param {object}   ctx  - shared import context
 * @returns {number} resolved local type ID
 */
async function resolveType(pool, db, typ, ctx) {
  const baseTypeId = BASE_TYPE_BY_NAME[typ[2]];
  if (baseTypeId === undefined) {
    throw new Error(`Unknown base type "${typ[2]}" for imported type "${typ[1]}"`);
  }

  const { rows: rows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE val = ? AND up = 0 AND t = ?`, [typ[1], baseTypeId], { label: 'resolveType_select' });

  let id;
  if (rows.length > 0) {
    id = rows[0].id;
    await constructHeader(pool, db, id, ctx);
  } else {
    // No analogue — insert new type
    const ord = typ[3] ? 1 : 0; // "unique" flag → ord=1
    const { rows: ins } = await execSql(pool, `INSERT INTO \`${db}\` (up, ord, t, val) VALUES (0, ?, ?, ?)`, [ord, baseTypeId, typ[1]], { label: 'resolveType_insert' });
    id = ins.insertId;
    ctx.localStruct[id] = { 0: `${id}:${MaskDelimiters(typ[1])}:${baseTypeId}${typ[3] ? ':unique' : ''}` };
  }

  if (id !== Number(typ[0])) {
    if (!ctx.localStruct.subst) ctx.localStruct.subst = {};
    ctx.localStruct.subst[typ[0]] = id;
  }
  return id;
}

/**
 * isOccupied — check if an ID exists in the database.
 * PHP parity: index.php lines 978–983
 */
async function isOccupied(pool, db, id) {
  const { rows: rows } = await execSql(pool, `SELECT 1 FROM \`${db}\` WHERE id = ? LIMIT 1`, [id], { label: 'isOccupied_select' });
  return rows.length > 0;
}

/**
 * bkiInsertRow — insert a single row and return its new ID.
 * PHP parity: Insert() — index.php lines 7054–7059
 * Named differently from the existing insertRow() to avoid collision.
 */
async function bkiInsertRow(pool, db, up, ord, t, val) {
  const { rows: result } = await execSql(pool, `INSERT INTO \`${db}\` (up, ord, t, val) VALUES (?, ?, ?, ?)`, [up, ord, t, val], { label: 'bkiInsertRow_insert' });
  return result.insertId;
}

/**
 * getOrd — get next ord value for children of a parent (optionally filtered by type).
 * PHP parity: Get_Ord() — index.php lines 7012–7018
 */
async function getOrd(pool, db, parent, typ = 0) {
  const sql = typ
    ? `SELECT COALESCE(MAX(ord), 0) + 1 AS next_ord FROM \`${db}\` WHERE up = ? AND t = ?`
    : `SELECT COALESCE(MAX(ord), 0) + 1 AS next_ord FROM \`${db}\` WHERE up = ?`;
  const params = typ ? [parent, typ] : [parent];
  const { rows: rows } = await execSql(pool, sql, params, { label: 'getOrd_query' });
  return rows[0].next_ord;
}

/**
 * BKI import route.
 * POST /:db/bki-import
 *
 * Accepts a .bki file (in ZIP or raw) via multipart upload (field "file")
 * or raw body text. Parses BKI header + DATA section, resolves type conflicts,
 * and imports with ID substitution via checkSubst/checkObjSubst.
 *
 * PHP parity: index.php lines 5222–5765 (&uni_obj_head import block)
 */
router.post('/:db/bki-import', (req, res, next) => {
  upload.single('file')(req, res, next);
}, async (req, res) => {
  const { db } = req.params;
  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database' }]);
  }

  try {
    const pool = getPool();

    // ── Auth & grant check ──
    const token = req.cookies[db] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    let username = '';
    let grants = {};

    if (token) {
      const { rows: userRows } = await execSql(pool, `
        SELECT u.id, u.val AS username, role_def.id AS role_id
        FROM \`${db}\` tok
        JOIN \`${db}\` u ON tok.up = u.id
        LEFT JOIN (\`${db}\` r CROSS JOIN \`${db}\` role_def)
          ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
        WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
        LIMIT 1
      `, [token], { label: 'post_db_bki-import_select' });

      if (userRows.length > 0) {
        username = userRows[0].username;
        grants = await getGrants(pool, db, userRows[0].role_id, {
          username: userRows[0].username, roleId: userRows[0].role_id,
        });
      }
    }

    if (!grants.EXPORT?.[1] && username.toLowerCase() !== 'admin' && username !== db) {
      return res.status(403).json([{ error: 'You do not have permission to import to the database' }]);
    }

    // ── Get BKI content ──
    let bkiContent = '';
    if (req.file) {
      const entries = readZip(req.file.buffer);
      const bkiEntry = entries.find(e => e.name.endsWith('.bki')) || entries.find(e => e.name.endsWith('.dmp')) || entries[0];
      if (!bkiEntry) return res.status(400).json([{ error: 'No .bki file found in ZIP' }]);
      bkiContent = bkiEntry.content.toString('utf8');
    } else if (typeof req.body === 'string') {
      bkiContent = req.body;
    } else if (req.body?.content) {
      bkiContent = req.body.content;
    } else if (req.body?.data) {
      bkiContent = req.body.data;
    }

    if (!bkiContent) {
      return res.status(400).json([{ error: 'No BKI content provided' }]);
    }

    // Remove BOM if present
    if (bkiContent.charCodeAt(0) === 0xFEFF || bkiContent.startsWith('\xEF\xBB\xBF')) {
      bkiContent = bkiContent.replace(/^\uFEFF/, '').replace(/^\xEF\xBB\xBF/, '');
    }

    const lines = bkiContent.split(/\r?\n/);
    let lineIdx = 0;

    // ── Detect plain data vs full BKI ──
    const firstLine = lines[0] || '';
    const plainData = firstLine.startsWith('DATA');

    // Build import context (reuse constructHeader's ctx format)
    const ctx = {
      localStruct: {},
      base: {},
      uniq: {},
      parents: {},
      linx: {},
      refs: {},
      arrays: {},
      pwds: {},
      multi: {},
      termDefs: {},
      objSubst: {},
    };

    let rootTypeId;
    const imported = {}; // imported structure from BKI header

    if (plainData) {
      // Plain data — structure already exists in DB, just import data rows
      const id = Number(req.body?.id || req.query?.id);
      if (!id || id <= 1) {
        return res.status(400).json([{ error: 'Plain DATA import requires ?id=<typeId> parameter' }]);
      }
      rootTypeId = id;
      await constructHeader(pool, db, rootTypeId, ctx);
      lineIdx = 1; // skip "DATA" line
    } else {
      // Full BKI — parse header first
      // First line is the root type definition
      const rootTypParts = firstLine.split(':');
      rootTypeId = Number(rootTypParts[0]);
      if (!rootTypeId || rootTypeId <= 1) {
        return res.status(400).json([{ error: `Invalid metadata type ${rootTypParts[0]}` }]);
      }

      // Build local structure for root type
      await constructHeader(pool, db, rootTypeId, ctx);

      // ── Parse header lines (type definitions) until DATA ──
      for (lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx].trim();
        if (line === 'DATA' || line === '') {
          if (line === 'DATA') { lineIdx++; }
          break;
        }

        // Parse type definition line: "id:name:baseType:attr;reqId:reqDef;..."
        const fields = UnHideDelimiters(line).split(';').filter(s => s.length > 0);
        const typ = fields[0].split(':');
        const obj = Number(typ[0]);
        if (!obj) continue;

        // Store imported structure
        let order = 0;
        for (const field of fields) {
          imported[obj] = imported[obj] || {};
          imported[obj][order++] = UnHideDelimiters(field);
        }

        // Resolve type conflicts (only for non-reference types: count > 2 parts)
        if (typ.length > 2) {
          if (await isOccupied(pool, db, obj)) {
            await constructHeader(pool, db, obj, ctx);
            if (ctx.localStruct[obj] && ctx.localStruct[obj][0] !== imported[obj][0]) {
              await resolveType(pool, db, typ, ctx);
            }
          } else {
            // ID is free — create type with this ID
            const baseTypeId = BASE_TYPE_BY_NAME[typ[2]];
            if (baseTypeId !== undefined) {
              await execSql(pool, `INSERT INTO \`${db}\` (id, up, ord, t, val) VALUES (?, 0, ?, ?, ?)`, [obj, typ[3] ? 1 : 0, baseTypeId, typ[1]], { label: 'query_insert' });
              ctx.localStruct[obj] = { 0: imported[obj][0] };
            }
          }
        }
      }

      // ── Reconcile imported structure with local ──
      // PHP parity: index.php lines 5331–5435
      const localTypes = {};

      for (const [parStr, reqs] of Object.entries(imported)) {
        const par = Number(parStr);
        const parent = checkSubst(par, ctx);

        for (const [orderStr, req] of Object.entries(reqs)) {
          const order = Number(orderStr);
          if (order === 0) continue;

          const typ = UnHideDelimiters(HideDelimiters(req).split(':')).length > 0
            ? HideDelimiters(req).split(':').map(s => UnHideDelimiters(s))
            : [req];

          const value = typ[0] + ':' + checkSubst(Number(typ[1]) || typ[1], ctx);

          // Check if this requisite already exists in local structure
          let found = false;
          let localType = null;
          if (ctx.localStruct[parent]) {
            for (const [lt, lv] of Object.entries(ctx.localStruct[parent])) {
              if (lv.startsWith(value)) {
                found = true;
                localType = lt;
                break;
              }
            }
          }

          if (found) {
            if (typ[0] === 'ref') {
              localTypes[par] = localTypes[par] || {};
              localTypes[par][order] = typ[2];
            } else {
              localTypes[par] = localTypes[par] || {};
              localTypes[par][order] = localType;
            }
          } else if (typ[0] === 'ref') {
            // Reference requisite — create or find
            const reqID = Number(typ[1]);
            let refID = Number(typ[2]);
            const refObj = imported[typ[2]] ? imported[typ[2]][0].split(':') : [];
            const refObjName = checkSubst(Number(refObj[1]) || 0, ctx);

            // Create ref object if needed
            if (await isOccupied(pool, db, refID)) {
              const { rows: seekRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE up = 0 AND t = ? AND val = ''`, [refObjName], { label: 'query_select' });
              if (seekRows.length > 0) {
                refID = seekRows[0].id;
              } else {
                refID = await bkiInsertRow(pool, db, 0, 0, refObjName, '');
                if (!ctx.localStruct.subst) ctx.localStruct.subst = {};
                ctx.localStruct.subst[typ[2]] = refID;
              }
            } else {
              await execSql(pool, `INSERT INTO \`${db}\` (id, up, ord, t, val) VALUES (?, 0, 0, ?, '')`, [refID, refObjName], { label: 'query_insert' });
            }
            ctx.refs[refID] = '';

            // Create ref requisite if needed
            let finalReqID = reqID;
            if (await isOccupied(pool, db, reqID)) {
              const { rows: seekRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE t = ? AND up = ?`, [refID, parent], { label: 'query_select' });
              if (seekRows.length > 0) {
                finalReqID = seekRows[0].id;
              } else {
                finalReqID = await bkiInsertRow(pool, db, parent, order, refID,
                  typ[3] ? UnMaskDelimiters(typ[3]) : '');
                if (!ctx.localStruct.subst) ctx.localStruct.subst = {};
                ctx.localStruct.subst[reqID] = finalReqID;
              }
            } else {
              await execSql(pool, `INSERT INTO \`${db}\` (id, up, ord, t, val) VALUES (?, ?, ?, ?, '')`, [reqID, parent, order, refID], { label: 'query_insert' });
            }

            // Check MULTI
            if (typ[3] && UnMaskDelimiters(typ[3]).includes(':MULTI:')) {
              ctx.multi[finalReqID] = refID;
            }
            ctx.refs[finalReqID] = refID;
            localTypes[par] = localTypes[par] || {};
            localTypes[par][order] = checkSubst(finalReqID, ctx);
          } else if (typ[0] === 'arr') {
            // Array requisite
            const arrTypeId = checkSubst(Number(typ[1]), ctx);
            const newReqId = await bkiInsertRow(pool, db, parent, order, arrTypeId,
              typ[2] ? UnMaskDelimiters(typ[2]) : '');
            ctx.localStruct[parent] = ctx.localStruct[parent] || {};
            ctx.localStruct[parent][newReqId] = req;
            localTypes[par] = localTypes[par] || {};
            localTypes[par][order] = newReqId;
            ctx.parents[arrTypeId] = parent;
          } else {
            // Plain requisite — find analogue or create new
            const baseId = BASE_TYPE_BY_NAME[typ[1]];
            let typeId;
            if (baseId !== undefined) {
              const { rows: seekRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE val = ? AND up = 0 AND id != t AND t = ?`, [typ[0], baseId], { label: 'query_select' });
              if (seekRows.length > 0) {
                typeId = seekRows[0].id;
              } else {
                typeId = await bkiInsertRow(pool, db, 0, 0, baseId, typ[0]);
              }
            } else {
              typeId = await bkiInsertRow(pool, db, 0, 0, BASE_TYPE_BY_NAME.SHORT || 3, typ[0]);
            }
            const nextOrd = await getOrd(pool, db, parent);
            const newReqId = await bkiInsertRow(pool, db, parent, nextOrd, typeId,
              typ[2] ? UnMaskDelimiters(typ[2]) : '');
            ctx.localStruct[parent] = ctx.localStruct[parent] || {};
            ctx.localStruct[parent][newReqId] = req;
            localTypes[par] = localTypes[par] || {};
            localTypes[par][order] = newReqId;
          }
        }
      }

      // Store localTypes in ctx for data import phase
      ctx._localTypes = localTypes;
    }

    // ── Import DATA rows ──
    // PHP parity: index.php lines 5437–5761
    const parentId = Number(req.body?.parent || req.query?.parent) || 1;
    const curParent = { 0: parentId };
    const curOrder = {};
    const batchRows = [];
    let importCount = 0;
    let warnings = '';

    const typesCount = ctx._localTypes && ctx._localTypes[rootTypeId]
      ? Object.keys(ctx._localTypes[rootTypeId]).length
      : (ctx.localStruct[rootTypeId] ? Object.keys(ctx.localStruct[rootTypeId]).length : 0);
    const isUnique = ctx.uniq[rootTypeId] === '1' || ctx.uniq[rootTypeId] === 1;

    for (; lineIdx < lines.length; lineIdx++) {
      let line = lines[lineIdx];
      if (!line || line.trim().length === 0) continue;

      if (plainData) {
        // Plain data format: semicolon-separated fields matching local structure
        const fields = UnHideDelimiters(HideDelimiters(line).split(';')).length > 0
          ? HideDelimiters(line).split(';').map(s => UnHideDelimiters(s))
          : line.split(';');

        if (!fields[0] || fields[0].trim() === '') {
          warnings += `Skipped empty object at line ${lineIdx + 1}. `;
          continue;
        }

        // Format the main value
        const mainVal = formatVal(ctx.base[rootTypeId], UnMaskDelimiters(fields[0]));

        // Check unique constraint
        let existingId = null;
        if (isUnique) {
          const { rows: existRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE up = ? AND t = ? AND val = ? LIMIT 1`, [curParent[ctx.parents[rootTypeId]] || parentId, rootTypeId, mainVal], { label: 'query_select' });
          if (existRows.length > 0) existingId = existRows[0].id;
        }

        const newId = existingId || await bkiInsertRow(pool, db,
          curParent[ctx.parents[rootTypeId]] || parentId,
          curOrder[curParent[ctx.parents[rootTypeId]] || parentId]
            ? ++curOrder[curParent[ctx.parents[rootTypeId]] || parentId]
            : (curOrder[curParent[ctx.parents[rootTypeId]] || parentId] = await getOrd(pool, db, curParent[ctx.parents[rootTypeId]] || parentId, rootTypeId)),
          rootTypeId, mainVal);

        // Import requisite values
        let fieldIdx = 1;
        for (const [key] of Object.entries(ctx.localStruct[rootTypeId] || {}).sort((a, b) => Number(a[0]) - Number(b[0]))) {
          if (Number(key) === 0) continue;
          if (fieldIdx >= fields.length) break;
          const fieldVal = fields[fieldIdx++];
          if (!fieldVal || fieldVal.length === 0) continue;

          if (ctx.refs[key] !== undefined) {
            // Reference — resolve by value
            const refType = ctx.refs[key];
            if (ctx.multi[key]) {
              const multies = fieldVal.split(',');
              let ord = 1;
              for (const ref of multies) {
                const refInt = parseInt(ref.trim(), 10);
                if (refInt) {
                  batchRows.push([newId, ord++, checkObjSubst(refInt, ctx), Number(key)]);
                }
              }
            } else if (parseInt(fieldVal, 10)) {
              batchRows.push([newId, 1, checkObjSubst(parseInt(fieldVal, 10), ctx), Number(key)]);
            }
          } else {
            // Plain value
            const fmtVal = formatVal(ctx.base[key], UnMaskDelimiters(fieldVal));
            if (fmtVal !== ' ' && fmtVal !== '') {
              batchRows.push([newId, 1, Number(key), fmtVal]);
            }
          }
        }
        importCount++;
      } else {
        // Full BKI data format: "refAttr:typeId:name:val;req1;req2;..."
        const fields = HideDelimiters(line).split(';').map(s => UnHideDelimiters(s));
        const typ = HideDelimiters(fields[0]).split(':').map(s => UnHideDelimiters(s));

        let isref = 0;
        if (typ.length === 4) {
          // Reference attribute
          isref = checkSubst(parseInt(typ.shift(), 10), ctx);
        }

        const orig = parseInt(typ[0], 10);
        const t = checkSubst(orig, ctx);

        if (!ctx.localStruct[t]) {
          return res.status(400).json({
            error: `Line ${lineIdx + 1}: Invalid type ${t} not present in metadata`,
          });
        }

        if (typ[2] === undefined || typ[2] === '') {
          return res.status(400).json({
            error: `Line ${lineIdx + 1}: Empty object of type ${t}`,
          });
        }

        // Resolve parent
        let parent, ord;
        if (curParent[ctx.parents[t]] !== undefined) {
          parent = curParent[ctx.parents[t]];
          if (curOrder[parent] !== undefined) {
            ord = ++curOrder[parent];
          } else {
            ord = curOrder[parent] = await getOrd(pool, db, parent, t);
          }
        } else {
          parent = 1;
          ord = 1;
        }

        let newId;
        if (typ[1] === '' || typ[1] === undefined) {
          // No ID specified — just insert
          newId = await bkiInsertRow(pool, db, parent, ord, t, UnMaskDelimiters(typ[2]));
        } else {
          // ID specified — check for collision
          newId = parseInt(typ[1], 10);
          const { rows: checkRows } = await execSql(pool, `SELECT t, val FROM \`${db}\` WHERE id = ?`, [newId], { label: 'query_select' });
          if (checkRows.length > 0) {
            if (checkRows[0].t === t && checkRows[0].val === typ[2]) {
              // Exact match — reuse
            } else {
              // ID collision — create new and record substitution
              const { rows: valCheck } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE t = ? AND val = ?`, [t, typ[2]], { label: 'query_select' });
              if (valCheck.length > 0) {
                newId = ctx.objSubst[newId] = valCheck[0].id;
              } else {
                const createdId = await bkiInsertRow(pool, db, parent, ord, t, UnMaskDelimiters(typ[2]));
                ctx.objSubst[newId] = createdId;
                newId = createdId;
              }
            }
          } else {
            // ID is free
            if (isref) {
              await execSql(pool, `INSERT INTO \`${db}\` (id, up, ord, t, val) VALUES (?, 1, 1, ?, ?)`, [newId, t, UnMaskDelimiters(typ[2])], { label: 'query_insert' });
            } else {
              await execSql(pool, `INSERT INTO \`${db}\` (id, up, ord, t, val) VALUES (?, ?, ?, ?, ?)`, [newId, parent, ord, t, UnMaskDelimiters(typ[2])], { label: 'query_insert' });
            }
          }
        }

        curParent[t] = newId;

        // Import requisite values from remaining fields
        let fieldOrder = 0;
        for (let fi = 1; fi < fields.length; fi++) {
          fieldOrder++;
          const fieldVal = fields[fi];
          if (!fieldVal || fieldVal.length === 0) continue;

          const key = (ctx._localTypes && ctx._localTypes[orig] && ctx._localTypes[orig][fieldOrder])
            ? ctx._localTypes[orig][fieldOrder]
            : (ctx.localStruct[t] ? Object.keys(ctx.localStruct[t]).sort((a, b) => Number(a) - Number(b))[fieldOrder] : null);

          if (!key) continue;

          if (ctx.refs[key] !== undefined) {
            // Reference
            if (ctx.multi[key]) {
              const multies = fieldVal.split(',');
              let refOrd = 1;
              for (const ref of multies) {
                const refInt = parseInt(ref.trim(), 10);
                if (refInt) {
                  batchRows.push([newId, refOrd++, checkObjSubst(refInt, ctx), Number(key)]);
                }
              }
            } else if (fieldVal.includes(':') || parseInt(fieldVal, 10) === 0) {
              // Reference by value "ID:Value" or ":Value"
              const refType = ctx.refs[key];
              let refObjID = 0;
              let refObjVal = fieldVal;
              if (fieldVal.includes(':')) {
                const tmp = HideDelimiters(fieldVal).split(':').map(s => UnHideDelimiters(s));
                refObjID = parseInt(tmp[0], 10) || 0;
                refObjVal = tmp[1] || '';
              }

              if (refObjID > 0) {
                const { rows: chk } = await execSql(pool, `SELECT t, val FROM \`${db}\` WHERE id = ?`, [refObjID], { label: 'key_select' });
                if (chk.length > 0) {
                  if (chk[0].t !== refType) {
                    // Type mismatch — create new
                    refObjID = ctx.objSubst[refObjID] = await bkiInsertRow(pool, db, 1, 1, refType, refObjVal);
                  }
                } else if (refObjVal) {
                  await execSql(pool, `INSERT INTO \`${db}\` (id, up, ord, t, val) VALUES (?, 1, 1, ?, ?)`, [refObjID, refType, refObjVal], { label: 'key_insert' });
                }
              } else if (refObjVal) {
                const { rows: seekRows } = await execSql(pool, `SELECT id FROM \`${db}\` WHERE t = ? AND val = ?`, [refType, refObjVal], { label: 'key_select' });
                if (seekRows.length > 0) {
                  refObjID = seekRows[0].id;
                } else {
                  refObjID = await bkiInsertRow(pool, db, 1, 1, refType, refObjVal);
                }
              }
              if (refObjID) {
                batchRows.push([newId, 1, refObjID, Number(key)]);
              }
            } else if (parseInt(fieldVal, 10) !== 0) {
              // Reference set by ID
              batchRows.push([newId, 1, checkObjSubst(parseInt(fieldVal, 10), ctx), Number(key)]);
            }
          } else {
            // Plain requisite
            batchRows.push([newId, 1, Number(key), UnMaskDelimiters(fieldVal)]);
          }
        }
        importCount++;
      }
    }

    // Flush batch rows
    if (batchRows.length > 0) {
      await insertBatch(pool, db, batchRows, {
        columns: '`up`, `ord`, `t`, `val`',
        ignore: true,
      });
    }

    logger.info('[Legacy BKI import] Completed', { db, importCount, batchRows: batchRows.length, warnings: warnings || undefined });
    res.json({
      status: 'Ok',
      imported: importCount,
      rows: batchRows.length,
      warnings: warnings || undefined,
    });
  } catch (error) {
    logger.error('[Legacy BKI import] Error', { error: error.message, db });
    res.status(500).json([{ error: 'BKI import failed: ' + error.message }]);
  }
});

// ============================================================================
// restore - Import from binary dump (P0 Critical)
// PHP: index.php lines 4178–4238
// Parses compact dump format and generates INSERT statements
// ============================================================================

/**
 * restore - Restore database from binary dump
 * POST /:db/restore
 *
 * PHP: index.php lines 4178–4238
 * Requires EXPORT grant on root (1) or admin user.
 * Accepts a .zip file upload (multipart/form-data field "file") containing a .dmp backup.
 * Also accepts raw dump text in body.content / body.data for API clients.
 */
router.post('/:db/restore', (req, res, next) => {
  // Accept optional file upload (same memory multer used elsewhere)
  upload.single('file')(req, res, next);
}, async (req, res) => {
  const { db } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database' }]);
  }

  try {
    const pool = getPool();

    // Get token and verify grants
    const token = req.cookies[db] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    let username = '';
    let grants = {};

    if (token) {
      const { rows: userRows } = await execSql(pool, `
        SELECT u.id, u.val AS username, role_def.id AS role_id
        FROM ${db} tok
        JOIN ${db} u ON tok.up = u.id
        LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
        WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
        LIMIT 1
      `, [token], { label: 'post_db_restore_select' });

      if (userRows.length > 0) {
        username = userRows[0].username;
        grants = await getGrants(pool, db, userRows[0].role_id, {
          username: userRows[0].username, roleId: userRows[0].role_id,
        });
      }
    }

    // Check EXPORT grant (same as backup for restore)
    if (!grants.EXPORT?.[1] && username.toLowerCase() !== 'admin' && username !== db) {
      return res.status(403).json([{ error: 'You do not have permission to import to the database' }]);
    }

    // Get dump content: file upload (ZIP) > backup_file param > body.content > body.data
    let dumpContent = '';
    if (req.file) {
      // Extract .dmp text from uploaded ZIP
      const entries = readZip(req.file.buffer);
      const dmpEntry = entries.find(e => e.name.endsWith('.dmp')) || entries[0];
      if (!dmpEntry) return res.status(400).json([{ error: 'No .dmp file found in ZIP' }]);
      dumpContent = dmpEntry.content.toString('utf8');
    } else if (req.body?.backup_file || req.query?.backup_file) {
      // PHP: ?backup_file=path reads a ZIP from the filesystem
      // Restrict to the db's download directory (no path traversal)
      const backupFileName = path.basename(req.body.backup_file || req.query.backup_file);
      const backupDir = path.join(legacyPath, 'download', db);
      const backupFilePath = path.join(backupDir, backupFileName);
      if (!backupFilePath.startsWith(backupDir + path.sep) && backupFilePath !== backupDir) {
        return res.status(400).json([{ error: 'Invalid backup_file path' }]);
      }
      if (!fs.existsSync(backupFilePath)) {
        return res.status(400).json([{ error: 'Backup file not found' }]);
      }
      const fileBuffer = fs.readFileSync(backupFilePath);
      if (backupFileName.endsWith('.zip')) {
        const entries = readZip(fileBuffer);
        const dmpEntry = entries.find(e => e.name.endsWith('.dmp')) || entries[0];
        if (!dmpEntry) return res.status(400).json([{ error: 'No .dmp file found in ZIP' }]);
        dumpContent = dmpEntry.content.toString('utf8');
      } else {
        dumpContent = fileBuffer.toString('utf8');
      }
    } else if (typeof req.body === 'string') {
      dumpContent = req.body;
    } else if (req.body?.content) {
      dumpContent = req.body.content;
    } else if (req.body?.data) {
      dumpContent = req.body.data;
    }

    if (!dumpContent) {
      return res.status(400).json([{ error: 'No backup content provided' }]);
    }

    // Parse the dump format (PHP lines 4196–4237)
    const lines = dumpContent.split('\n');
    let lastId = 0;
    let lastUp = 0;
    let lastT = 0;
    const rows = [];

    for (let line of lines) {
      if (line.length === 0 || line.trim().length === 0) continue;

      // Remove BOM if present
      if (line.charCodeAt(0) === 0xFEFF) line = line.substring(1);

      // Parse ID delta
      if (line.startsWith('/')) {
        lastId++;
        line = line.substring(1);
      } else if (line.startsWith(';')) {
        lastId++;
        line = line.substring(1);
      } else {
        const delimPos = line.indexOf(';');
        if (delimPos > 0) lastId += parseInt(line.substring(0, delimPos), 36);
        line = line.substring(delimPos + 1);
      }

      // Parse up
      let delimPos = line.indexOf(';');
      if (delimPos > 0) lastUp = parseInt(line.substring(0, delimPos), 36);
      line = line.substring(delimPos + 1);

      // Parse t
      delimPos = line.indexOf(';');
      if (delimPos > 0) lastT = parseInt(line.substring(0, delimPos), 36);
      line = line.substring(delimPos + 1);

      // Parse ord
      delimPos = line.indexOf(';');
      let ord = 1;
      if (delimPos > 0) { const ordVal = parseInt(line.substring(0, delimPos), 10); ord = isNaN(ordVal) ? 1 : ordVal; }
      line = line.substring(delimPos + 1);

      // Val is the rest (with newline escaping removed)
      const val = line.replace(/&ritrn;/g, '\n').replace(/&ritrr;/g, '\r');
      rows.push([lastId, lastT, lastUp, ord, val]);
    }

    if (rows.length === 0) {
      return res.status(400).json([{ error: 'Empty or unrecognised dump file' }]);
    }

    // PHP parity: ?sql returns SQL statements as plain text instead of executing
    if (req.query.sql !== undefined) {
      const sqlLines = [];
      const BATCH = 1000;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const values = batch.map(r =>
          `(${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${pool.escape(r[4])})`
        ).join(',\n');
        sqlLines.push(`INSERT IGNORE INTO \`${db}\` (\`id\`, \`t\`, \`up\`, \`ord\`, \`val\`) VALUES\n${values};`);
      }
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(sqlLines.join('\n\n'));
    }

    // Execute in batches using insertBatch utility
    await insertBatch(pool, db, rows, {
      columns: '`id`, `t`, `up`, `ord`, `val`',
      ignore: true,
    });

    logger.info('[Legacy restore] Import completed', { db, rowCount: rows.length });
    res.json({ status: 'Ok', rows: rows.length });
  } catch (error) {
    logger.error('[Legacy restore] Error', { error: error.message, db });
    res.status(500).json([{ error: 'Restore failed: ' + error.message }]);
  }
});

// ============================================================================
// Action Aliases (PHP lines 8551–8759)
// PHP uses case fall-through for alternative action names. These aliases
// map to their canonical implementations.
// ============================================================================

/**
 * PHP Action Alias Mappings
 * Format: { alias: canonical }
 */
const ACTION_ALIASES = {
  // DDL aliases
  '_setalias': '_d_alias',
  '_setnull': '_d_null',
  '_setmulti': '_d_multi',
  '_setorder': '_d_ord',
  '_moveup': '_d_up',
  '_deleteterm': '_d_del',
  '_deletereq': '_d_del_req',
  '_attributes': '_d_req',
  '_terms': '_d_new',
  '_references': '_d_ref',
  '_patchterm': '_d_save',
  '_modifiers': '_d_attrs',
};

/**
 * Alias handler middleware - redirects aliased actions to canonical routes
 * POST /:db/<alias>/:id?
 */
router.post('/:db/_setalias/:reqId', (req, res, next) => {
  req.url = req.url.replace('/_setalias/', '/_d_alias/');
  req.params.reqId = req.params.reqId;
  next('route');
});

router.post('/:db/_setnull/:reqId', (req, res, next) => {
  req.url = req.url.replace('/_setnull/', '/_d_null/');
  req.params.reqId = req.params.reqId;
  next('route');
});

router.post('/:db/_setmulti/:reqId', (req, res, next) => {
  req.url = req.url.replace('/_setmulti/', '/_d_multi/');
  req.params.reqId = req.params.reqId;
  next('route');
});

router.post('/:db/_setorder/:reqId', (req, res, next) => {
  req.url = req.url.replace('/_setorder/', '/_d_ord/');
  req.params.reqId = req.params.reqId;
  next('route');
});

router.post('/:db/_moveup/:reqId', (req, res, next) => {
  req.url = req.url.replace('/_moveup/', '/_d_up/');
  req.params.reqId = req.params.reqId;
  next('route');
});

router.post('/:db/_deleteterm/:typeId', (req, res, next) => {
  req.url = req.url.replace('/_deleteterm/', '/_d_del/');
  req.params.typeId = req.params.typeId;
  next('route');
});

router.post('/:db/_deletereq/:reqId', (req, res, next) => {
  req.url = req.url.replace('/_deletereq/', '/_d_del_req/');
  req.params.reqId = req.params.reqId;
  next('route');
});

router.post('/:db/_attributes/:typeId', (req, res, next) => {
  req.url = req.url.replace('/_attributes/', '/_d_req/');
  req.params.typeId = req.params.typeId;
  next('route');
});

router.post('/:db/_terms/:parentTypeId?', (req, res, next) => {
  req.url = req.url.replace('/_terms', '/_d_new');
  next('route');
});

router.post('/:db/_references/:parentTypeId', (req, res, next) => {
  req.url = req.url.replace('/_references/', '/_d_ref/');
  req.params.parentTypeId = req.params.parentTypeId;
  next('route');
});

router.post('/:db/_patchterm/:typeId', (req, res, next) => {
  req.url = req.url.replace('/_patchterm/', '/_d_save/');
  req.params.typeId = req.params.typeId;
  next('route');
});

router.post('/:db/_modifiers/:reqId', (req, res, next) => {
  req.url = req.url.replace('/_modifiers/', '/_d_attrs/');
  req.params.reqId = req.params.reqId;
  next('route');
});

// ============================================================================
// action=report in POST /:db (P0 Critical)
// PHP: index.php lines 3756–3870
// JS client sends POST /:db with body {action: "report", id: <reportId>, ...}
// ============================================================================

/**
 * Handle action=report in the generic POST /:db handler
 * This intercepts the request before the page-renderer handles it
 */
router.post('/:db', async (req, res, next) => {
  const { db } = req.params;
  const action = req.body.action || req.query.action;

  // Only handle action=report, let other requests pass through
  if (action !== 'report') {
    return next();
  }

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database' }]);
  }

  const reportId = parseInt(req.body.id || req.query.id, 10);
  if (!reportId) {
    return res.status(200).json([{ error: 'Report ID required' }]);
  }

  try {
    const pool = getPool();

    // Compile and execute the report
    const report = await compileReport(pool, db, reportId);
    if (!report) {
      return res.status(404).json([{ error: 'Report not found' }]);
    }

    // Parse filters from request
    const filters = {};
    const params = { ...req.query, ...req.body };

    for (const col of report.columns) {
      const colName = col.alias;
      const filter = {};

      if (params[`FR_${colName}`]) filter.from = params[`FR_${colName}`];
      if (params[`TO_${colName}`]) filter.to = params[`TO_${colName}`];
      if (params[`EQ_${colName}`]) filter.eq = params[`EQ_${colName}`];
      if (params[`LIKE_${colName}`]) filter.like = params[`LIKE_${colName}`];

      if (Object.keys(filter).length > 0) {
        filters[colName] = filter;
      }
    }

    // Parse LIMIT: handles "offset,count" format from smartq.js (e.g. "0,50" or "50,50")
    let limit = 100, offset = 0;
    const rawLimit = params.LIMIT || params.limit;
    if (rawLimit) {
      const parts = String(rawLimit).split(',');
      if (parts.length === 2) {
        offset = parseInt(parts[0], 10) || 0;
        limit = parseInt(parts[1], 10) || 100;
      } else {
        limit = parseInt(parts[0], 10) || 100;
        offset = parseInt(params.F || params.offset || 0, 10);
      }
    } else {
      offset = parseInt(params.F || params.offset || 0, 10);
    }

    // PHP parity: ?WHERE= request parameter overrides stored REP_WHERE
    if (params.WHERE) {
      filters._where = params.WHERE;
    }
    // Build user context for BuiltIn placeholder substitution in stored WHERE
    const reportUserCtx = req.legacyUser ? {
      username: req.legacyUser.username || '',
      uid: req.legacyUser.uid || '',
      role: req.legacyUser.role || '',
      roleId: req.legacyUser.roleId || '',
      tzone: req.legacyUser.tzone || 0,
      ip: req.ip || '',
      reqHeaders: req.headers || {},
      remoteHost: req.headers['x-forwarded-host'] || req.headers['host'] || '',
      userAgent: req.headers['user-agent'] || '',
      referer: req.headers['referer'] || '',
    } : null;

    const q = req.query;

    // CSV export: fetch all rows (no LIMIT) to match PHP behaviour
    const wantCsv = q.csv !== undefined || q.format === 'csv';
    if (wantCsv) {
      limit = 999999;
      offset = 0;
    }

    const results = await executeReport(pool, db, report, filters, limit, offset, null, 0, reportUserCtx);

    // RECORD_COUNT: smartq.js calls ?JSON&RECORD_COUNT → {count: N}
    if (q.RECORD_COUNT !== undefined) {
      const cntResults = await executeReport(pool, db, report, filters, 999999, 0, null, 0, reportUserCtx);
      return res.json({ count: cntResults.rownum });
    }

    // CSV export (?csv or ?format=csv)
    if (wantCsv) {
      const { csv, filename } = formatReportCsv(report, results.data, reportId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    }

    // JSON_KV format: [{col_name: val, ...}, ...]
    if (q.JSON_KV !== undefined) {
      const rows = results.data.map(row => {
        const obj = {};
        for (const col of report.columns) obj[col.name] = row[col.alias] ?? '';
        return obj;
      });
      return res.json(rows);
    }

    // JSON_DATA format: {col_name: [val0, val1, ...], ...} — all rows per column
    if (q.JSON_DATA !== undefined) {
      const obj = {};
      for (const col of report.columns) obj[col.name] = results.data.map(row => row[col.alias] ?? '');
      return res.json(obj);
    }

    // PHP JSON_CR: rows = object keyed by numeric index {0: {col_id: val}, 1: ...}
    // columns[i] = {id, name, type:"string"}; all values as strings
    if (q.JSON_CR !== undefined) {
      const cols = report.columns.map((col, i) => ({
        id: String(col.id || i),
        name: col.name,
        type: 'string'
      }));
      const rowsObj = {};
      for (let idx = 0; idx < results.data.length; idx++) {
        const row = results.data[idx];
        const r = {};
        for (const col of report.columns) r[String(col.id || '')] = String(row[col.alias] ?? '');
        rowsObj[idx] = r;
      }
      return res.json({ columns: cols, rows: rowsObj, totalCount: results.data.length });
    }

    // Hierarchical format: group rows by parent (up field)
    if (q.JSON_HR !== undefined) {
      const cols = report.columns.map(col => ({ id: col.id, name: col.name, type: col.reqTypeId || 0 }));
      const groups = {};
      for (const row of results.data) {
        const parentId = row.up || 0;
        if (!groups[parentId]) groups[parentId] = [];
        const entry = {};
        for (const col of report.columns) entry[col.id] = row[col.alias] ?? '';
        groups[parentId].push(entry);
      }
      return res.json({ columns: cols, groups, totalCount: results.data.length });
    }

    // PHP default JSON: row-major data[row_index][col_index], totals embedded in columns
    if (isApiRequest(req)) {
      const totalsMap = results.totals || {};
      const cols = report.columns.map(col => ({
        id: String(col.id),
        name: col.name,
        type: String(col.reqTypeId || 0),
        format: REV_BASE_TYPE[col.baseType] || 'CHARS',
        align: col.align || 'LEFT',
        totals: totalsMap[col.alias] !== undefined ? totalsMap[col.alias] : null,
        ref: col.isRef ? col.baseType : null,
      }));
      const data = results.data.map(row =>
        report.columns.map(col => row[col.alias] ?? '')
      );
      return res.json({ columns: cols, data, rownum: results.rownum });
    }

    // Non-API fallback
    return res.json({
      report: { id: report.id, name: report.header, columns: report.columns },
      data: results.data,
      totals: results.totals,
      rownum: results.rownum
    });
  } catch (error) {
    logger.error('[Legacy action=report] Error', { error: error.message, db, reportId });
    return res.status(200).json([{ error: error.message }]);
  }
});

// ============================================================================
// Generic fallback for unknown actions
// ============================================================================

router.post('/:db/:action', async (req, res) => {
  const { db, action } = req.params;

  // Validate DB name
  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  logger.warn('[Legacy API] Unknown action', { db, action, body: req.body });

  res.json({ success: false, error: `Unknown action: ${action}` });
});

// Named exports for testing (Phase 1 helpers)
export {
  legacyAuthMiddleware,
  legacyXsrfCheck,
  checkTypesGrant,
  legacyDdlGrantCheck,
  resolveBuiltIn,
  recursiveDelete,
  removeDir,
  checkDuplicatedReqs,
  isBlacklisted,
  getSubdir,
  getFilename,
  normalSize,
  checkNewRef,
  isRef,
  checkValGranted,
  checkRepColGranted,
  constructWhere,
  formatDateForStorage,
  sendMail,
  sanitizeIdentifier,
  checkInjection,
  getRefOrd,
  calcOrder,
  isDbVacant,
  updateTokens,
  getCurrentValues,
  getFile,
  makeTree,
  parseBlock,
  localize,
  removeMasks,
};

export default router;
