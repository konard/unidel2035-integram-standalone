// Legacy PHP Backend Compatibility Layer
// Allows legacy HTML frontend (integram-server/) to work with new Node.js backend
// Maps old PHP URL patterns to new API endpoints

import express from 'express';
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import zlib from 'zlib';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from '../../utils/logger.js';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import nodemailer from 'nodemailer';

const router = express.Router();

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
 * Build &main.myrolemenu from role row's menu items.
 * Menu items are non-type children of the role row (up=roleRowId, id!=t)
 * that have their own non-type children with non-empty vals (the Address/href children).
 * name = menu item's own val, href = first non-empty child val.
 *
 * @param {object} pool  - MySQL pool
 * @param {string} db      - database name
 * @param {number} roleObjId - ID of the role OBJECT (e.g. 145 for "admin"), NOT the assignment row
 * @returns {object} {href: [...], name: [...]}
 */
async function buildMyrolemenu(pool, db, roleObjId) {
  const empty = { href: [], name: [] };
  if (!roleObjId) return empty;
  try {
    // Get menu items: children of role row whose type has base SHORT (t=3)
    // Excludes GRANT-type (Objects) and MEMO-type (Description) children.
    const [menuItems] = await pool.query(
      `SELECT m.id, m.val AS name
       FROM \`${db}\` m
       JOIN \`${db}\` menu_typ ON menu_typ.id = m.t AND menu_typ.t = ${TYPE.SHORT}
       WHERE m.up = ? AND m.val != ''
       ORDER BY m.ord`,
      [roleObjId]
    );
    if (menuItems.length === 0) return empty;
    const mIds = menuItems.map(m => m.id);
    const ph   = mIds.map(() => '?').join(',');
    // Get Address children (first non-empty non-type child of each menu item)
    const [addrRows] = await pool.query(
      `SELECT a.up, a.val AS href
       FROM \`${db}\` a
       WHERE a.up IN (${ph}) AND a.id != a.t AND a.val != ''
       ORDER BY a.up, a.ord`,
      mIds
    );
    const hrefByParent = {};
    for (const a of addrRows) {
      if (hrefByParent[a.up] === undefined) hrefByParent[a.up] = a.href;
    }
    // Only include menu items that have an href child
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
      [uRows] = await pool.query(
        `SELECT role_def.id AS role_obj_id
         FROM \`${db}\` u
         JOIN \`${db}\` pwd ON pwd.up = u.id AND pwd.t = ${TYPE.PASSWORD} AND pwd.val = ?
         LEFT JOIN (\`${db}\` r CROSS JOIN \`${db}\` role_def)
           ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
         WHERE u.t = ${TYPE.USER} AND u.val = ? LIMIT 1`,
        [pwdHash, basicLogin]
      );
    } else {
      [uRows] = await pool.query(
        `SELECT role_def.id AS role_obj_id
         FROM \`${db}\` u
         JOIN \`${db}\` tok ON tok.up = u.id AND tok.t = ${TYPE.TOKEN} AND tok.val = ?
         LEFT JOIN (\`${db}\` r CROSS JOIN \`${db}\` role_def)
           ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
         WHERE u.t = ${TYPE.USER} LIMIT 1`,
        [token]
      );
    }
    if (uRows && uRows.length > 0) {
      return buildMyrolemenu(pool, db, uRows[0].role_obj_id || null);
    }
  } catch (_e) { /* ignore */ }
  return empty;
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
 * Send OTP email — matches PHP mysendmail() in getcode handler.
 * Config priority: SMTP_* env vars → PHP connection.php defaults.
 * If SMTP_HOST is not set (or connection fails), logs code to console (dev mode).
 *
 * PHP message format (index.php lines 7732-7738):
 *   Subject: "Одноразовый пароль <email>"
 *   Body:    "Ваш код для входа: <XXXX>\r\n\r\n<unsubscribe footer>"
 */
async function sendOtpEmail(email, code, db, host) {
  const smtpHostRaw = process.env.SMTP_HOST || 'ssl://smtp.yandex.ru';
  const smtpPort    = parseInt(process.env.SMTP_PORT || '465', 10);
  const smtpUser    = process.env.SMTP_USER    || 'abc@tryjob.ru';
  const smtpPass    = process.env.SMTP_PASSWORD || 'CoffeeClick';
  const fromEmail   = process.env.FROM_EMAIL    || smtpUser;
  const fromName    = process.env.FROM_NAME     || 'Integram';
  // Handle 'ssl://host' format from PHP config
  const smtpHost    = smtpHostRaw.replace(/^(ssl|tls):\/\//, '');
  const smtpSecure  = smtpHostRaw.startsWith('ssl://') || smtpPort === 465;

  const unsubUrl = `https://${host || 'localhost'}/${db}/register?optout=${encodeURIComponent(email)}`;
  const subject  = `Одноразовый пароль ${email}`;
  const text     = `Ваш код для входа: ${code.toUpperCase()}\r\n\r\nЕсли вы не хотите получать от нас писем, связанных с регистрацией ${email}, вы можете отписаться от оповещений:\r\n${unsubUrl}`;

  if (!process.env.SMTP_HOST) {
    // Dev mode: no SMTP configured — log code so developer can use it
    logger.info('[Legacy GetCode] OTP (no SMTP configured — dev mode)', { email, code: code.toUpperCase() });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost, port: smtpPort, secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });
    await transporter.sendMail({ from: `"${fromName}" <${fromEmail}>`, to: email, subject, text });
    logger.info('[Legacy GetCode] OTP email sent', { email });
  } catch (err) {
    // Log the code so it's not silently lost if SMTP fails
    logger.error('[Legacy GetCode] SMTP error, OTP:', { email, code: code.toUpperCase(), err: err.message });
  }
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
 * Render main.html template with PHP-style global variables.
 * PHP replaces {_global_.xxx} placeholders before serving the template.
 */
async function renderMainPage(db, token) {
  const mainPage = path.join(legacyPath, 'templates/main.html');
  if (!fs.existsSync(mainPage)) return null;

  let html = fs.readFileSync(mainPage, 'utf8');

  // Fetch user data for template variables
  let user = '', userId = 0, xsrf = '', action = '';
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT u.id uid, u.val uname, x.val xsrf_val
       FROM \`${db}\` u
       JOIN \`${db}\` tok ON tok.up = u.id AND tok.t = ${TYPE.TOKEN} AND tok.val = ?
       LEFT JOIN \`${db}\` x ON x.up = u.id AND x.t = ${TYPE.XSRF}
       WHERE u.t = ${TYPE.USER} LIMIT 1`,
      [token]
    );
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
 * @returns {Object} grants object
 */
async function getGrants(pool, db, roleId) {
  const grants = {};

  try {
    const query = `
      SELECT
        gr.val AS obj,
        COALESCE(def.val, '') AS lev,
        mask.val AS mask,
        exp.val AS exp,
        del.val AS del
      FROM ${db} gr
      LEFT JOIN (${db} lev CROSS JOIN ${db} def) ON lev.up = gr.id AND def.id = lev.t AND def.t = ${TYPE.LEVEL}
      LEFT JOIN ${db} mask ON mask.up = gr.id AND mask.t = ${TYPE.MASK}
      LEFT JOIN ${db} exp ON exp.up = gr.id AND exp.t = ${TYPE.EXPORT}
      LEFT JOIN ${db} del ON del.up = gr.id AND del.t = ${TYPE.DELETE}
      WHERE gr.up = ? AND gr.t = ${TYPE.ROLE_OBJECT}
    `;

    const [rows] = await pool.query(query, [roleId]);

    for (const row of rows) {
      if (row.lev && row.lev.length > 0) {
        grants[row.obj] = row.lev;
      }
      if (row.mask && row.mask.length > 0) {
        if (!grants.mask) grants.mask = {};
        if (!grants.mask[row.obj]) grants.mask[row.obj] = {};
        grants.mask[row.obj][row.mask] = row.lev;
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
    const [rows] = await pool.query(query, params);

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
    const [rows] = await pool.query(query, [id]);

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

    case 'NUMBER':
      const numVal = parseInt(String(val).replace(/,/g, '.').replace(/ /g, ''));
      if (numVal !== 0) {
        return numVal;
      }
      break;

    case 'BOOLEAN':
      if (val === '' || String(val).toLowerCase() === 'false' || val === '-1' || val === ' ') {
        return '';
      }
      return '1';

    case 'SIGNED':
      const signedVal = parseFloat(String(val).replace(/,/g, '.').replace(/ /g, '').replace(/\u00A0/g, ''));
      if (signedVal !== 0) {
        return signedVal;
      }
      break;

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
    const [rows] = await pool.query(
      'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1',
      [dbName, db]
    );
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
router.all('/:db/auth', async (req, res, next) => {
  const secret = req.body.secret || req.query.secret;
  if (!secret) return next(); // Not a secret auth request

  const { db } = req.params;
  const isJSON = isApiRequest(req);

  if (!isValidDbName(db)) {
    if (isJSON) return res.status(200).json([{ error: 'Invalid database name' }]);
    return res.status(400).send('Invalid database');
  }

  try {
    const pool = getPool();

    // Look up user by secret token (TYPE.SECRET = 130)
    const [rows] = await pool.query(
      `SELECT u.id uid, u.val username,
              tok.val tok_val,
              token.id token_id, token.val token_val,
              xsrf.id xsrf_id, xsrf.val xsrf_val
       FROM ${db} u
       JOIN ${db} tok ON tok.up = u.id AND tok.t = ${TYPE.SECRET} AND tok.val = ?
       LEFT JOIN ${db} token ON token.up = u.id AND token.t = ${TYPE.TOKEN}
       LEFT JOIN ${db} xsrf ON xsrf.up = u.id AND xsrf.t = ${TYPE.XSRF}
       WHERE u.t = ${TYPE.USER}
       LIMIT 1`,
      [secret]
    );

    if (rows.length === 0) {
      logger.warn('[Legacy SecretAuth] Invalid secret token', { db });
      if (isJSON) return res.status(200).json([{ error: 'Invalid secret token' }]);
      return res.status(401).send('Invalid secret token');
    }

    const user = rows[0];
    // PHP: xsrf($tok, $username) → phpSalt(secret, username, db)
    const xsrf = generateXsrf(secret, user.username, db);

    // Reuse existing token or create a new permanent one
    let tokenVal = user.token_val;
    if (!tokenVal) {
      tokenVal = generateToken();
      await pool.query(
        `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 1, ${TYPE.TOKEN}, ?)`,
        [user.uid, tokenVal]
      );
    }

    // Update or insert XSRF
    if (user.xsrf_id) {
      await pool.query(`UPDATE ${db} SET val = ? WHERE id = ?`, [xsrf, user.xsrf_id]);
    } else {
      await pool.query(
        `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 1, ${TYPE.XSRF}, ?)`,
        [user.uid, xsrf]
      );
    }

    // Set session cookie; remove secret cookie
    res.cookie(db, tokenVal, { maxAge: 30 * 24 * 60 * 60 * 1000, path: '/', httpOnly: false });
    res.clearCookie('secret', { path: '/' });

    logger.info('[Legacy SecretAuth] Success', { db, uid: user.uid, username: user.username });

    if (isJSON) {
      // PHP auth case (line ~7688): {_xsrf, token, id, msg} — consistent with POST /:db/auth response
      // Note: PHP has no dedicated GET /:db/auth?secret JSON endpoint; secret auth sets session via
      // Validate_Token() globally. This Node.js handler is a custom convenience endpoint — keep
      // format consistent with regular auth response.
      return res.status(200).json({ _xsrf: xsrf, token: tokenVal, id: user.uid, msg: '' });
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

  // Validate DB name
  if (!isValidDbName(db)) {
    if (isJSON) {
      return res.status(200).json([{ error: 'Invalid database name' }]);
    }
    return res.status(400).send('Invalid database');
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
      return res.status(200).json([{ error: 'Login and password required' }]);
    }
    return res.status(400).send('Login and password required');
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

    const [rows] = await pool.query(query, [login]);

    if (rows.length === 0) {
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
          await pool.query(
            `UPDATE ${db} SET val = ? WHERE id = ?`,
            [newPwdHash, user.pwd_id]
          );
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

    // Generate or use existing token (PHP: md5(microtime(TRUE)))
    let token = user.token;
    // Always recompute xsrf from current token to stay in sync
    // PHP: xsrf($token, $z) where $z=db → generateXsrf(token, db, db)
    let xsrf = generateXsrf(token || '', db, db);

    if (!token) {
      token = generateToken();
      xsrf = generateXsrf(token, db, db);
      await pool.query(
        `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 1, ${TYPE.TOKEN}, ?)`,
        [user.uid, token]
      );
    }

    if (!user.xsrf) {
      await pool.query(
        `INSERT INTO ${db} (up, ord, t, val) VALUES (?, 1, ${TYPE.XSRF}, ?)`,
        [user.uid, xsrf]
      );
    } else {
      // Update xsrf to keep it in sync with token
      await pool.query(
        `UPDATE ${db} SET val = ? WHERE id = ?`,
        [xsrf, user.xsrf_id]
      );
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
      // PHP response: {"_xsrf":"...","token":"...","id":123,"msg":""}
      return res.status(200).json({
        _xsrf: xsrf,
        token,
        id: user.uid,
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

    const [rows] = await pool.query(query, [token.replace('Bearer ', '')]);

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

  // PHP validates email format
  if (!u || !/^.+@.+\..+$/.test(u)) {
    return res.status(200).json({ error: 'invalid user' });
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT tok.val FROM ${db} u LEFT JOIN ${db} tok ON tok.up=u.id AND tok.t=${TYPE.TOKEN} WHERE u.t=${TYPE.USER} AND u.val=? LIMIT 1`,
      [u]
    );

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
    return res.status(200).json({ error: 'server error' });
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
    return res.status(200).json({ error: 'invalid data' });
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT u.id uid, tok.id tok_id, xsrf.id xsrf_id
       FROM ${db} tok, ${db} u
       LEFT JOIN ${db} xsrf ON xsrf.up=u.id AND xsrf.t=${TYPE.XSRF}
       WHERE u.t=${TYPE.USER} AND u.val=? AND tok.up=u.id AND tok.t=${TYPE.TOKEN} AND tok.val LIKE ?
       LIMIT 1`,
      [u, c + '%']
    );

    if (rows.length > 0) {
      const row = rows[0];
      const newToken = generateToken();
      // PHP: xsrf($token, $u) where $u=email → generateXsrf(newToken, u, db)
      const newXsrf = generateXsrf(newToken, u, db);

      // Update token
      await pool.query(`UPDATE ${db} SET val=? WHERE id=?`, [newToken, row.tok_id]);

      // Update or insert xsrf
      if (row.xsrf_id) {
        await pool.query(`UPDATE ${db} SET val=? WHERE id=?`, [newXsrf, row.xsrf_id]);
      } else {
        await pool.query(`INSERT INTO ${db} (up, ord, t, val) VALUES (?, 1, ${TYPE.XSRF}, ?)`, [row.uid, newXsrf]);
      }

      // Set cookie like PHP
      res.cookie(db, newToken, { maxAge: 30 * 24 * 60 * 60 * 1000, path: '/', httpOnly: false });

      return res.status(200).json({ token: newToken, _xsrf: newXsrf });
    } else {
      return res.status(200).json({ error: 'user not found' });
    }
  } catch (error) {
    logger.error({ error: error.message, db }, '[Legacy CheckCode] Error');
    return res.status(200).json({ error: 'invalid data' });
  }
});

/**
 * Password reset endpoint
 * POST /:db/auth?reset
 *
 * PHP: pwd_reset() finds user, generates new password, sends by email/SMS,
 * then calls login() which in API mode returns:
 *   {"message":"MAIL","db":"...","login":"...","details":"..."}
 *
 * NOTE: actual email/SMS sending is not implemented in standalone mode.
 * The user's password is NOT changed until they confirm via the link — PHP behaviour.
 * We return the PHP-compatible response format so the UI shows the right message.
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
    // Look up user by login or email
    const [rows] = await pool.query(
      `SELECT u.id uid, u.val uval, email.val email, phone.val phone
       FROM ${db} u
       LEFT JOIN ${db} email ON email.up=u.id AND email.t=${TYPE.EMAIL}
       LEFT JOIN ${db} phone ON phone.up=u.id AND phone.t=${TYPE.PHONE}
       WHERE (u.val=? OR email.val=?) AND u.t=${TYPE.USER}
       LIMIT 1`,
      [u, u]
    );

    if (rows.length === 0) {
      // PHP: my_die("Wrong credentials") — in API mode returns [{"error":"..."}]
      if (isJSON) return res.status(200).json([{ error: `Wrong credentials for user ${u} in ${db}. Please send login and password as POST-parameters.` }]);
      return res.redirect(`/${db}`);
    }

    const userRow = rows[0];
    // PHP sends email/SMS with new password — we acknowledge but don't send
    // Return PHP-compatible login() API format
    const message = userRow.email ? 'MAIL' : (userRow.phone ? 'SMS' : 'MAIL');
    const details = 'Password reset email sent (standalone mode: email not configured)';

    return res.status(200).json({
      message,
      db,
      login: userRow.uval,
      details,
    });
  } catch (error) {
    logger.error({ error: error.message, db, u }, '[Legacy Reset] Error');
    if (isJSON) return res.status(200).json([{ error: 'Reset failed' }]);
    return res.redirect(`/${db}`);
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
  if (!email || !/^.+@.+\..+$/.test(email)) {
    if (isJSON) {
      return res.json([{ error: 'Please provide a valid email' }]);
    }
    return res.status(400).send('Please provide a valid email');
  }

  if (!regpwd || regpwd.length < 6) {
    if (isJSON) {
      return res.json([{ error: 'Password must be at least 6 characters' }]);
    }
    return res.status(400).send('Password must be at least 6 characters');
  }

  if (regpwd !== regpwd1) {
    if (isJSON) {
      return res.json([{ error: 'Passwords do not match' }]);
    }
    return res.status(400).send('Passwords do not match');
  }

  if (!agree) {
    if (isJSON) return res.json([{ error: 'Please accept the terms' }]);
    return res.status(400).send('Please accept the terms');
  }

  // PHP creates the user in the 'my' table (multi-tenant global users DB).
  // In standalone mode we do the same if the 'my' table exists, otherwise skip.
  try {
    const pool = getPool();

    // Check if 'my' table exists
    const [tables] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'my' LIMIT 1`
    );

    if (tables.length > 0) {
      // Check uniqueness: PHP line 124
      const [existing] = await pool.query(
        `SELECT id FROM my WHERE val = ? AND t = ${TYPE.USER} LIMIT 1`,
        [email.toLowerCase()]
      );
      if (existing.length > 0) {
        if (isJSON) return res.json([{ error: 'This email is already registered. [errMailExists]' }]);
        return res.status(400).send('This email is already registered.');
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

  // Delete token from DB (PHP: DELETE FROM $z WHERE up=user_id AND t=TOKEN)
  const token = extractToken(req, db);
  if (token && isValidDbName(db)) {
    try {
      const pool = getPool();
      await pool.query(
        `DELETE FROM \`${db}\` WHERE t = ${TYPE.TOKEN} AND val = ?`,
        [token]
      );
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
    const [rows] = await pool.query(
      `SELECT user.id FROM ${db} user JOIN ${db} token ON token.up = user.id AND token.t = ${TYPE.TOKEN} WHERE token.val = ? AND user.t = ${TYPE.USER} LIMIT 1`,
      [token]
    );

    if (rows.length === 0) {
      res.clearCookie(db, { path: '/' });
      const loginPage = path.join(legacyPath, 'index.html');
      if (fs.existsSync(loginPage)) return res.sendFile(loginPage);
      return res.redirect(302, '/' + db);
    }

    const rendered = await renderMainPage(db, token);
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
      return res.status(401).json({ error: 'Unauthorized', hint: `POST /${db}/auth?JSON with login+pwd to get token` });
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
        return res.status(404).json({ error: 'Database not found' });
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

    const [rows] = await pool.query(query, [token]);

    if (rows.length === 0) {
      // Invalid token - clear cookie and redirect to login
      res.clearCookie(db, { path: '/' });
      if (isApiRequest(req)) {
        return res.status(401).json({ error: 'Invalid token' });
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
      const [termsRows] = await pool.query(
        `SELECT a.id, a.val AS name, a.t AS type, a.ord
         FROM \`${db}\` a
         WHERE a.up <= 1 AND a.id != a.t AND a.val != '' AND a.t != 0
         ORDER BY a.val`
      );
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
    const rendered = await renderMainPage(db, token);
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
      return res.status(401).json({ error: 'Unauthorized', hint: `POST /${db}/auth?JSON with login+pwd to get token` });
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
      return res.status(200).json({ error: `typeId required: /${db}/${page}/{id}?JSON` });
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

        const objWhereParts  = ['t = ?', 'up != 0'];  // up=0 = type root row, excluded like PHP
        const objWhereParams = [subId];
        if (filterVal !== null) {
          objWhereParts.push('val = ?');
          objWhereParams.push(filterVal);
        }
        if (filterUp !== null && !isNaN(filterUp)) {
          objWhereParts.push('up = ?');
          objWhereParams.push(filterUp);
        }
        const objOrderStr = orderByVal
          ? `val ${descOrder ? 'DESC' : 'ASC'}`
          : 'id';
        const objLimitStr = ` LIMIT ${objOffset}, ${objLimit}`;

        const [objRows] = await pool.query(
          `SELECT id, val, up, t AS base, ord FROM \`${db}\` WHERE ${objWhereParts.join(' AND ')} ORDER BY ${objOrderStr}${objLimitStr}`,
          objWhereParams
        );

        if (req.query.JSON_DATA !== undefined) {
          // Compact format: each row → {i:id, u:up, o:ord, r:[req_val,...]}
          // Get requisite type IDs for this type (defines column order)
          const [reqDefs] = await pool.query(
            `SELECT id FROM \`${db}\` WHERE up = ? ORDER BY ord`,
            [subId]
          );
          const reqIds = reqDefs.map(r => r.id);

          // Batch-load all requisite values for all objects
          const reqMap = {};
          if (objRows.length > 0 && reqIds.length > 0) {
            const objIds = objRows.map(r => r.id);
            const ph = objIds.map(() => '?').join(',');
            const [reqVals] = await pool.query(
              `SELECT up, t, val FROM \`${db}\` WHERE up IN (${ph}) ORDER BY up, ord`,
              objIds
            );
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
        const [[typeRow] = []] = await pool.query(
          `SELECT t.id, t.val, t.t AS base_type_id, t.up, t.ord AS type_ord
           FROM \`${db}\` t
           WHERE t.id = ?`,
          [subId]
        );

        // ── 2. Req field definitions — PHP-compatible SQL (index.php line 5770) ──
        // Key = typs.id when arr child exists (ord=1); a.id otherwise.
        // ref_id set when type refs a non-self-referential type (rare).
        // arr_id set when no ref and type has a first child.
        const [reqDefStd] = await pool.query(
          `SELECT CASE WHEN arrs.id IS NULL THEN a.id ELSE typs.id END AS t,
                  CASE WHEN refs.id IS NULL THEN typs.t ELSE refs.t END AS base_typ,
                  CASE WHEN refs.id IS NULL THEN typs.val ELSE refs.val END AS type_val,
                  refs.id AS ref_id, arrs.id AS arr_id, a.val AS attrs,
                  a.id AS req_row_id, a.t AS req_t
           FROM \`${db}\` a, \`${db}\` typs
           LEFT JOIN \`${db}\` refs ON refs.id=typs.t AND refs.t!=refs.id
           LEFT JOIN \`${db}\` arrs ON refs.id IS NULL AND arrs.up=typs.id AND arrs.ord=1
           WHERE a.up=? AND typs.id=a.t ORDER BY a.ord`,
          [subId]
        );

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
            const [cntRows] = await pool.query(
              `SELECT up, t, COUNT(*) AS cnt FROM \`${db}\`
               WHERE up IN (${ph}) AND t IN (${phArr}) GROUP BY up, t`,
              [...objIds, ...arrKeys]
            );
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
            const [valRows] = await pool.query(
              `SELECT up, id, t, val FROM \`${db}\`
               WHERE up IN (${ph}) AND t IN (${phNA}) AND val != '' ORDER BY up, ord`,
              [...objIds, ...nonArrKeys]
            );
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
          const refDefs = reqDefStd.filter(rd => rd.arr_id == null && rd.ref_id != null);
          if (refDefs.length > 0) {
            const refKeys    = refDefs.map(rd => String(rd.t));
            const allKnownT  = reqDefStd.map(rd => rd.t);  // exclude known req def ids from ref matches
            const phRef      = refKeys.map(() => '?').join(',');
            const phExclude  = allKnownT.map(() => '?').join(',');
            const [refRows] = await pool.query(
              `SELECT d.up, d.val AS req_key, d.t AS ref_obj_id, o.val AS ref_obj_name
               FROM \`${db}\` d
               JOIN \`${db}\` o ON o.id = d.t
               WHERE d.up IN (${ph}) AND d.val IN (${phRef}) AND d.t NOT IN (${phExclude})
               ORDER BY d.up, d.ord`,
              [...objIds, ...refKeys, ...allKnownT]
            );
            for (const rr of refRows) {
              const oKey = String(rr.up);
              const k    = String(rr.req_key);
              if (!reqsStd[oKey]) reqsStd[oKey] = {};
              if (!refDataStd[oKey]) refDataStd[oKey] = {};
              const refObjName = String(rr.ref_obj_name || '').replace(/,/g, '&comma;');
              const refObjId   = String(rr.ref_obj_id);
              if (reqsStd[oKey][k] === undefined) {
                // First ref value
                reqsStd[oKey][k]           = refObjName;
                reqsStd[oKey][`ref_${k}`]  = `${ref_type[k] || ''}:${refObjId}`;
                refDataStd[oKey][k] = { ref_obj_id: rr.ref_obj_id, ref_obj_name: rr.ref_obj_name || '' };
              } else {
                // Multi-ref: comma-join (PHP: implode(",", $val) / implode(",", $ref_id))
                reqsStd[oKey][k]          = String(reqsStd[oKey][k]) + ',' + refObjName;
                reqsStd[oKey][`ref_${k}`] = String(reqsStd[oKey][`ref_${k}`]) + ',' + refObjId;
                refDataStd[oKey][k] = { multi: true };  // multi → view_reqs shows ""
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
        const objReqs = {};
        const viewReqsAlign = [];
        const viewReqsBase  = [];
        const viewReqsVal   = [];
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
                // Multi refs (>1) → PHP shows "" for cell; missing → ""
                const refInfo = refDataStd[oKey]?.[k];
                if (refInfo && !refInfo.multi) {
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

        const response = {
          '&main.myrolemenu': mainMyrolemenu,
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
        const [etRows] = await pool.query(
          `SELECT typs.id, typs.t, refs.id AS ref_val, typs.ord AS uniq,
                  CASE WHEN refs.id != refs.t THEN refs.val ELSE typs.val END AS val,
                  reqs.id AS req_id, reqs.t AS req_t, reqs.ord, reqs.val AS attrs, ref_typs.t AS reft
           FROM \`${db}\` typs
           LEFT JOIN \`${db}\` refs ON refs.id = typs.t AND refs.id != refs.t
           LEFT JOIN \`${db}\` reqs ON reqs.up = typs.id
           LEFT JOIN \`${db}\` req_typs ON req_typs.id = reqs.t AND req_typs.id != req_typs.t
           LEFT JOIN \`${db}\` ref_typs ON ref_typs.id = req_typs.t AND ref_typs.id != ref_typs.t
           WHERE typs.up = 0 AND typs.id != typs.t
           ORDER BY ISNULL(reqs.id), CASE WHEN refs.id != refs.t THEN refs.val ELSE typs.val END, refs.id DESC, reqs.ord`
        );
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
        const [objResult] = await pool.query(
          `SELECT o.id, o.val, o.up, o.t,
                  t.val AS type_name,
                  t.t   AS base_type_id
           FROM \`${db}\` o
           LEFT JOIN \`${db}\` t ON t.id = o.t
           WHERE o.id = ?`,
          [subId]
        );
        if (objResult.length === 0) {
          return res.status(404).json({ error: 'Object not found' });
        }
        const obj         = objResult[0];
        const objTypName   = obj.type_name    || String(obj.t);
        const objBaseTypId = obj.base_type_id || obj.t;

        // 2. Req field definitions — PHP GetObjectReqs Query 1 (exact SQL port)
        const [reqMeta] = await pool.query(
          `SELECT a.id AS req_id, refs.id AS ref_id, a.val AS attrs, a.ord,
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
           WHERE a.up=? AND typs.id=a.t ORDER BY a.ord`,
          [obj.t]
        );

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
        const [storedRows] = await pool.query(
          `SELECT CASE WHEN typs.up=0 THEN 0 ELSE reqs.id  END AS id,
                  CASE WHEN typs.up=0 THEN 0 ELSE reqs.val END AS val,
                  reqs.ord, typs.id AS t, COUNT(1) AS arr_num,
                  origs.t AS bt, typs.val AS ref_val
           FROM \`${db}\` reqs
           JOIN \`${db}\` typs  ON typs.id  = reqs.t
           LEFT JOIN \`${db}\` origs ON origs.id = typs.t
           WHERE reqs.up = ?
           GROUP BY val, id, t
           ORDER BY reqs.ord`,
          [subId]
        );

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
          const baseName = REV_BASE_TYPE[meta.base_typ] || null;
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
          const [ddRows] = await pool.query(
            `SELECT vals.id, vals.val
             FROM \`${db}\` vals
             JOIN \`${db}\` pars ON pars.id = vals.up
             WHERE pars.up != 0 AND vals.t = ?
             ORDER BY vals.val
             LIMIT ${DDLIST}`,
            [refTypeId]
          );
          // UNION: add currently-selected values that may not appear in main list
          const mainIds = new Set(ddRows.map(r => String(r.id)));
          const curIds = Array.from(refTypeCurVals[refTypeId] || [])
            .filter(id => id && !mainIds.has(id));
          if (curIds.length > 0) {
            const [unionRows] = await pool.query(
              `SELECT id, val FROM \`${db}\` WHERE id IN (${curIds.map(() => '?').join(',')})`,
              curIds
            );
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
                [uRowsEd] = await pool.query(
                  `SELECT role_def.id AS role_obj_id
                   FROM \`${db}\` u
                   JOIN \`${db}\` pwd ON pwd.up = u.id AND pwd.t = ${TYPE.PASSWORD} AND pwd.val = ?
                   LEFT JOIN (\`${db}\` r CROSS JOIN \`${db}\` role_def)
                     ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
                   WHERE u.t = ${TYPE.USER} AND u.val = ? LIMIT 1`,
                  [pwdHash, basicLogin]
                );
              }
            } else {
              [uRowsEd] = await pool.query(
                `SELECT role_def.id AS role_obj_id
                 FROM \`${db}\` u
                 JOIN \`${db}\` tok ON tok.up = u.id AND tok.t = ${TYPE.TOKEN} AND tok.val = ?
                 LEFT JOIN (\`${db}\` r CROSS JOIN \`${db}\` role_def)
                   ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
                 WHERE u.t = ${TYPE.USER} LIMIT 1`,
                [token]
              );
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
        const [typeRows] = await pool.query(
          `SELECT a.id, a.val, a.t, reqs.t AS reqs_t, reqs.up
           FROM \`${db}\` a
           LEFT JOIN \`${db}\` reqs ON reqs.up = a.id
           WHERE a.up = 0 AND a.id != a.t AND a.val != '' AND a.t != 0
           ORDER BY a.val`
        );
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
        const [funRows] = await pool.query(
          `SELECT id, val FROM \`${db}\` WHERE t = ? AND up = 1 ORDER BY val`,
          [63]  // REP_COL_FUNC constant from PHP index.php
        );
        const [fmtRows] = await pool.query(
          `SELECT id, val FROM \`${db}\` WHERE t = ? AND up = 1 ORDER BY val`,
          [29]  // REP_COL_FORMAT constant from PHP index.php
        );
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
          '&main.a.&functions':  funBlock,
          '&main.a.&formats':    fmtBlock,
        });
      }

      // ── GET /:db/form?JSON → &main.myrolemenu + edit_types + types + editable
      // PHP: form.html includes &Edit_Typs block which populates edit_types and then dies.
      // PHP $blocks[$block] includes PARENT, CONTENT (template artifacts) + numeric+named column aliases.
      if (page === 'form') {
        const [formTypeRows] = await pool.query(
          `SELECT typs.id, typs.t, refs.id AS ref_val, typs.ord AS uniq,
                  CASE WHEN refs.id != refs.t THEN refs.val ELSE typs.val END AS val,
                  reqs.id AS req_id, reqs.t AS req_t, reqs.ord, reqs.val AS attrs, ref_typs.t AS reft
           FROM \`${db}\` typs
           LEFT JOIN \`${db}\` refs ON refs.id = typs.t AND refs.id != refs.t
           LEFT JOIN \`${db}\` reqs ON reqs.up = typs.id
           LEFT JOIN \`${db}\` req_typs ON req_typs.id = reqs.t AND req_typs.id != req_typs.t
           LEFT JOIN \`${db}\` ref_typs ON ref_typs.id = req_typs.t AND ref_typs.id != ref_typs.t
           WHERE typs.up = 0 AND typs.id != typs.t
           ORDER BY ISNULL(reqs.id), CASE WHEN refs.id != refs.t THEN refs.val ELSE typs.val END, refs.id DESC, reqs.ord`
        );
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
          edit_types: formEditTypes,
          types: REV_BASE_TYPE,
          editable: 1,
        });
      }

      // ── GET /:db/{info|upload|table|smartq}?JSON → just &main.myrolemenu
      // PHP: these pages render templates that only contain &main.myrolemenu in the API array
      const MENU_ONLY_PAGES = new Set(['info', 'upload', 'table', 'smartq']);
      if (MENU_ONLY_PAGES.has(page)) {
        const mainMyrolemenu = await getMenuForToken(pool, db, token);
        return res.json({ '&main.myrolemenu': mainMyrolemenu });
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
    let query = `SELECT COALESCE(MAX(ord), 0) + 1 AS next_ord FROM ${db} WHERE up = ?`;
    const params = [parentId];

    if (typeId !== null) {
      query = `SELECT COALESCE(MAX(ord), 0) + 1 AS next_ord FROM ${db} WHERE up = ? AND t = ?`;
      params.push(typeId);
    }

    const [rows] = await pool.query(query, params);
    return rows[0]?.next_ord || 1;
  } catch (error) {
    return 1;
  }
}

/**
 * Insert a new row into the database
 */
async function insertRow(db, parentId, order, typeId, value) {
  const pool = getPool();
  const query = `INSERT INTO ${db} (up, ord, t, val) VALUES (?, ?, ?, ?)`;
  const [result] = await pool.query(query, [parentId, order, typeId, value]);
  return result.insertId;
}

/**
 * Update a row's value
 */
async function updateRowValue(db, id, value) {
  const pool = getPool();
  const query = `UPDATE ${db} SET val = ? WHERE id = ?`;
  const [result] = await pool.query(query, [value, id]);
  return result.affectedRows > 0;
}

/**
 * Delete a row by ID
 */
async function deleteRow(db, id) {
  const pool = getPool();
  const query = `DELETE FROM ${db} WHERE id = ?`;
  const [result] = await pool.query(query, [id]);
  return result.affectedRows > 0;
}

/**
 * Delete all children of a parent
 */
async function deleteChildren(db, parentId) {
  const pool = getPool();
  const query = `DELETE FROM ${db} WHERE up = ?`;
  const [result] = await pool.query(query, [parentId]);
  return result.affectedRows;
}

/**
 * Get object by ID
 */
async function getObjectById(db, id) {
  const pool = getPool();
  const query = `SELECT id, up, ord, t, val FROM ${db} WHERE id = ?`;
  const [rows] = await pool.query(query, [id]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get requisite by parent and type
 */
async function getRequisiteByType(db, parentId, typeId) {
  const pool = getPool();
  const query = `SELECT id, val FROM ${db} WHERE up = ? AND t = ? LIMIT 1`;
  const [rows] = await pool.query(query, [parentId, typeId]);
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
router.post('/:db/_m_new/:up?', (req, res, next) => {
  // Use upload.any() so FILE-type requisites can be uploaded alongside text fields
  upload.any()(req, res, (err) => {
    if (err) logger.warn('[Legacy _m_new] Multer error', { error: err.message });
    next();
  });
}, async (req, res) => {
  const { db, up } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
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
    const value = req.body.val || req.body['t' + typeId] || '';

    if (!typeId) {
      return res.status(200).json([{ error: 'Type ID (t or type) is required'  }]);
    }

    // Get next order
    const order = await getNextOrder(db, parentId, typeId);

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
      let finalValue = String(attrValue);

      // If a file was uploaded for this requisite, persist it and use the filename
      const uploadedFile = fileByField[`t${attrTypeId}`];
      if (uploadedFile) {
        const uploadDir = path.join(legacyPath, 'download', db);
        fs.mkdirSync(uploadDir, { recursive: true });
        const safeName = path.basename(uploadedFile.originalname).replace(/[/\\]/g, '_');
        fs.writeFileSync(path.join(uploadDir, safeName), uploadedFile.buffer);
        finalValue = safeName;
        logger.info('[Legacy _m_new] File saved for requisite', { db, attrTypeId, safeName });
      }

      const attrOrder = await getNextOrder(db, id, attrTypeIdNum);
      await insertRow(db, id, attrOrder, attrTypeIdNum, finalValue);
    }

    const pool = getPool();

    // Check if type has requisites (determines next_act per PHP logic)
    const [reqRows] = await pool.query(
      `SELECT id FROM \`${db}\` WHERE up=? AND up!=0 LIMIT 1`,
      [typeId]
    );
    const hasReqs = reqRows.length > 0;

    // PHP _m_new die() (line 8547): {"id":$i,"obj":$obj,"ord":$ord,"next_act":"$a","args":"$arg","val":"<htmlentities(val)>"}
    // No "warnings" or "warning" field — PHP uses direct die() not api_dump() for _m_new
    // id = obj = new objectId
    // args: "new1=1&" when has reqs; "F_U=$up" when up!=1 and no reqs; "" otherwise
    const next_act = hasReqs ? 'edit_obj' : 'object';
    const args = hasReqs ? 'new1=1&' : (parentId !== 1 ? `F_U=${parentId}` : '');

    if (isApiRequest(req)) {
      return res.json({ id, obj: id, ord: parseInt(order, 10) || 0, next_act, args, val: value });
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
router.post('/:db/_m_save/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    const originalId = parseInt(id, 10);

    // Check if this is a copy operation (PHP: isset($_REQUEST["copybtn"]))
    const isCopy = req.query.copybtn !== undefined || req.body.copybtn !== undefined;

    let objectId = originalId;

    if (isCopy) {
      // PHP lines 8018-8037: Copy the object
      logger.info('[Legacy _m_save] Copying object', { db, originalId });

      // Get the original object's data
      const [objRows] = await pool.query(`
        SELECT a.val, a.t AS typ, a.up, a.ord, typs.t AS base_typ
        FROM \`${db}\` typs, \`${db}\` a
        WHERE typs.id = a.t AND a.id = ?
      `, [originalId]);

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
        const [ordRows] = await pool.query(`
          SELECT MAX(ord) AS max_ord FROM \`${db}\`
          WHERE up = ? AND t = ?
        `, [original.up, original.typ]);
        newOrd = (ordRows[0]?.max_ord || 0) + 1;
      }

      // Create the copy
      const [insertResult] = await pool.query(`
        INSERT INTO \`${db}\` (up, ord, t, val)
        VALUES (?, ?, ?, ?)
      `, [original.up, newOrd, original.typ, newVal]);

      objectId = insertResult.insertId;

      // Copy all requisites (PHP: Populate_Reqs)
      // JOIN the type definition to detect FILE-type requisites (base type t = TYPE.FILE)
      const [reqRows] = await pool.query(`
        SELECT r.t, r.val, r.ord, typ.t AS base_t FROM \`${db}\` r
        LEFT JOIN \`${db}\` typ ON typ.id = r.t
        WHERE r.up = ?
        ORDER BY r.ord
      `, [originalId]);

      const uploadDir = path.join(legacyPath, 'download', db);
      for (const reqRow of reqRows) {
        let copiedVal = reqRow.val;
        // For FILE-type requisites, physically copy the file to avoid shared reference
        if (reqRow.base_t === TYPE.FILE && reqRow.val && reqRow.val.length > 0) {
          const srcFile = path.join(uploadDir, path.basename(reqRow.val));
          if (fs.existsSync(srcFile)) {
            const ext = path.extname(reqRow.val);
            const newName = `copy_${Date.now()}_${path.basename(reqRow.val, ext)}${ext}`;
            const dstFile = path.join(uploadDir, newName);
            try {
              fs.mkdirSync(uploadDir, { recursive: true });
              fs.copyFileSync(srcFile, dstFile);
              copiedVal = newName;
            } catch (copyErr) {
              logger.warn('[Legacy _m_save] File copy failed, sharing reference', { srcFile, error: copyErr.message });
            }
          }
        }
        await pool.query(`
          INSERT INTO \`${db}\` (up, ord, t, val)
          VALUES (?, ?, ?, ?)
        `, [objectId, reqRow.ord, reqRow.t, copiedVal]);
      }

      logger.info('[Legacy _m_save] Object copied', { db, originalId, newId: objectId });

      // PHP api_dump() for copy (lines 8228-8234):
      //   $arg = "copied1=1&F_U=$up&F_I=$id" (F_I = new objectId)
      //   $obj = $id (new objectId)
      //   $id  = $typ (type ID)
      return legacyRespond(req, res, db, {
        id: original.typ,
        obj: objectId,
        next_act: 'object',
        args: `copied1=1&F_U=${original.up}&F_I=${objectId}`,
      });
    }

    // Normal save (not copy)
    // Update value if provided
    if (req.body.val !== undefined) {
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
      const [existingRows] = await pool.query(
        `SELECT id FROM \`${db}\` WHERE val = ? AND t = ? LIMIT 1`,
        [newVal, typeIdNum]
      );

      let refId;
      if (existingRows.length > 0) {
        // Use existing object
        refId = existingRows[0].id;
      } else {
        // Create new object of that type (PHP: Insert(1, 1, $GLOBALS["REF_typs"][$t], $value))
        const [insertResult] = await pool.query(
          `INSERT INTO \`${db}\` (up, ord, t, val) VALUES (1, 1, ?, ?)`,
          [typeIdNum, newVal]
        );
        refId = insertResult.insertId;
        logger.info('[Legacy _m_save] Created new ref object', { db, typeId: typeIdNum, val: newVal, id: refId });
      }

      // Update the t{typeId} value to point to the new/existing reference
      req.body[`t${refTypeId}`] = String(refId);
    }

    // Fetch object's type early — needed to detect when t{objType}=val means "update a.val"
    // (smartq sends t{parentType}=newName when inline-editing the main column)
    const [objInfoEarly] = await pool.query(
      `SELECT t, up FROM \`${db}\` WHERE id = ? LIMIT 1`, [objectId]
    );
    const objTypeEarly = objInfoEarly.length > 0 ? objInfoEarly[0].t : 0;

    // Update requisites (t{id}=value format); merge query+body so t{id}=val works in URL too
    // (smartq.js sends &t{tid}=(timestamp) in URL query for DATETIME unique value on copy)
    const attributes = extractAttributes({ ...req.query, ...req.body });
    for (const [attrTypeId, attrValue] of Object.entries(attributes)) {
      const typeIdNum = parseInt(attrTypeId, 10);

      // When smartq inline-edits the main column, it sends t{objType}=newName.
      // This means "update a.val", not a child requisite row.
      if (typeIdNum === objTypeEarly) {
        await updateRowValue(db, objectId, String(attrValue));
        continue;
      }

      const existing = await getRequisiteByType(db, objectId, typeIdNum);

      let finalValue = String(attrValue);

      // PHP PASSWORD hash edge case: when saving a PASSWORD-type requisite,
      // use t{USER} from POST body as username if present, else read from DB.
      if (typeIdNum === TYPE.PASSWORD) {
        let username = req.body[`t${TYPE.USER}`];
        if (!username) {
          // Fall back to current object's val (it IS the user object)
          const [uRows] = await pool.query(
            `SELECT val FROM \`${db}\` WHERE id = ? LIMIT 1`, [objectId]
          );
          username = uRows.length > 0 ? uRows[0].val : '';
        }
        finalValue = phpCompatibleHash(username, attrValue, db);
      }

      if (existing) {
        // Update existing requisite
        await updateRowValue(db, existing.id, finalValue);
      } else {
        // Create new requisite
        const attrOrder = await getNextOrder(db, objectId, typeIdNum);
        await insertRow(db, objectId, attrOrder, typeIdNum, finalValue);
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
      id: objType,
      obj: objectId,
      next_act: 'object',
      args: `${argsPrefix}F_U=${objUp}&F_I=${objectId}`,
      warnings: '',
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
router.post('/:db/_m_del/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    const objectId = parseInt(id, 10);

    if (!objectId) {
      return res.status(200).json([{ error: `Wrong id: ${id}` }]);
    }

    // PHP: SELECT count(r.id), obj.up, obj.ord, obj.t, obj.val, par.up pup, type.up tup
    //      FROM $z obj
    //        LEFT JOIN $z type ON type.id=obj.t
    //        LEFT JOIN $z r ON r.t=obj.id
    //        JOIN $z par ON par.id=obj.up
    //      WHERE obj.id=$id
    const [[row]] = await pool.query(
      `SELECT COUNT(r.id) AS refCount, obj.up, obj.ord, obj.t, obj.val,
              par.up AS pup, type.up AS tup
       FROM \`${db}\` obj
       LEFT JOIN \`${db}\` type ON type.id = obj.t
       LEFT JOIN \`${db}\` r ON r.t = obj.id
       JOIN \`${db}\` par ON par.id = obj.up
       WHERE obj.id = ?`,
      [objectId]
    );

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
        await pool.query(
          `UPDATE \`${db}\` SET ord = ord - 1 WHERE up = ? AND t = ? AND ord > ?`,
          [row.up, row.t, row.ord]
        );
      } else if (!isNaN(Number(row.val)) && Number(row.val) > 0) {
        // Reference/multiselect element: shift down following by val+ord
        await pool.query(
          `UPDATE \`${db}\` SET ord = ord - 1 WHERE up = ? AND val = ? AND ord > ?`,
          [row.up, row.val, row.ord]
        );
      }
    }

    // Delete recursively (PHP BatchDelete)
    await deleteChildren(db, objectId);
    await deleteRow(db, objectId);

    logger.info('[Legacy _m_del] Object deleted', { db, id: objectId });

    // PHP: $id = row.t (type), $obj = objectId, next_act = "object"
    // PHP args: "F_U=$up" only for array elements (tup==="0"), not for reference elements
    const objType = row.t;
    const objUp   = row.up;
    const isArrayElement = String(row.tup) === '0';
    legacyRespond(req, res, db, {
      id: objType,
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
router.post('/:db/_m_set/:id', upload.any(), async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    const objectId = parseInt(id, 10);
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

    for (const [attrTypeId, attrValue] of Object.entries(attributes)) {
      const typeIdNum = parseInt(attrTypeId, 10);
      let finalValue = String(attrValue);

      // Handle inline file upload (saveInlineFile in smartq.js)
      const uploadedFile = fileByField[`t${attrTypeId}`];
      if (uploadedFile) {
        const uploadDir = path.join(legacyPath, 'download', db);
        fs.mkdirSync(uploadDir, { recursive: true });
        const safeName = path.basename(uploadedFile.originalname).replace(/[/\\]/g, '_');
        fs.writeFileSync(path.join(uploadDir, safeName), uploadedFile.buffer);
        finalValue = safeName;
        uploadedFilePath = `${db}/download/${safeName}`;
        logger.info('[Legacy _m_set] File saved', { db, attrTypeId, safeName });
      }

      const existing = await getRequisiteByType(db, objectId, typeIdNum);
      if (existing) {
        await updateRowValue(db, existing.id, finalValue);
        lastReqId = String(existing.id);
      } else {
        const attrOrder = await getNextOrder(db, objectId, typeIdNum);
        const newId = await insertRow(db, objectId, attrOrder, typeIdNum, finalValue);
        lastReqId = String(newId);
      }
    }

    logger.info('[Legacy _m_set] Attributes set', { db, id: objectId });

    // PHP _m_set die() format (line 9170): {"id":"<reqId>", "obj":"<objectId>", "a":"nul", "args":"<filePath>"}
    // PHP: $id = "" initially (gets set to last req id inside loop); $obj = objectId (string)
    // PHP args: file path for uploads, "" otherwise (no F_U, no next_act, no warnings)
    return res.json({
      id: lastReqId,
      obj: String(objectId),
      a: 'nul',
      args: uploadedFilePath || '',
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
router.post('/:db/_m_move/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const objectId = parseInt(id, 10);
    const newParentId = parseInt(req.body.up, 10);
    const newOrder = await getNextOrder(db, newParentId);

    const pool = getPool();

    // Fetch type BEFORE moving
    const [objInfo] = await pool.query(
      `SELECT t FROM \`${db}\` WHERE id = ? LIMIT 1`, [objectId]
    );
    const objType = objInfo.length > 0 ? objInfo[0].t : 0;

    await pool.query(`UPDATE ${db} SET up = ?, ord = ? WHERE id = ?`, [newParentId, newOrder, objectId]);

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

    const [rows] = await pool.query(query, params);

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

    const [rows] = await pool.query(query, params);
    const [countRows] = await pool.query(countQuery, countParams);
    const total = countRows[0]?.total || 0;

    // Batch-load requisite values for all returned objects so the client can
    // display column values without a second round-trip.
    // reqs: { [typeId]: val } keyed by requisite type id.
    const reqMap = {};
    if (rows.length > 0) {
      const objIds = rows.map(r => r.id);
      const ph = objIds.map(() => '?').join(',');
      const [reqVals] = await pool.query(
        `SELECT up, t, val FROM \`${db}\` WHERE up IN (${ph}) ORDER BY up, ord`,
        objIds
      );
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
    const [reqRows] = await pool.query(
      `SELECT id, val, t FROM ${db} WHERE up = ? ORDER BY ord`,
      [type]
    );

    // Parse requisite info
    const requisites = reqRows.map(r => {
      const aliasMatch = r.val.match(/:ALIAS=([^:]+):/);
      return {
        id: r.id,
        name: r.val.replace(/:ALIAS=[^:]+:/g, '').replace(/:!NULL:/g, '').replace(/:MULTI:/g, '').trim(),
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

    const [rows] = await pool.query(query, params);
    const [countRows] = await pool.query(countQuery, countParams);
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
    const [typeRows] = await pool.query(
      `SELECT id, val AS name, t AS base_type, ord FROM ${db} WHERE id = ?`,
      [type]
    );

    if (typeRows.length === 0) {
      return res.status(404).json({ error: 'Type not found' });
    }

    // Get requisites (children of the type)
    const [reqRows] = await pool.query(
      `SELECT id, val AS name, t AS type, ord FROM ${db} WHERE up = ? ORDER BY ord`,
      [type]
    );

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
router.get('/:db/terms', async (req, res) => {
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
        const [userRows] = await pool.query(`
          SELECT u.id, u.val AS username, role_def.id AS role_id
          FROM ${db} tok
          JOIN ${db} u ON tok.up = u.id
          LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
          WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
          LIMIT 1
        `, [token]);

        if (userRows.length > 0) {
          username = userRows[0].username;
          grants = await getGrants(pool, db, userRows[0].role_id);
        }
      } catch (e) {
        logger.warn('[Legacy terms] Failed to load grants', { error: e.message });
      }
    }

    // Match PHP terms query: all top-level objects where id!=t, val!='', t!=0
    // Left join to get the type of each requisite (child record) per PHP logic
    const [rows] = await pool.query(
      `SELECT a.id, a.val, a.t, a.ord, reqs.t AS reqs_t
       FROM \`${db}\` a
       LEFT JOIN \`${db}\` reqs ON reqs.up = a.id
       WHERE a.up = 0 AND a.id != a.t AND a.val != '' AND a.t != 0
       ORDER BY a.val`
    );

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
          name: val,
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
    const [rows] = await pool.query(
      `SELECT u.id uid, u.val uname, xsrf.val xsrf_val, role_def.val role_val
       FROM ${db} u
       JOIN ${db} tok ON tok.up=u.id AND tok.t=${TYPE.TOKEN} AND tok.val=?
       LEFT JOIN ${db} xsrf ON xsrf.up=u.id AND xsrf.t=${TYPE.XSRF}
       LEFT JOIN (${db} r CROSS JOIN ${db} role_def)
         ON r.up=u.id AND role_def.id=r.t AND role_def.t=${TYPE.ROLE}
       WHERE u.t=${TYPE.USER}
       LIMIT 1`,
      [token]
    );

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
      // PHP: $row["id"] from mysqli_fetch_array returns strings
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
router.get('/:db/_ref_reqs/:refId', async (req, res) => {
  const { db, refId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
    const id = parseInt(refId, 10);
    const searchQuery = req.query.q || '';
    const restrictParam = req.query.r || '';
    const limitParam = Math.min(parseInt(req.query.LIMIT || req.query.limit || '80', 10) || 80, 500);

    // Get the reference type info and its requisites (children)
    // PHP: dic = row["dic"] from the reference definition
    const [refRows] = await pool.query(
      `SELECT r.t AS dic, r.val AS attr, def_reqs.t, req_orig.t AS base,
              CASE WHEN base.id != base.t THEN 1 ELSE 0 END AS is_ref, req.id AS req_id
       FROM ${db} r
       JOIN ${db} dic ON dic.id = r.t
       JOIN ${db} par ON par.id = r.up AND par.up = 0
       LEFT JOIN ${db} def_reqs ON def_reqs.up = r.t
       LEFT JOIN ${db} req_orig ON req_orig.id = def_reqs.t
       LEFT JOIN ${db} base ON base.id = req_orig.t
       LEFT JOIN ${db} req ON req.up = dic.t AND req.t = def_reqs.t
       WHERE r.id = ?
       ORDER BY def_reqs.ord`,
      [id]
    );

    if (refRows.length === 0) {
      // Fallback to simple query if the complex query returns nothing
      const [simpleRows] = await pool.query(
        `SELECT t, val FROM ${db} WHERE id = ?`,
        [id]
      );
      if (simpleRows.length === 0) {
        return res.status(404).json({ error: 'Reference not found' });
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
        if (searchQuery.startsWith('@')) {
          const searchId = parseInt(searchQuery.substring(1), 10);
          if (!isNaN(searchId)) {
            query += ` AND id = ?`;
            params.push(searchId);
          }
        } else {
          query += ` AND val LIKE ?`;
          params.push(`%${searchQuery}%`);
        }
      }

      query += ` ORDER BY val LIMIT ${limitParam}`;
      const [rows] = await pool.query(query, params);
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
    const attrsFormula = rawAttr
      .replace(/:ALIAS=[^:]*:/g, '')
      .replace(/:!NULL:/g, '')
      .replace(/:MULTI:/g, '')
      .trim();

    if (attrsFormula.startsWith('&')) {
      // Real PHP block reference — requires PHP template engine, not available in Node.js.
      // Return a simple fallback list using just the dictionary type.
      logger.warn('[Legacy _ref_reqs] Dynamic formula not supported, using simple fallback', {
        db, id, formula: attrsFormula
      });
      // Simple fallback: return all objects of dic type
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
      const [fbRows] = await pool.query(
        `SELECT vals.id, vals.val FROM \`${db}\` vals JOIN \`${db}\` pars ON pars.id = vals.up WHERE ${fbWhere.join(' AND ')} ORDER BY vals.val LIMIT ${limitParam}`,
        fbParams
      );
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
        joinClauses += ` LEFT JOIN (\`${db}\` r${rq.reqId} CROSS JOIN \`${db}\` ${reqAlias}) ON r${rq.reqId}.up = vals.id AND ${reqAlias}.id = r${rq.reqId}.t AND ${reqAlias}.t = ${rq.base}`;
      } else {
        // Direct requisite (PHP: LEFT JOIN z a{req} ON a{req}.up=vals.id AND a{req}.t={req_id})
        joinClauses += ` LEFT JOIN \`${db}\` ${reqAlias} ON ${reqAlias}.up = vals.id AND ${reqAlias}.t = ${rq.reqId}`;
      }
    }

    // Build WHERE clause for the inner subquery
    let whereClause = `vals.t = ${dic}`;

    // Handle restrict parameter (?r=<id> or ?r=<id1>,<id2>)
    if (restrictParam) {
      const restrictIds = restrictParam.split(',').filter(v => /^\d+$/.test(v)).map(v => parseInt(v, 10));
      if (restrictIds.length === 1) {
        whereClause += ` AND vals.id = ${restrictIds[0]}`;
      } else if (restrictIds.length > 1) {
        whereClause += ` AND vals.id IN (${restrictIds.join(',')})`;
      }
    }

    // Handle search parameter (?q=<search> or ?q=@<id>)
    let searchClause = '';
    if (searchQuery) {
      if (searchQuery.startsWith('@')) {
        const searchId = parseInt(searchQuery.substring(1), 10);
        if (!isNaN(searchId)) {
          whereClause += ` AND vals.id = ${searchId}`;
        }
      } else {
        // PHP: CONCAT(vals.val, '/', COALESCE(a{req}.val,''), ...) LIKE '%search%'
        const escapedSearch = searchQuery.replace(/'/g, "''").replace(/%/g, '\\%');
        let searchConcat = 'vals.val';
        for (const rq of refReqs) {
          searchConcat = `CONCAT(${searchConcat}, '/', COALESCE(a${rq.reqId}.val, ''))`;
        }
        searchClause = ` AND ${searchConcat} LIKE '%${escapedSearch}%'`;
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

    const [rows] = await pool.query(sql);

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
router.all('/:db/_connect/:id?', async (req, res) => {
  const { db, id: idParam } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  const objectId = parseInt(idParam || '0', 10);

  try {
    const pool = getPool();

    // PHP: if $id == 0 → error; else fetch CONNECT requisite URL and proxy
    if (objectId) {
      const [[row]] = await pool.query(
        `SELECT val FROM \`${db}\` WHERE up = ? AND t = ${TYPE.CONNECT} LIMIT 1`,
        [objectId]
      );
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
      const upstream = await fetchFn(proxyUrl, { headers: { 'User-Agent': 'Integram' } });
      const body = await upstream.text();
      return res.status(upstream.ok ? 200 : upstream.status).send(body);
    }

    // No id — DB ping (legacy behaviour)
    if (await dbExists(db)) {
      res.json({ status: 'Ok', message: 'Connection successful' });
    } else {
      res.status(404).json({ error: 'Database not found' });
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
router.post('/:db/_d_new/:parentTypeId?', async (req, res) => {
  const { db, parentTypeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const parentId = parseInt(parentTypeId || req.body.up || '0', 10);
    const baseType = parseInt(req.body.t || '8', 10); // Default to CHARS type (8)
    const name = req.body.val || req.body.name || '';

    if (!name) {
      return res.status(200).json([{ error: 'Type name (val) is required'  }]);
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

    // PHP api_dump(): {id:parentId, obj:newTypeId, next_act:"edit_types", args:"ext"}
    // PHP: $id stays as original $id (parent type id, from request), $obj = Insert() result (new type id)
    legacyRespond(req, res, db, { id: parentId, obj: id, next_act: 'edit_types', args: 'ext' });
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
router.post('/:db/_d_save/:typeId', async (req, res) => {
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

    const updates = [];
    const params = [];
    if (val !== undefined) { updates.push('val = ?'); params.push(val); }
    if (t !== undefined) { updates.push('t = ?'); params.push(t); }
    // Always update ord (unique flag) when saving a type, matching PHP behavior
    updates.push('ord = ?');
    params.push(unique);

    params.push(id);
    await pool.query(`UPDATE \`${db}\` SET ${updates.join(', ')} WHERE id = ?`, params);

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
router.post('/:db/_d_del/:typeId', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(typeId, 10);
    const cascade = req.body.cascade === '1' || req.body.cascade === true;

    // Delete children first if cascade
    if (cascade) {
      await deleteChildren(db, id);
    }

    // Delete the type
    await deleteRow(db, id);

    logger.info('[Legacy _d_del] Type deleted', { db, id, cascade });

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
router.post('/:db/_d_req/:typeId', async (req, res) => {
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
    const multi = req.body.multi === '1' || req.body.multi === true;

    if (!name) {
      return res.status(200).json([{ error: 'Requisite name (val) is required'  }]);
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
router.post('/:db/_d_alias/:reqId', async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(reqId, 10);
    const newAlias = req.body.alias || '';
    const pool = getPool();

    // Get current value
    const obj = await getObjectById(db, id);
    if (!obj) {
      return res.status(404).json({ error: 'Requisite not found' });
    }

    // Parse existing modifiers
    const modifiers = parseModifiers(obj.val);

    // Update alias and rebuild value
    const newVal = buildModifiers(modifiers.name, newAlias || null, modifiers.required, modifiers.multi);

    await pool.query(`UPDATE ${db} SET val = ? WHERE id = ?`, [newVal, id]);

    logger.info('[Legacy _d_alias] Alias set', { db, id, alias: newAlias });

    // PHP api_dump(): {id, obj:type_id (parent), next_act:"edit_types", args, warnings}
    // PHP line 8625: $id = $obj = $up; (both set to parent type ID)
    legacyRespond(req, res, db, { id: obj.up, obj: obj.up, next_act: 'edit_types', args: 'ext' });
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
router.post('/:db/_d_null/:reqId', async (req, res) => {
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
      return res.status(404).json({ error: 'Requisite not found' });
    }

    // Parse existing modifiers
    const modifiers = parseModifiers(obj.val);

    // Toggle or set required flag
    const newRequired = req.body.required !== undefined
      ? (req.body.required === '1' || req.body.required === true)
      : !modifiers.required;

    // Rebuild value with updated flag
    const newVal = buildModifiers(modifiers.name, modifiers.alias, newRequired, modifiers.multi);

    await pool.query(`UPDATE ${db} SET val = ? WHERE id = ?`, [newVal, id]);

    logger.info('[Legacy _d_null] NOT NULL toggled', { db, id, required: newRequired });

    // PHP api_dump(): {id, obj:type_id (parent), next_act:"edit_types", args, warnings}
    legacyRespond(req, res, db, { id, obj: obj.up, next_act: 'edit_types', args: 'ext' });
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
router.post('/:db/_d_multi/:reqId', async (req, res) => {
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
      return res.status(404).json({ error: 'Requisite not found' });
    }

    // Parse existing modifiers
    const modifiers = parseModifiers(obj.val);

    // Toggle or set multi flag
    const newMulti = req.body.multi !== undefined
      ? (req.body.multi === '1' || req.body.multi === true)
      : !modifiers.multi;

    // Rebuild value with updated flag
    const newVal = buildModifiers(modifiers.name, modifiers.alias, modifiers.required, newMulti);

    await pool.query(`UPDATE ${db} SET val = ? WHERE id = ?`, [newVal, id]);

    logger.info('[Legacy _d_multi] MULTI toggled', { db, id, multi: newMulti });

    // PHP api_dump(): {id, obj:type_id (parent), next_act:"edit_types", args, warnings}
    legacyRespond(req, res, db, { id, obj: obj.up, next_act: 'edit_types', args: 'ext' });
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
router.post('/:db/_d_attrs/:reqId', async (req, res) => {
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
      return res.status(404).json({ error: 'Requisite not found' });
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

    await pool.query(`UPDATE ${db} SET val = ? WHERE id = ?`, [newVal, id]);

    logger.info('[Legacy _d_attrs] Modifiers updated', { db, id, alias: newAlias, required: newRequired, multi: newMulti });

    // PHP api_dump(): {id, obj:type_id (parent), next_act:"edit_types", args, warnings}
    legacyRespond(req, res, db, { id, obj: obj.up, next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_attrs] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_up - Move requisite up (decrease order)
 * POST /:db/_d_up/:reqId
 */
router.post('/:db/_d_up/:reqId', async (req, res) => {
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
      return res.status(404).json({ error: 'Requisite not found' });
    }

    // Find the previous sibling (same parent, lower order)
    const [siblings] = await pool.query(
      `SELECT id, ord FROM ${db} WHERE up = ? AND ord < ? ORDER BY ord DESC LIMIT 1`,
      [obj.up, obj.ord]
    );

    if (siblings.length === 0) {
      // Already at top — still return PHP api_dump() format
      // PHP: $id = $row["up"] (parent), $obj = $id (also parent)
      return legacyRespond(req, res, db, { id: obj.up, obj: obj.up, next_act: 'edit_types', args: 'ext' });
    }

    const prevSibling = siblings[0];

    // Swap orders
    await pool.query(`UPDATE ${db} SET ord = ? WHERE id = ?`, [obj.ord, prevSibling.id]);
    await pool.query(`UPDATE ${db} SET ord = ? WHERE id = ?`, [prevSibling.ord, id]);

    logger.info('[Legacy _d_up] Requisite moved up', { db, id, newOrd: prevSibling.ord });

    // PHP api_dump(): {id:parent, obj:parent, next_act:"edit_types", args:"ext"}
    // PHP: $id = $row["up"] (parent), $obj = $id (also parent)
    legacyRespond(req, res, db, { id: obj.up, obj: obj.up, next_act: 'edit_types', args: 'ext' });
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
router.post('/:db/_d_ord/:reqId', async (req, res) => {
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
    const [[reqRow]] = await pool.query(
      `SELECT req.ord, req.up FROM \`${db}\` req, \`${db}\` par WHERE req.id=? AND par.id=req.up AND par.up=0`,
      [id]
    );

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
      await pool.query(`
        UPDATE \`${db}\` SET ord=(CASE WHEN id=? THEN LEAST(?, (SELECT max(ord) FROM (SELECT ord FROM \`${db}\` WHERE up=?) AS t))
                                       ELSE GREATEST(0, CAST(ord AS SIGNED)+SIGN(?-?)) END)
        WHERE up=? AND ord BETWEEN LEAST(?,?) AND GREATEST(?,?)`,
        [id, newOrd, parentId, oldOrd, newOrd, parentId, oldOrd, newOrd, oldOrd, newOrd]
      );
    }

    logger.info('[Legacy _d_ord] Order set', { db, id, ord: newOrd });

    // PHP api_dump(): {id:parent, obj:parent, next_act:"edit_types", args:"ext"}
    // PHP: $id = $row["up"] (parent type ID), $obj = $id (also parent)
    legacyRespond(req, res, db, { id: parentId, obj: parentId, next_act: 'edit_types', args: 'ext' });
  } catch (error) {
    logger.error('[Legacy _d_ord] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_del_req - Delete requisite
 * POST /:db/_d_del_req/:reqId
 */
router.post('/:db/_d_del_req/:reqId', async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(reqId, 10);
    const cascade = req.body.cascade === '1' || req.body.cascade === true;

    // Fetch parent (type_id) BEFORE deleting
    const obj = await getObjectById(db, id);
    const typeId = obj ? obj.up : 0;

    // Delete children first if cascade
    if (cascade) {
      await deleteChildren(db, id);
    }

    // Delete the requisite
    await deleteRow(db, id);

    logger.info('[Legacy _d_del_req] Requisite deleted', { db, id, cascade });

    // PHP api_dump(): {id:type_id, obj:type_id, next_act:"edit_types", args, warnings}
    legacyRespond(req, res, db, { id: typeId, obj: typeId, next_act: 'edit_types', args: 'ext' });
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
router.post('/:db/_d_ref/:typeId', async (req, res) => {
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
    const [[row]] = await pool.query(
      `SELECT obj.up, obj.t, ref.id refId FROM \`${db}\` obj LEFT JOIN \`${db}\` ref ON ref.up=0 AND ref.t=? AND ref.val='' WHERE obj.id=?`,
      [id, id]
    );

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
router.post('/:db/_m_up/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const objectId = parseInt(id, 10);
    const pool = getPool();

    // Get current object
    const obj = await getObjectById(db, objectId);
    if (!obj) {
      return res.status(404).json({ error: 'Object not found' });
    }

    // Find the previous sibling (same parent and type, lower order)
    const [siblings] = await pool.query(
      `SELECT id, ord FROM ${db} WHERE up = ? AND t = ? AND ord < ? ORDER BY ord DESC LIMIT 1`,
      [obj.up, obj.t, obj.ord]
    );

    if (siblings.length === 0) {
      // Already at top — still return PHP api_dump() format
      // PHP: $id = $row["t"] (typeId), $obj = null, $arg = "F_U=$up" always
      return legacyRespond(req, res, db, { id: obj.t, obj: null, next_act: 'object', args: `F_U=${obj.up}` });
    }

    const prevSibling = siblings[0];

    // Swap orders
    await pool.query(`UPDATE ${db} SET ord = ? WHERE id = ?`, [obj.ord, prevSibling.id]);
    await pool.query(`UPDATE ${db} SET ord = ? WHERE id = ?`, [prevSibling.ord, objectId]);

    logger.info('[Legacy _m_up] Object moved up', { db, id: objectId, newOrd: prevSibling.ord });

    // PHP api_dump(): {id:typeId, obj:null, next_act:"object", args:"F_U=$up" always}
    // PHP: $id = $row["t"] (typeId of the moved object), $obj = null, $arg = "F_U=$up" always
    legacyRespond(req, res, db, { id: obj.t, obj: null, next_act: 'object', args: `F_U=${obj.up}` });
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
router.post('/:db/_m_ord/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const objectId = parseInt(id, 10);
    // PHP uses $_REQUEST["order"] — comes from query string ?JSON&order=N
    const newOrd = parseInt(req.query.order ?? req.body.order ?? req.body.ord, 10);

    if (isNaN(newOrd) || newOrd < 1) {
      return res.status(200).json([{ error: 'order must be a positive integer'  }]);
    }

    const pool = getPool();

    // PHP: SELECT obj.ord, obj.up FROM $z obj, $z par
    //      WHERE obj.id=$id AND par.id=obj.up AND par.up!=0
    // (par.up!=0 ensures object is a data record, not a root type)
    const [[row]] = await pool.query(
      `SELECT obj.ord, obj.up FROM \`${db}\` obj
       JOIN \`${db}\` par ON par.id = obj.up AND par.up != 0
       WHERE obj.id = ?`,
      [objectId]
    );

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
      await pool.query(
        `UPDATE \`${db}\`
         SET ord = CASE
           WHEN id = ? THEN LEAST(?, (SELECT maxo FROM (SELECT MAX(ord) AS maxo FROM \`${db}\` WHERE up = ?) AS t))
           ELSE GREATEST(0, CAST(ord AS SIGNED) + SIGN(? - ?))
         END
         WHERE up = ? AND ord BETWEEN LEAST(?,?) AND GREATEST(?,?)`,
        [objectId, newOrd, parentId, oldOrd, newOrd, parentId, oldOrd, newOrd, oldOrd, newOrd]
      );
    }

    logger.info('[Legacy _m_ord] Order set', { db, id: objectId, ord: newOrd });

    // PHP api_dump(): {id:parentId, obj:parentId, next_act:"_m_ord"|req.next_act, args:"", warnings}
    // PHP: $id = $row["up"] (parent), $obj = $id (also parent), $next_act defaults to "_m_ord"
    const nextAct = req.body.next_act || req.query.next_act || '_m_ord';
    legacyRespond(req, res, db, { id: parentId, obj: parentId, next_act: nextAct, args: '' });
  } catch (error) {
    logger.error('[Legacy _m_ord] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _m_id - Change object ID (reserved operation)
 * POST /:db/_m_id/:id
 */
router.post('/:db/_m_id/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database' }]);
  }

  try {
    const pool = getPool();
    const oldId = parseInt(id, 10);
    const newId = parseInt(req.body.new_id || req.query.new_id, 10);

    if (!newId || newId <= 0) {
      return res.status(200).json([{ error: 'new_id must be a positive integer' }]);
    }
    if (oldId === newId) {
      return res.status(200).json([{ error: 'new_id must differ from current id' }]);
    }

    // Check that the old object exists and get its parent
    const [objRows] = await pool.query(
      `SELECT id, up FROM \`${db}\` WHERE id = ? LIMIT 1`, [oldId]
    );
    if (objRows.length === 0) {
      return res.status(200).json([{ error: 'Object not found' }]);
    }
    const up = objRows[0].up;

    // Check that new_id is not already in use
    const [existRows] = await pool.query(
      `SELECT id FROM \`${db}\` WHERE id = ? LIMIT 1`, [newId]
    );
    if (existRows.length > 0) {
      return res.status(200).json([{ error: `ID ${newId} is already in use` }]);
    }

    // PHP: 3 UPDATEs to rename the id everywhere it appears
    await pool.query(`UPDATE \`${db}\` SET id = ? WHERE id = ?`, [newId, oldId]);
    await pool.query(`UPDATE \`${db}\` SET up = ? WHERE up = ?`, [newId, oldId]);
    await pool.query(`UPDATE \`${db}\` SET t  = ? WHERE t  = ?`, [newId, oldId]);

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
router.all('/:db/obj_meta/:id', async (req, res) => {
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

    const [rows] = await pool.query(query, [objectId, objectId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Object not found' });
    }

    // Build response matching PHP format (line 8838-8857)
    // Top-level: id, up, type, val (all as strings from mysqli_fetch_array)
    const meta = {
      id: String(rows[0].id),
      up: String(rows[0].up),
      type: String(rows[0].t),
      val: rows[0].val || '',
      reqs: {}
    };

    // reqs keyed by req.ord (PHP line 8846: "\"" . $row["ord"] . "\":{...")
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
      meta.reqs[String(row.ord)] = reqEntry;
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
router.all('/:db/metadata/:typeId?', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const pool = getPool();
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

    const [rows] = await pool.query(query, params);

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
          // PHP: req_val goes through addcslashes() which doubles backslashes,
          // so \uXXXX stays as \uXXXX (not decoded) — use raw value here
          val: row.req_val || '',
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
    return res.status(200).json({ error: 'JWT verification failed' });
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
        return res.status(200).json({ error: 'JWT verification failed' });
      }
      const [headerB64, payloadB64, sigB64] = parts;
      const sigBuf = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      const data = Buffer.from(`${headerB64}.${payloadB64}`);
      const ok = crypto.verify('SHA256', data, { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, sigBuf);
      if (!ok) {
        return res.status(200).json({ error: 'JWT verification failed' });
      }
      const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
      const now = Math.floor(Date.now() / 1000);
      if (!payload.iat || !payload.exp || now > payload.exp || now < payload.iat) {
        return res.status(200).json({ error: 'JWT expired' });
      }
      // PHP: $params->data->userId
      username = payload?.data?.userId || payload?.sub || null;
      if (!username) {
        return res.status(200).json({ error: 'JWT verification failed' });
      }
    }

    // PHP authJWT($username): look up user, regenerate session, return {_xsrf,token,id,user}
    // In standalone (no RSA key): treat jwt field as session token for backwards compat
    const whereClause = username
      ? `u.t = ${TYPE.USER} AND u.val = ?`
      : `u.t = ${TYPE.USER} AND tok.val = ?`;
    const whereParam = username || jwtToken;

    const [rows] = await pool.query(
      `SELECT u.id uid, u.val uname, tok.id tok_id, tok.val tok_val, xsrf.id xsrf_id, xsrf.val xsrf_val
       FROM \`${db}\` u
       LEFT JOIN \`${db}\` tok  ON tok.up  = u.id AND tok.t  = ${TYPE.TOKEN}
       LEFT JOIN \`${db}\` xsrf ON xsrf.up = u.id AND xsrf.t = ${TYPE.XSRF}
       WHERE ${whereClause} LIMIT 1`,
      [whereParam]
    );

    if (!rows.length) {
      return res.status(200).json({ error: 'JWT verification failed' });
    }

    const user = rows[0];

    // PHP authJWT: updateTokens() regenerates token+xsrf, sets cookie
    const newToken = generateToken();
    const newXsrf  = generateXsrf(newToken, db, db);

    if (user.tok_id) {
      await pool.query(`UPDATE \`${db}\` SET val=? WHERE id=?`, [newToken, user.tok_id]);
    } else {
      await pool.query(`INSERT INTO \`${db}\` (up,ord,t,val) VALUES (?,1,${TYPE.TOKEN},?)`, [user.uid, newToken]);
    }
    if (user.xsrf_id) {
      await pool.query(`UPDATE \`${db}\` SET val=? WHERE id=?`, [newXsrf, user.xsrf_id]);
    } else {
      await pool.query(`INSERT INTO \`${db}\` (up,ord,t,val) VALUES (?,1,${TYPE.XSRF},?)`, [user.uid, newXsrf]);
    }

    res.cookie(db, newToken, { path: '/', httpOnly: false });

    logger.info('[Legacy jwt] JWT validated', { db, uid: user.uid });

    // PHP authJWT() response: {_xsrf, token, id, user}
    res.status(200).json({ _xsrf: newXsrf, token: newToken, id: user.uid, user: user.uname });
  } catch (error) {
    logger.error('[Legacy jwt] Error', { error: error.message, db });
    res.status(200).json({ error: 'JWT verification failed' });
  }
});

/**
 * confirm - Confirm password change via reset link
 * POST /:db/confirm
 *
 * PHP: index.php lines 7704-7713
 * Params: u=username, o=old_pwd_hash, p=new_pwd_hash
 * On success: login(db, u, "confirm") → API: {"message":"confirm","db":db,"login":u,"details":""}
 * On failure: login(db, u_encoded, "obsolete") → API: {"message":"obsolete","db":db,"login":u,"details":""}
 */
router.post('/:db/confirm', async (req, res) => {
  const { db } = req.params;
  // PHP params: u=username, o=old_hash, p=new_hash
  const u = (req.body.u || '').toLowerCase().trim();
  const o = req.body.o || '';
  const p = req.body.p || '';

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database' }]);
  }

  try {
    logger.info('[Legacy confirm] Request', { db, u });

    if (u && o && p) {
      const pool = getPool();
      // PHP: SELECT pwd.id FROM $z pwd, $z u WHERE pwd.up=u.id AND pwd.t=PASSWORD AND u.t=USER AND u.val='u' AND pwd.val='o'
      const [[row]] = await pool.query(
        `SELECT pwd.id FROM \`${db}\` pwd, \`${db}\` u WHERE pwd.up=u.id AND pwd.t=? AND u.t=? AND u.val=? AND pwd.val=?`,
        [TYPE.PASSWORD, TYPE.USER, u, o]
      );
      if (row) {
        // PHP: UPDATE $z SET val='p' WHERE id=$row[0]
        await pool.query(`UPDATE \`${db}\` SET val=? WHERE id=?`, [p, row.id]);
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
});

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

    // Check if database already exists
    const existsQuery = `SHOW TABLES LIKE '${newDbName}'`;
    const [existingTables] = await pool.query(existsQuery);

    if (existingTables.length > 0) {
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

    await pool.query(createTableQuery);

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
        await pool.query(initQuery);
      } catch (e) {
        // Ignore duplicate key errors
        if (!e.message.includes('Duplicate')) {
          logger.warn('[Legacy _new_db] Init query error', { error: e.message });
        }
      }
    }

    // Get user ID from token cookie (PHP: $GLOBALS["GLOBAL_VARS"]["user_id"])
    const token = req.cookies.my || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    let userId = 0;
    let recordId = 0;

    if (token) {
      try {
        const [userRows] = await pool.query(
          `SELECT u.id FROM my u JOIN my tok ON tok.up = u.id AND tok.t = ${TYPE.TOKEN} WHERE tok.val = ? LIMIT 1`,
          [token]
        );
        if (userRows.length > 0) {
          userId = userRows[0].id;

          // PHP: $id = Insert($GLOBALS["GLOBAL_VARS"]["user_id"], 1, DATABASE, $db, "Register extra DB");
          const [insertResult] = await pool.query(
            `INSERT INTO my (up, ord, t, val) VALUES (?, 1, ${TYPE.DATABASE}, ?)`,
            [userId, newDbName.toLowerCase()]
          );
          recordId = insertResult.insertId;

          // PHP also inserts date and template info
          await pool.query(`INSERT INTO my (up, ord, t, val) VALUES (?, 1, 275, ?)`, [recordId, new Date().toISOString().slice(0, 10).replace(/-/g, '')]);
          await pool.query(`INSERT INTO my (up, ord, t, val) VALUES (?, 1, 283, ?)`, [recordId, template]);
          if (description) {
            await pool.query(`INSERT INTO my (up, ord, t, val) VALUES (?, 1, 276, ?)`, [recordId, description]);
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

router.post('/:db/upload', (req, res, next) => {
  const { db } = req.params;
  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database' }]);
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
router.get('/:db/download/:filename', async (req, res) => {
  const { db, filename } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const baseDir = path.join(legacyPath, 'download', db);
    const filePath = safePath(baseDir, filename);

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return res.status(404).json({ error: 'File not found' });
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
router.get('/:db/dir_admin', async (req, res) => {
  const { db } = req.params;
  const { download, add_path, gf } = req.query;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
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
      return res.status(404).json({ error: 'File not found' });
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
  };

  try {
    // Get report definition row
    const [reportRows] = await pool.query(
      `SELECT id, val, t, up FROM \`${db}\` WHERE id = ?`,
      [reportId]
    );

    if (reportRows.length === 0) return null;

    report.header     = reportRows[0].val;
    // PHP: report.up = type this report is "about" (its parent type)
    report.parentType = parseInt(reportRows[0].up, 10) || 0;

    // Get REP_COLS rows.
    // val = requisite type ID (the JOIN key); we look up its display name from the type row.
    const [colRows] = await pool.query(
      `SELECT
         col.id,
         col.val  AS req_type_raw,
         col.ord,
         typ.val  AS col_name,
         typ.t    AS col_base_t
       FROM \`${db}\` col
       LEFT JOIN \`${db}\` typ ON typ.id = CAST(col.val AS UNSIGNED)
       WHERE col.up = ? AND col.t = ${TYPE.REP_COLS}
       ORDER BY col.ord`,
      [reportId]
    );

    for (const col of colRows) {
      const reqTypeId = parseInt(col.req_type_raw, 10);
      // Label: prefer the looked-up type name, fall back to raw val
      const colLabel  = col.col_name || col.req_type_raw || String(reqTypeId);
      const alias     = `c${col.id}`;

      report.head.push(colLabel);
      report.names[report.head.length - 1]   = alias;
      report.types[report.head.length - 1]   = reqTypeId;
      report.baseOut[report.head.length - 1] = col.col_base_t || TYPE.CHARS;

      report.columns.push({
        id:         col.id,
        name:       colLabel,
        alias,
        reqTypeId,          // ← which type to LEFT JOIN on
        isMainCol:  reqTypeId === report.parentType,  // main object's own val
        baseType:   col.col_base_t || TYPE.CHARS,
        isRef:      !REV_BASE_TYPE[col.col_base_t] && (col.col_base_t || 0) > 0,
        order:      col.ord,
      });
    }

    // Get REP_JOIN rows (explicit additional joins)
    const [joinRows] = await pool.query(
      `SELECT id, val, t FROM \`${db}\` WHERE up = ? AND t = ${TYPE.REP_JOIN}`,
      [reportId]
    );

    for (const join of joinRows) {
      report.joins.push({
        id:     join.id,
        typeId: parseInt(join.val, 10) || 0,
        t:      join.t,
      });
    }

    logger.debug('[Report] Compiled report', {
      db, reportId,
      parentType: report.parentType,
      columns: report.columns.length,
      joins: report.joins.length,
    });

  } catch (error) {
    logger.error('[Report] Error compiling report', { error: error.message, db, reportId });
    return null;
  }

  return report;
}

/**
 * Execute report with proper LEFT JOINs per column.
 *
 * PHP equivalent: builds one LEFT JOIN per REP_COLS column joining the db
 * table to itself on (child.up = main.id AND child.t = reqTypeId).
 *
 * Filters: keys are column aliases or names; values are {from, to, eq, like}.
 */
async function executeReport(pool, db, report, filters = {}, limit = 100, offset = 0, orderParam = null) {
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

    for (const col of report.columns) {
      if (!col.reqTypeId || isNaN(col.reqTypeId)) continue;

      if (col.isMainCol) {
        // This column IS the main type itself → map to a.val, no extra join
        selectParts.push(`a.val AS \`${col.alias}\``);
      } else {
        // LEFT JOIN for each requisite column
        selectParts.push(`\`${col.alias}\`.val AS \`${col.alias}\``);
        joinParts.push(
          `LEFT JOIN \`${db}\` \`${col.alias}\`` +
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

      // SmartQ text filters: FR_ColName=%searchterm% (LIKE), numeric: FR_ColName=N (>=)
      // Value with % → LIKE; value starting with @ → by ID; !% → NOT LIKE; else → >= (range from)
      if (filter.from  !== undefined && filter.from  !== '') {
        const fv = String(filter.from);
        if (fv.startsWith('!%')) {
          whereParts.push(`${expr} NOT LIKE ?`); whereParams.push(fv.slice(1));
        } else if (fv.includes('%')) {
          whereParts.push(`${expr} LIKE ?`); whereParams.push(fv);
        } else if (fv.startsWith('@')) {
          const fid = parseInt(fv.slice(1), 10);
          if (!isNaN(fid)) { whereParts.push(`${expr} = ?`); whereParams.push(fid); }
        } else {
          whereParts.push(`${expr} >= ?`); whereParams.push(fv);
        }
      }
      if (filter.to    !== undefined && filter.to    !== '') { whereParts.push(`${expr} <= ?`);       whereParams.push(filter.to); }
      if (filter.eq    !== undefined && filter.eq    !== '') { whereParts.push(`${expr} = ?`);        whereParams.push(filter.eq); }
      if (filter.like  !== undefined && filter.like  !== '') { whereParts.push(`${expr} LIKE ?`);     whereParams.push(`%${filter.like}%`); }
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
        const expr  = col.isMainCol ? 'a.val' : `\`${col.alias}\`.val`;
        return `${expr} ${desc ? 'DESC' : 'ASC'}`;
      }).filter(Boolean);
      if (orderParts.length > 0) orderClause = orderParts.join(', ');
    }

    const sql = [
      `SELECT ${selectParts.join(', ')}`,
      `FROM \`${db}\` a`,
      ...joinParts,
      `WHERE ${whereParts.join(' AND ')}`,
      `ORDER BY ${orderClause}`,
      `LIMIT ${lim} OFFSET ${off}`,
    ].join('\n');

    logger.debug('[Report] SQL', { sql });

    const [rows] = await pool.query(sql, whereParams);

    // ── Map rows → named output ───────────────────────────────────────────
    results.data = rows.map(row => {
      const out = { id: row.id, val: row.main_val };
      for (const col of report.columns) {
        out[col.alias] = row[col.alias] ?? '';
        // Companion ID value for {name}ID columns (used by smartq.js for obj-id / ref-id attributes)
        if (col.isMainCol)      out[col.alias + '_id'] = row.id;
        else if (col.isRef)     out[col.alias + '_id'] = row[col.alias] ?? '';
      }
      return out;
    });

    results.rownum = results.data.length;

    // ── Totals for numeric columns ─────────────────────────────────────────
    for (const col of report.columns) {
      const bt = REV_BASE_TYPE[col.baseType];
      if (bt === 'NUMBER' || bt === 'SIGNED') {
        let total = 0;
        for (const row of results.data) total += parseFloat(row[col.alias]) || 0;
        results.totals[col.alias] = total;
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
    const id = reportId ? parseInt(reportId, 10) : null;

    if (!id) {
      // List available reports
      const [rows] = await pool.query(
        `SELECT id, val AS name, ord FROM ${db} WHERE t = ${TYPE.REPORT} ORDER BY ord`
      );

      // PHP returns plain array — match that format
      return res.json(rows.map(r => ({ id: r.id, name: r.name, val: r.name, ord: r.ord })));
    }

    // Compile report
    const report = await compileReport(pool, db, id);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // If execution is requested, run the report
    // PHP also executes for JSON_KV, JSON_CR, JSON_HR, JSON_DATA flags (they select output format, not trigger)
    const q = req.query;
    const shouldExecute = execute || req.method === 'POST' ||
      q.JSON_KV !== undefined || q.JSON_CR !== undefined || q.JSON_HR !== undefined ||
      q.JSON_DATA !== undefined || q.RECORD_COUNT !== undefined;

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

      const orderParam = params.ORDER || params.order || null;
      const results = await executeReport(pool, db, report, filters, limit, offset, orderParam);

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
        const cntResults = await executeReport(pool, db, report, filters, 999999, 0, null);
        return res.json({ count: cntResults.rownum });
      }

      // CSV export (?format=csv)
      if (format === 'csv') {
        const headers = report.columns.map(c => c.name).join(',');
        const csvRows = results.data.map(row =>
          report.columns.map(c => `"${(row[c.alias] || '').toString().replace(/"/g, '""')}"`).join(',')
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=report_${id}.csv`);
        return res.send(headers + '\n' + csvRows);
      }

      // PHP-compatible JSON output formats
      if (q.JSON_KV !== undefined) {
        // [{col_name: val, ...}, ...] — array of objects using column names as keys
        const rows = results.data.map(row => {
          const obj = {};
          for (const col of report.columns) obj[col.name] = row[col.alias] ?? '';
          return obj;
        });
        return res.json(rows);
      }

      if (q.JSON_DATA !== undefined) {
        // {col_name: [col_array], ...} — object with column names → arrays
        const firstRow = results.data[0] || {};
        const obj = {};
        for (const col of report.columns) obj[col.name] = firstRow[col.alias] ?? '';
        return res.json(obj);
      }

      if (q.JSON_CR !== undefined) {
        // PHP JSON_CR: columns[i].id = column DB id; rows[row_idx][col_id] = value
        const cols = report.columns.map((col, i) => ({ id: col.id || i, name: col.name, type: col.reqTypeId || 0 }));
        const rows = {};
        results.data.forEach((row, i) => {
          rows[i] = {};
          for (const col of report.columns) rows[i][col.id] = row[col.alias] ?? '';
        });
        return res.json({ columns: cols, rows, totalCount: results.data.length });
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
              id: col.id,
              name: col.name,
              // type = requisite type ID (used by smartq.js as req-id for inline editing / metadata)
              type: col.reqTypeId || 0,
              format: REV_BASE_TYPE[col.baseType] || 'CHARS',
              align: col.align || 'LEFT',
              totals: totalsMap[col.alias] !== undefined ? totalsMap[col.alias] : null,
              // ref = truthy for reference columns; smartq uses ref-id vs obj-id
              ref: col.isRef ? col.baseType : null,
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
        id: col.id, name: col.name, align: col.align || 'LEFT'
      }));
      const rowData = results.data.map(row =>
        report.columns.map(col => row[col.alias] !== undefined ? row[col.alias] : '')
      );
      const topTotals = report.columns.map(col =>
        (results.totals || {})[col.alias] !== undefined ? (results.totals || {})[col.alias] : null
      );
      return res.json({
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
    const [reqRows] = await pool.query(
      `SELECT id, val, t FROM ${db} WHERE up = ? ORDER BY ord`,
      [type]
    );

    // Parse requisite names and aliases
    const requisites = reqRows.map(r => {
      const aliasMatch = r.val.match(/:ALIAS=([^:]+):/);
      return {
        id: r.id,
        name: r.val.replace(/:ALIAS=[^:]+:/g, '').replace(/:!NULL:/g, '').replace(/:MULTI:/g, '').trim(),
        alias: aliasMatch ? aliasMatch[1] : null,
        type: r.t
      };
    });

    // Get objects of the type
    const [rows] = await pool.query(
      `SELECT id, val, up, ord FROM ${db} WHERE t = ? ORDER BY ord`,
      [type]
    );

    // If include requisites, fetch all requisite values
    let exportData = rows;
    if (include_reqs === '1' && requisites.length > 0) {
      const objectIds = rows.map(r => r.id);

      if (objectIds.length > 0) {
        // Get all requisite values for these objects
        const [reqValues] = await pool.query(
          `SELECT up AS obj_id, t AS req_type, val FROM ${db} WHERE up IN (?) AND t IN (?)`,
          [objectIds, requisites.map(r => r.id)]
        );

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
      return res.status(401).json({ error: 'No token provided' });
    }

    // Validate token and get user role
    const [userRows] = await pool.query(`
      SELECT u.id, u.val AS username, role_def.id AS role_id, role_def.val AS role_name
      FROM ${db} tok
      JOIN ${db} u ON tok.up = u.id
      LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
      WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
      LIMIT 1
    `, [token]);

    if (userRows.length === 0) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = userRows[0];

    // Get grants for the user's role
    const grants = await getGrants(pool, db, user.role_id);

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
      return res.status(401).json({ error: 'No token provided' });
    }

    // Validate token and get user
    const [userRows] = await pool.query(`
      SELECT u.id, u.val AS username, role_def.id AS role_id
      FROM ${db} tok
      JOIN ${db} u ON tok.up = u.id
      LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
      WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
      LIMIT 1
    `, [token]);

    if (userRows.length === 0) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = userRows[0];

    // Get grants
    const grants = await getGrants(pool, db, user.role_id);

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
      const [userRows] = await pool.query(`
        SELECT u.id, u.val AS username, role_def.id AS role_id
        FROM ${db} tok
        JOIN ${db} u ON tok.up = u.id
        LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
        WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
        LIMIT 1
      `, [token]);

      if (userRows.length > 0) {
        username = userRows[0].username;
        grants = await getGrants(pool, db, userRows[0].role_id);
      }
    }

    // Check EXPORT grant (PHP: if(!isset($GLOBALS["GRANTS"]["EXPORT"][1]) && user != admin))
    if (!grants.EXPORT?.[1] && username.toLowerCase() !== 'admin' && username !== db) {
      return res.status(403).send('You do not have permission to export the database');
    }

    // Get all types (PHP query from csv_all)
    const [typeRows] = await pool.query(`
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
    `);

    // Build type structure (similar to PHP logic)
    const typ = {}; // id -> name
    const base = {}; // id -> base type
    const reqs = {}; // id -> array of requisite IDs
    const reqSet = new Set(); // Types used as requisites

    for (const row of typeRows) {
      const revBt = REV_BASE_TYPE[row.t] || null;
      if (revBt === 'CALCULATABLE' || revBt === 'BUTTON') continue;

      const i = row.id;
      base[i] = row.base;

      if (!reqSet.has(i) && !typ[i]) {
        typ[i] = maskCsvDelimiters(row.val);
        reqs[i] = [];
      }

      if (row.req) {
        if (!reqs[i]) reqs[i] = [];
        reqs[i].push({
          reqId: row.req_id,
          reqBase: row.req_base,
          isRef: row.ref === 1
        });
        delete typ[row.req];
        reqSet.add(row.req);
        typ[i] = (typ[i] || '') + ';' + maskCsvDelimiters(row.req);
      }
    }

    // Build CSV content
    let csvContent = '\ufeff'; // BOM for UTF-8

    for (const typeId of Object.keys(typ)) {
      const id = parseInt(typeId, 10);
      csvContent += typ[typeId];

      // Get objects of this type
      const [objects] = await pool.query(`
        SELECT id, val FROM ${db}
        WHERE t = ? AND up != 0
        ORDER BY id
        LIMIT 500000
      `, [id]);

      for (const obj of objects) {
        let line = '\n' + maskCsvDelimiters(formatValView(base[id], obj.val));

        // Get requisites for each object
        if (reqs[id] && reqs[id].length > 0) {
          for (const rq of reqs[id]) {
            const [reqRows] = await pool.query(`
              SELECT val FROM ${db}
              WHERE up = ? AND t = ?
              LIMIT 1
            `, [obj.id, rq.reqId]);

            if (reqRows.length > 0) {
              line += ';' + maskCsvDelimiters(formatValView(rq.reqBase, reqRows[0].val));
            } else {
              line += ';';
            }
          }
        }
        csvContent += line;
      }

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
      const [userRows] = await pool.query(`
        SELECT u.id, u.val AS username, role_def.id AS role_id
        FROM ${db} tok
        JOIN ${db} u ON tok.up = u.id
        LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
        WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
        LIMIT 1
      `, [token]);

      if (userRows.length > 0) {
        username = userRows[0].username;
        grants = await getGrants(pool, db, userRows[0].role_id);
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
      const [rows] = await pool.query(`
        SELECT id, up, t, ord, val
        FROM ${db}
        WHERE id > ?
        ORDER BY id
        LIMIT ?
      `, [lastId, limit]);

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
      const [userRows] = await pool.query(`
        SELECT u.id, u.val AS username, role_def.id AS role_id
        FROM ${db} tok
        JOIN ${db} u ON tok.up = u.id
        LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
        WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
        LIMIT 1
      `, [token]);

      if (userRows.length > 0) {
        username = userRows[0].username;
        grants = await getGrants(pool, db, userRows[0].role_id);
      }
    }

    // Check EXPORT grant (same as backup for restore)
    if (!grants.EXPORT?.[1] && username.toLowerCase() !== 'admin' && username !== db) {
      return res.status(403).json({ error: 'You do not have permission to import to the database' });
    }

    // Get dump content: file upload (ZIP) > backup_file param > body.content > body.data
    let dumpContent = '';
    if (req.file) {
      // Extract .dmp text from uploaded ZIP
      const entries = readZip(req.file.buffer);
      const dmpEntry = entries.find(e => e.name.endsWith('.dmp')) || entries[0];
      if (!dmpEntry) return res.status(400).json({ error: 'No .dmp file found in ZIP' });
      dumpContent = dmpEntry.content.toString('utf8');
    } else if (req.body?.backup_file || req.query?.backup_file) {
      // PHP: ?backup_file=path reads a ZIP from the filesystem
      // Restrict to the db's download directory (no path traversal)
      const backupFileName = path.basename(req.body.backup_file || req.query.backup_file);
      const backupDir = path.join(legacyPath, 'download', db);
      const backupFilePath = path.join(backupDir, backupFileName);
      if (!backupFilePath.startsWith(backupDir + path.sep) && backupFilePath !== backupDir) {
        return res.status(400).json({ error: 'Invalid backup_file path' });
      }
      if (!fs.existsSync(backupFilePath)) {
        return res.status(400).json({ error: 'Backup file not found' });
      }
      const fileBuffer = fs.readFileSync(backupFilePath);
      if (backupFileName.endsWith('.zip')) {
        const entries = readZip(fileBuffer);
        const dmpEntry = entries.find(e => e.name.endsWith('.dmp')) || entries[0];
        if (!dmpEntry) return res.status(400).json({ error: 'No .dmp file found in ZIP' });
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
      return res.status(400).json({ error: 'No backup content provided' });
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
      return res.status(400).json({ error: 'Empty or unrecognised dump file' });
    }

    // Execute in batches of 1000
    const BATCH = 1000;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await pool.query(
        `INSERT IGNORE INTO \`${db}\` (\`id\`, \`t\`, \`up\`, \`ord\`, \`val\`) VALUES ?`,
        [batch]
      );
    }

    logger.info('[Legacy restore] Import completed', { db, rowCount: rows.length });
    res.json({ status: 'Ok', rows: rows.length });
  } catch (error) {
    logger.error('[Legacy restore] Error', { error: error.message, db });
    res.status(500).json({ error: 'Restore failed: ' + error.message });
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
      return res.status(404).json({ error: 'Report not found' });
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

    const results = await executeReport(pool, db, report, filters, limit, offset);

    const q = req.query;

    // RECORD_COUNT: smartq.js calls ?JSON&RECORD_COUNT → {count: N}
    if (q.RECORD_COUNT !== undefined) {
      const cntResults = await executeReport(pool, db, report, filters, 999999, 0);
      return res.json({ count: cntResults.rownum });
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

    // JSON_DATA format: {col_name: first_row_value, ...}
    if (q.JSON_DATA !== undefined) {
      const firstRow = results.data[0] || {};
      const obj = {};
      for (const col of report.columns) obj[col.name] = firstRow[col.alias] ?? '';
      return res.json(obj);
    }

    // PHP JSON_CR: rows[row_idx][col_id] = value (keyed by column DB id)
    if (q.JSON_CR !== undefined) {
      const cols = report.columns.map((col, i) => ({
        id: col.id || i,
        name: col.name,
        type: col.baseType || 0
      }));
      const rows = {};
      results.data.forEach((row, i) => {
        rows[i] = {};
        for (const col of report.columns) rows[i][col.id] = row[col.alias] ?? '';
      });
      return res.json({ columns: cols, rows, totalCount: results.data.length });
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
        id: col.id,
        name: col.name,
        type: col.reqTypeId || 0,
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

export default router;
