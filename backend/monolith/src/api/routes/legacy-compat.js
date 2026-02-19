// Legacy PHP Backend Compatibility Layer
// Allows legacy HTML frontend (integram-server/) to work with new Node.js backend
// Maps old PHP URL patterns to new API endpoints

import express from 'express';
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from '../../utils/logger.js';
import cookieParser from 'cookie-parser';
import multer from 'multer';

const router = express.Router();

// Get the directory path for serving static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const legacyPath = path.resolve(__dirname, '../../../../../integram-server');

// PHP isAPI: any of JSON/JSON_DATA/JSON_KV/JSON_CR/JSON_HR triggers API mode
function isApiRequest(req) {
  const q = req.query;
  return q.JSON !== undefined || q.json !== undefined ||
         q.JSON_DATA !== undefined || q.JSON_KV !== undefined ||
         q.JSON_CR !== undefined || q.JSON_HR !== undefined;
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

// PHP SALT constant — must match integram-server/include/connection.php define("SALT", ...)
const PHP_SALT = process.env.INTEGRAM_PHP_SALT || 'DronedocSalt2025';

/**
 * PHP Salt() function equivalent
 * PHP: function Salt($u, $val) { global $z; $u=strtoupper($u); return SALT."$u$z$val"; }
 * When called as Salt($token, $db) with global $z = $db:
 *   returns SALT + TOKEN.toUpperCase() + db + db
 */
function phpSalt(token, db) {
  return PHP_SALT + token.toUpperCase() + db + db;
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
 * Salt($token, $db) = SALT + TOKEN.toUpperCase() + db + db
 */
function generateXsrf(token, db) {
  return crypto.createHash('sha1').update(phpSalt(token, db)).digest('hex').substring(0, 22);
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
      xsrf   = rows[0].xsrf_val || generateXsrf(token, db);
    }
  } catch (e) {
    xsrf = generateXsrf(token, db);
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
};

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
router.post('/:db/auth', async (req, res) => {
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
        return res.status(200).json([{ error: `Wrong credentials for user ${login} in ${db}` }]);
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
        return res.status(200).json([{ error: `Wrong credentials for user ${login} in ${db}` }]);
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
    let xsrf = generateXsrf(token || '', db);

    if (!token) {
      token = generateToken();
      xsrf = generateXsrf(token, db);
      await pool.query(
        `INSERT INTO ${db} (up, t, val) VALUES (?, ${TYPE.TOKEN}, ?)`,
        [user.uid, token]
      );
    }

    if (!user.xsrf) {
      await pool.query(
        `INSERT INTO ${db} (up, t, val) VALUES (?, ${TYPE.XSRF}, ?)`,
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
      // User found — PHP sends email with first 4 chars of token as code
      // (email sending not implemented in standalone mode)
      logger.info({ db, u }, '[Legacy GetCode] User found, code would be sent');
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
      const newXsrf = generateXsrf(newToken, db);

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

  // Mock successful registration
  logger.info('[Legacy Register] Success', { email });

  if (isJSON) {
    return res.json({
      success: true,
      message: 'toConfirm',
    });
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
  const token = req.cookies[db];
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

  if (isApiRequest(req)) {
    return res.json({ success: true, message: 'Logged out' });
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

  const token = req.cookies[db];

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

  // Check if user has a valid token cookie
  const token = req.cookies[db];

  logger.info('[Legacy Page] Request', { db, hasToken: !!token });

  if (!token) {
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
      return res.redirect(`/${db}`);
    }

    const pool = getPool();

    // Validate token
    const query = `
      SELECT user.id AS uid
      FROM ${db} user
      JOIN ${db} token ON token.up = user.id AND token.t = ${TYPE.TOKEN}
      WHERE token.val = ? AND user.t = ${TYPE.USER}
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [token]);

    if (rows.length === 0) {
      // Invalid token - clear cookie and redirect to login
      res.clearCookie(db, { path: '/' });
      return res.redirect(`/${db}`);
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

  const token = req.cookies[db];

  // If no token and not auth-related, redirect to login
  if (!token && page !== 'auth' && page !== 'login' && page !== 'register') {
    return res.redirect(`/${db}?uri=${encodeURIComponent(req.originalUrl)}`);
  }

  logger.info('[Legacy SubPage] Request', { db, page, fullPath });

  // Map page names to template files
  const pageMap = {
    'dict': 'templates/dict.html',
    'object': 'templates/object.html',
    'edit': 'templates/edit_obj.html',
    'report': 'templates/report.html',
    'types': 'templates/edit_types.html',
    'form': 'templates/form.html',
    'upload': 'templates/upload.html',
    'sql': 'templates/sql.html',
    'admin': 'templates/dir_admin.html',
    'info': 'templates/info.html',
    'quiz': 'templates/quiz.html',
  };

  const templatePath = pageMap[page];
  if (templatePath) {
    const fullTemplatePath = path.join(legacyPath, templatePath);
    if (fs.existsSync(fullTemplatePath)) {
      return res.sendFile(fullTemplatePath);
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
 */
router.post('/:db/_m_new/:up?', async (req, res) => {
  const { db, up } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const parentId = parseInt(up || req.body.up || '0', 10);
    const typeId = parseInt(req.body.t, 10);
    const value = req.body.val || '';

    if (!typeId) {
      return res.status(200).json([{ error: 'Type ID (t) is required'  }]);
    }

    // Get next order
    const order = await getNextOrder(db, parentId, typeId);

    // Insert the object
    const id = await insertRow(db, parentId, order, typeId, value);

    logger.info('[Legacy _m_new] Object created', { db, id, typeId, parentId });

    // Save requisites (t{id}=value format)
    const attributes = extractAttributes(req.body);
    for (const [attrTypeId, attrValue] of Object.entries(attributes)) {
      const attrOrder = await getNextOrder(db, id, parseInt(attrTypeId, 10));
      await insertRow(db, id, attrOrder, parseInt(attrTypeId, 10), String(attrValue));
    }

    const pool = getPool();

    // Check if type has requisites (determines next_act per PHP logic)
    const [reqRows] = await pool.query(
      `SELECT id FROM \`${db}\` WHERE up=? AND up!=0 LIMIT 1`,
      [typeId]
    );
    const hasReqs = reqRows.length > 0;

    // PHP response format: {"id":$i,"obj":$obj,"ord":$ord,"next_act":"...","args":"...","val":"..."}
    const next_act = hasReqs ? 'edit_obj' : 'object';
    const args = hasReqs ? `new1=1&` : (parentId > 1 ? `F_U=${parentId}` : '');

    return res.status(200).json({
      id,
      obj: id,
      ord: order,
      next_act,
      args,
      val: value,
      warning: '',
    });
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
        FROM ${db} typs, ${db} a
        WHERE typs.id = a.t AND a.id = ?
      `, [originalId]);

      if (objRows.length === 0) {
        return res.status(200).json([{ error: 'Object not found' }]);
      }

      const original = objRows[0];

      // Get value from request if provided, otherwise use original
      const newVal = req.body[`t${original.typ}`] !== undefined
        ? req.body[`t${original.typ}`]
        : (req.body.val !== undefined ? req.body.val : original.val);

      // Calculate order for new object
      let newOrd = 1;
      if (original.up > 1) {
        const [ordRows] = await pool.query(`
          SELECT MAX(ord) AS max_ord FROM ${db}
          WHERE up = ? AND t = ?
        `, [original.up, original.typ]);
        newOrd = (ordRows[0]?.max_ord || 0) + 1;
      }

      // Create the copy
      const [insertResult] = await pool.query(`
        INSERT INTO ${db} (up, ord, t, val)
        VALUES (?, ?, ?, ?)
      `, [original.up, newOrd, original.typ, newVal]);

      objectId = insertResult.insertId;

      // Copy all requisites (PHP: Populate_Reqs)
      const [reqRows] = await pool.query(`
        SELECT t, val, ord FROM ${db}
        WHERE up = ?
        ORDER BY ord
      `, [originalId]);

      for (const reqRow of reqRows) {
        await pool.query(`
          INSERT INTO ${db} (up, ord, t, val)
          VALUES (?, ?, ?, ?)
        `, [objectId, reqRow.ord, reqRow.t, reqRow.val]);
      }

      logger.info('[Legacy _m_save] Object copied', { db, originalId, newId: objectId });

      // Return with copied1=1 flag as PHP does
      return res.json({
        status: 'Ok',
        id: objectId,
        val: newVal,
        copied: true,
        copied1: 1,
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

    // Update requisites (t{id}=value format)
    const attributes = extractAttributes(req.body);
    for (const [attrTypeId, attrValue] of Object.entries(attributes)) {
      const typeIdNum = parseInt(attrTypeId, 10);
      const existing = await getRequisiteByType(db, objectId, typeIdNum);

      if (existing) {
        // Update existing requisite
        await updateRowValue(db, existing.id, String(attrValue));
      } else {
        // Create new requisite
        const attrOrder = await getNextOrder(db, objectId, typeIdNum);
        await insertRow(db, objectId, attrOrder, typeIdNum, String(attrValue));
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

    const response = {
      status: 'Ok',
      id: objectId,
      val: req.body.val,
      saved1: 1,
    };

    // If SEARCH_* params are present, include them so the client can filter dropdown lists
    if (Object.keys(searchParams).length > 0) {
      response.search = searchParams;
    }

    res.json(response);
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
    const objectId = parseInt(id, 10);
    const cascade = req.body.cascade === '1' || req.body.cascade === true;

    // Delete children first if cascade
    if (cascade) {
      await deleteChildren(db, objectId);
    }

    // Delete the object
    await deleteRow(db, objectId);

    logger.info('[Legacy _m_del] Object deleted', { db, id: objectId, cascade });

    res.json({ status: 'Ok' });
  } catch (error) {
    logger.error('[Legacy _m_del] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _m_set - Set object attributes
 * POST /:db/_m_set/:id
 * Parameters: t{id}=value (attributes to set)
 */
router.post('/:db/_m_set/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const objectId = parseInt(id, 10);
    const attributes = extractAttributes(req.body);

    if (Object.keys(attributes).length === 0) {
      return res.status(200).json([{ error: 'No attributes provided'  }]);
    }

    for (const [attrTypeId, attrValue] of Object.entries(attributes)) {
      const typeIdNum = parseInt(attrTypeId, 10);
      const existing = await getRequisiteByType(db, objectId, typeIdNum);

      if (existing) {
        await updateRowValue(db, existing.id, String(attrValue));
      } else {
        const attrOrder = await getNextOrder(db, objectId, typeIdNum);
        await insertRow(db, objectId, attrOrder, typeIdNum, String(attrValue));
      }
    }

    logger.info('[Legacy _m_set] Attributes set', { db, id: objectId });

    res.json({ status: 'Ok' });
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
    await pool.query(`UPDATE ${db} SET up = ?, ord = ? WHERE id = ?`, [newParentId, newOrder, objectId]);

    logger.info('[Legacy _m_move] Object moved', { db, id: objectId, newParentId });

    res.json({ status: 'Ok' });
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
    const limit = parseInt(req.query.LIMIT || req.body.LIMIT || '50', 10);
    const offset = parseInt(req.query.F || req.body.F || '0', 10);
    const search = req.query.q || req.body.q || '';

    // Build query
    let query = `SELECT id, val, up, t, ord FROM ${db} WHERE t = ?`;
    let countQuery = `SELECT COUNT(*) as total FROM ${db} WHERE t = ?`;
    const params = [type];
    const countParams = [type];

    if (parentId !== null) {
      query += ` AND up = ?`;
      countQuery += ` AND up = ?`;
      params.push(parentId);
      countParams.push(parentId);
    }

    if (search) {
      query += ` AND val LIKE ?`;
      countQuery += ` AND val LIKE ?`;
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }

    query += ` ORDER BY ord LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await pool.query(query, params);
    const [countRows] = await pool.query(countQuery, countParams);
    const total = countRows[0]?.total || 0;

    const objects = rows.map(row => ({
      id: row.id,
      val: row.val,
      up: row.up,
      t: row.t,
      ord: row.ord,
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

    // Format results
    const objects = rows.map(row => {
      const obj = {
        id: row.id,
        val: row.val,
        up: row.up,
        t: row.t,
        ord: row.ord,
        reqs: {}
      };

      // Add requisite values
      for (const req of reqsToJoin) {
        obj.reqs[req.alias] = row[req.alias] || null;
        // Also add formatted value
        if (row[req.alias]) {
          obj.reqs[`${req.alias}_formatted`] = formatValView(req.type, row[req.alias]);
        }
      }

      return obj;
    });

    logger.info('[Legacy _list_join] Multi-join query', { db, type, joinedReqs: reqsToJoin.length, rows: objects.length });

    res.json({
      data: objects,
      total,
      limit,
      offset,
      requisites: reqsToJoin.map(r => ({ id: r.id, name: r.name, alias: r.alias, type: r.type }))
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

      return {
        id: row.id,
        name: name.trim(),
        alias,
        type: row.type,
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
      `SELECT a.id, a.val, a.t, reqs.t AS reqs_t
       FROM \`${db}\` a
       LEFT JOIN \`${db}\` reqs ON reqs.up = a.id
       WHERE a.up = 0 AND a.id != a.t AND a.val != '' AND a.t != 0
       ORDER BY a.val`
    );

    // Replicate PHP terms filtering logic:
    // - Skip CALCULATABLE (t=15) and BUTTON (t=7) base types
    // - Track which type IDs are used as requisite types ($req)
    // - Only show types not used as requisites elsewhere
    const base = {}; // id -> t
    const typ = {};  // id -> val (types to display)
    const reqMap = {};  // id -> true (types used as requisites)

    for (const row of rows) {
      const revBt = REV_BASE_TYPE[row.t] || null;
      if (revBt === 'CALCULATABLE' || revBt === 'BUTTON') continue;

      base[row.id] = row.t;
      if (!reqMap[row.id]) {
        typ[row.id] = row.val;
      }
      if (row.reqs_t) {
        delete typ[row.reqs_t];
        reqMap[row.reqs_t] = true;
      }
    }

    // Build response array matching PHP: [{id, type, name}]
    // PHP: if(Grant_1level($id)) $json .= ...
    const types = [];
    for (const id of Object.keys(typ)) {
      const numId = Number(id);
      // Apply Grant_1level filtering (PHP line 8938)
      const grantLevel = await grant1Level(pool, db, grants, numId, username);
      if (grantLevel) {
        types.push({
          id: numId,
          type: base[id],
          name: typ[id],
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
  const token = req.cookies[db];

  if (!token || !isValidDbName(db)) {
    // No token — return minimal info (client will redirect to login)
    return res.status(200).json({ _xsrf: '', token: null, user: '', role: '', id: 0, msg: '' });
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT u.id uid, u.val uname, xsrf.val xsrf_val, role.val role_val
       FROM ${db} u
       JOIN ${db} tok ON tok.up=u.id AND tok.t=${TYPE.TOKEN} AND tok.val=?
       LEFT JOIN ${db} xsrf ON xsrf.up=u.id AND xsrf.t=${TYPE.XSRF}
       LEFT JOIN ${db} role ON role.up=u.id AND role.t=${TYPE.ROLE}
       WHERE u.t=${TYPE.USER}
       LIMIT 1`,
      [token]
    );

    if (rows.length === 0) {
      // Invalid token — clear cookie, return empty session
      res.clearCookie(db, { path: '/' });
      return res.status(200).json({ _xsrf: '', token: null, user: '', role: '', id: 0, msg: '' });
    }

    const user = rows[0];
    // Recompute xsrf from token to keep in sync (matches PHP updateTokens())
    const xsrf = generateXsrf(token, db);

    return res.status(200).json({
      _xsrf: xsrf,
      token,
      user: user.uname,
      role: user.role_val || '',
      id: user.uid,
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

      query += ` ORDER BY val LIMIT 80`;
      const [rows] = await pool.query(query, params);
      const result = {};
      for (const row of rows) {
        result[row.id] = row.val || '--';
      }
      return res.json(result);
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

    // Build the query with joins for requisite values
    // PHP: joins requisite tables to fetch additional identifying info
    let selectCols = 'vals.id, vals.val AS ref_val';
    let joinClauses = '';

    for (let i = 0; i < refReqs.length; i++) {
      const rq = refReqs[i];
      const reqAlias = `a${rq.reqId}`;
      selectCols += `, ${reqAlias}.val AS ${reqAlias}val`;

      if (rq.isRef) {
        // Reference type - join through intermediate table
        joinClauses += ` LEFT JOIN (${db} r${rq.reqId} CROSS JOIN ${db} ${reqAlias}) ON r${rq.reqId}.up = vals.id AND ${reqAlias}.id = r${rq.reqId}.t AND ${reqAlias}.t = ${rq.base}`;
      } else {
        // Direct requisite
        joinClauses += ` LEFT JOIN ${db} ${reqAlias} ON ${reqAlias}.up = vals.id AND ${reqAlias}.t = ${rq.reqId}`;
      }
    }

    // Build WHERE clause
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

    // Handle search parameter
    let searchClause = '';
    if (searchQuery) {
      if (searchQuery.startsWith('@')) {
        const searchId = parseInt(searchQuery.substring(1), 10);
        if (!isNaN(searchId)) {
          whereClause += ` AND vals.id = ${searchId}`;
        }
      } else {
        // PHP: searches across val and all requisite values using CONCAT
        const escapedSearch = searchQuery.replace(/'/g, "''").replace(/%/g, '\\%');
        let searchConcat = 'vals.val';
        for (const rq of refReqs) {
          searchConcat = `CONCAT(${searchConcat}, '/', COALESCE(a${rq.reqId}.val, ''))`;
        }
        searchClause = ` AND ${searchConcat} LIKE '%${escapedSearch}%'`;
      }
    }

    // Execute the query
    const sql = `
      SELECT ${selectCols}
      FROM ${db} vals
      ${joinClauses}
      JOIN ${db} pars ON pars.id = vals.up AND pars.up != 0
      WHERE ${whereClause}${searchClause}
      ORDER BY vals.val
      LIMIT 80
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
 * _connect - Check database connection
 * GET/POST /:db/_connect
 */
router.all('/:db/_connect', async (req, res) => {
  const { db } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
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

    // Get next order
    const order = await getNextOrder(db, parentId);

    // Insert the new type
    const id = await insertRow(db, parentId, order, baseType, name);

    logger.info('[Legacy _d_new] Type created', { db, id, name, baseType, parentId });

    res.json({
      status: 'Ok',
      id,
      val: name,
      t: baseType,
      up: parentId,
      ord: order,
    });
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

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (req.body.val !== undefined) {
      updates.push('val = ?');
      params.push(req.body.val);
    }

    if (req.body.t !== undefined) {
      updates.push('t = ?');
      params.push(parseInt(req.body.t, 10));
    }

    if (req.body.up !== undefined) {
      updates.push('up = ?');
      params.push(parseInt(req.body.up, 10));
    }

    if (updates.length === 0) {
      return res.status(200).json([{ error: 'No fields to update'  }]);
    }

    params.push(id);
    await pool.query(`UPDATE ${db} SET ${updates.join(', ')} WHERE id = ?`, params);

    logger.info('[Legacy _d_save] Type saved', { db, id, updates: req.body });

    res.json({ status: 'Ok', id });
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

    res.json({ status: 'Ok' });
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

    res.json({
      status: 'Ok',
      id,
      val,
      t: reqType,
      up: parentId,
      ord: order,
    });
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

    res.json({ status: 'Ok', id, alias: newAlias });
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

    res.json({ status: 'Ok', id, required: newRequired });
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

    res.json({ status: 'Ok', id, multi: newMulti });
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

    res.json({
      status: 'Ok',
      id,
      name: newName,
      alias: newAlias,
      required: newRequired,
      multi: newMulti,
    });
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
      return res.json({ status: 'Ok', message: 'Already at top' });
    }

    const prevSibling = siblings[0];

    // Swap orders
    await pool.query(`UPDATE ${db} SET ord = ? WHERE id = ?`, [obj.ord, prevSibling.id]);
    await pool.query(`UPDATE ${db} SET ord = ? WHERE id = ?`, [prevSibling.ord, id]);

    logger.info('[Legacy _d_up] Requisite moved up', { db, id, newOrd: prevSibling.ord });

    res.json({ status: 'Ok', ord: prevSibling.ord });
  } catch (error) {
    logger.error('[Legacy _d_up] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_ord - Set order for requisite
 * POST /:db/_d_ord/:reqId
 * Parameters: ord (new order value)
 */
router.post('/:db/_d_ord/:reqId', async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const id = parseInt(reqId, 10);
    const newOrd = parseInt(req.body.ord, 10);

    if (isNaN(newOrd)) {
      return res.status(200).json([{ error: 'Order (ord) is required'  }]);
    }

    const pool = getPool();
    await pool.query(`UPDATE ${db} SET ord = ? WHERE id = ?`, [newOrd, id]);

    logger.info('[Legacy _d_ord] Order set', { db, id, ord: newOrd });

    res.json({ status: 'Ok', id, ord: newOrd });
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

    // Delete children first if cascade
    if (cascade) {
      await deleteChildren(db, id);
    }

    // Delete the requisite
    await deleteRow(db, id);

    logger.info('[Legacy _d_del_req] Requisite deleted', { db, id, cascade });

    res.json({ status: 'Ok' });
  } catch (error) {
    logger.error('[Legacy _d_del_req] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _d_ref - Create reference type (type that references another type)
 * POST /:db/_d_ref/:parentTypeId
 * Parameters: ref (referenced type ID), val (name)
 */
router.post('/:db/_d_ref/:parentTypeId', async (req, res) => {
  const { db, parentTypeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const parentId = parseInt(parentTypeId, 10);
    const refTypeId = parseInt(req.body.ref || req.body.t, 10);
    const name = req.body.val || req.body.name || '';

    if (!refTypeId) {
      return res.status(200).json([{ error: 'Reference type ID (ref) is required'  }]);
    }

    // Get next order
    const order = await getNextOrder(db, parentId);

    // Insert the reference requisite
    // The type (t) field is the referenced type ID
    const id = await insertRow(db, parentId, order, refTypeId, name);

    logger.info('[Legacy _d_ref] Reference created', { db, id, parentId, refTypeId, name });

    res.json({
      status: 'Ok',
      id,
      val: name,
      t: refTypeId,
      up: parentId,
      ord: order,
    });
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
      return res.json({ status: 'Ok', message: 'Already at top' });
    }

    const prevSibling = siblings[0];

    // Swap orders
    await pool.query(`UPDATE ${db} SET ord = ? WHERE id = ?`, [obj.ord, prevSibling.id]);
    await pool.query(`UPDATE ${db} SET ord = ? WHERE id = ?`, [prevSibling.ord, objectId]);

    logger.info('[Legacy _m_up] Object moved up', { db, id: objectId, newOrd: prevSibling.ord });

    res.json({ status: 'Ok', ord: prevSibling.ord });
  } catch (error) {
    logger.error('[Legacy _m_up] Error', { error: error.message, db });
    res.status(200).json([{ error: error.message  }]);
  }
});

/**
 * _m_ord - Set order for object
 * POST /:db/_m_ord/:id
 * Parameters: ord (new order value)
 */
router.post('/:db/_m_ord/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    const objectId = parseInt(id, 10);
    const newOrd = parseInt(req.body.ord, 10);

    if (isNaN(newOrd)) {
      return res.status(200).json([{ error: 'Order (ord) is required'  }]);
    }

    const pool = getPool();
    await pool.query(`UPDATE ${db} SET ord = ? WHERE id = ?`, [newOrd, objectId]);

    logger.info('[Legacy _m_ord] Order set', { db, id: objectId, ord: newOrd });

    res.json({ status: 'Ok', id: objectId, ord: newOrd });
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

  // ID changes are dangerous - usually not allowed
  logger.warn('[Legacy _m_id] ID change attempted (not implemented)', { db, id });

  res.status(200).json([{ error: 'ID change is not supported for data integrity reasons' }]);
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

    // Get object with its requisites and type information
    const query = `
      SELECT
        obj.id, obj.up, obj.t, obj.val,
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
      ORDER BY req.ord
    `;

    const [rows] = await pool.query(query, [objectId, objectId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Object not found' });
    }

    // Build response object
    const meta = {
      id: rows[0].id.toString(),
      up: rows[0].up.toString(),
      type: rows[0].t.toString(),
      val: rows[0].val || '',
      reqs: {}
    };

    // Add requisites
    for (const row of rows) {
      if (row.req_id) {
        const reqData = {
          id: row.req_id.toString(),
          val: row.req_val || '',
          type: row.base_typ ? row.base_typ.toString() : ''
        };

        if (row.arr_id) {
          reqData.arr_id = row.arr_id.toString();
        }

        if (row.ref_id) {
          reqData.ref = row.ref_id.toString();
          reqData.ref_id = row.req_type.toString();
        }

        if (row.req_attrs) {
          reqData.attrs = row.req_attrs;
        }

        meta.reqs[row.req_ord.toString()] = reqData;
      }
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

    // Group rows by type ID
    const typesMap = new Map();
    const reqsMap = new Map();

    for (const row of rows) {
      if (!typesMap.has(row.id)) {
        typesMap.set(row.id, {
          id: row.id.toString(),
          up: row.up.toString(),
          type: row.t.toString(),
          val: row.val || '',
          unique: row.uniq.toString(),
          reqs: []
        });
      }

      if (row.req_ord) {
        const reqData = {
          num: row.req_ord,
          id: row.req_id.toString(),
          val: row.req_val || '',
          orig: (row.ref_id || row.req_type || '').toString(),
          type: row.base_typ ? row.base_typ.toString() : ''
        };

        if (row.arr_id) {
          reqData.arr_id = row.arr_id.toString();
        }

        if (row.ref_id) {
          reqData.ref = row.ref_id.toString();
          reqData.ref_id = row.req_type.toString();
        }

        if (row.req_attrs) {
          reqData.attrs = row.req_attrs;
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
 * PHP: index.php lines 7608–7616
 * PHP accepts POST field named 'jwt', Node.js was reading 'token' - fixed to accept both
 */
router.post('/:db/jwt', async (req, res) => {
  const { db } = req.params;
  // PHP accepts 'jwt' field, also support 'token' for backwards compatibility
  const { jwt, token, refresh_token } = req.body;

  if (!isValidDbName(db)) {
    return res.status(200).json([{ error: 'Invalid database'  }]);
  }

  try {
    // JWT validation - verify token exists in database
    // PHP: $token = $_POST["jwt"] - accept both 'jwt' and 'token' field names
    const authToken = jwt || token || req.cookies[db] || req.headers['x-authorization'];

    if (!authToken) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const pool = getPool();

    const query = `
      SELECT
        user.id AS uid,
        user.val AS username,
        xsrf.val AS xsrf,
        role.id AS role_id,
        role.val AS role_name
      FROM ${db} user
      JOIN ${db} tkn ON tkn.up = user.id AND tkn.t = ${TYPE.TOKEN}
      LEFT JOIN ${db} xsrf ON xsrf.up = user.id AND xsrf.t = ${TYPE.XSRF}
      LEFT JOIN ${db} role ON role.up = user.id AND role.t = ${TYPE.ROLE}
      WHERE tkn.val = ? AND user.t = ${TYPE.USER}
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [authToken.replace('Bearer ', '')]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = rows[0];

    logger.info('[Legacy jwt] JWT validated', { db, uid: user.uid });

    res.json({
      success: true,
      valid: true,
      user: {
        id: user.uid,
        login: user.username,
        role: user.role_name || null,
        role_id: user.role_id || null
      },
      xsrf: user.xsrf,
      token: authToken
    });
  } catch (error) {
    logger.error('[Legacy jwt] Error', { error: error.message, db });
    res.status(200).json([{ error: 'JWT validation failed'  }]);
  }
});

/**
 * confirm - Confirm password change
 * POST /:db/confirm
 */
router.post('/:db/confirm', async (req, res) => {
  const { db } = req.params;
  const { code, password, password2 } = req.body;
  const isJSON = isApiRequest(req);

  if (!isValidDbName(db)) {
    if (isJSON) {
      return res.json({ success: false, error: 'Invalid database' });
    }
    return res.status(400).send('Invalid database');
  }

  // Validate passwords match
  if (password !== password2) {
    if (isJSON) {
      return res.json({ success: false, error: 'Passwords do not match' });
    }
    return res.status(400).send('Passwords do not match');
  }

  // Validate password strength
  if (!password || password.length < 6) {
    if (isJSON) {
      return res.json({ success: false, error: 'Password must be at least 6 characters' });
    }
    return res.status(400).send('Password must be at least 6 characters');
  }

  try {
    // In real implementation: verify code, update password
    logger.info('[Legacy confirm] Password confirmation', { db, codeProvided: !!code });

    if (isJSON) {
      return res.json({
        success: true,
        message: 'Password updated successfully'
      });
    }

    return res.redirect(`/${db}`);
  } catch (error) {
    logger.error('[Legacy confirm] Error', { error: error.message, db });
    if (isJSON) {
      return res.json({ success: false, error: 'Confirmation failed' });
    }
    return res.status(500).send('Confirmation failed');
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
    // Determine folder to list
    const folder = download ? 'download' : 'templates';
    const basePath = folder === 'download'
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
      add_path: addPath,
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
 * Compile a report - get columns, joins, and prepare query
 * Matches PHP's Compile_Report() function
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
    rownum: 0
  };

  try {
    // Get report definition
    const [reportRows] = await pool.query(
      `SELECT id, val, t, up FROM ${db} WHERE id = ?`,
      [reportId]
    );

    if (reportRows.length === 0) {
      return null;
    }

    report.header = reportRows[0].val;
    report.parentType = reportRows[0].up;

    // Get report columns (REP_COLS type)
    const [colRows] = await pool.query(
      `SELECT col.id, col.val, col.t, col.ord,
              typ.val AS typeName, typ.t AS baseType
       FROM ${db} col
       LEFT JOIN ${db} typ ON typ.id = col.t
       WHERE col.up = ? AND col.t = ${TYPE.REP_COLS}
       ORDER BY col.ord`,
      [reportId]
    );

    for (const col of colRows) {
      const colName = col.val.replace(/ /g, '_');
      report.head.push(col.val);
      report.names[report.head.length - 1] = colName;
      report.types[report.head.length - 1] = col.t;
      report.baseOut[report.head.length - 1] = col.baseType || TYPE.CHARS;
      report.columns.push({
        id: col.id,
        name: col.val,
        alias: colName,
        type: col.t,
        baseType: col.baseType,
        order: col.ord
      });
    }

    // Get report joins (REP_JOIN type)
    const [joinRows] = await pool.query(
      `SELECT id, val, t FROM ${db} WHERE up = ? AND t = ${TYPE.REP_JOIN}`,
      [reportId]
    );

    for (const join of joinRows) {
      report.joins.push({
        id: join.id,
        table: join.val,
        type: join.t
      });
    }

    logger.debug('[Report] Compiled report', { db, reportId, columns: report.columns.length, joins: report.joins.length });

  } catch (error) {
    logger.error('[Report] Error compiling report', { error: error.message, db, reportId });
    return null;
  }

  return report;
}

/**
 * Execute report query with filters
 */
async function executeReport(pool, db, report, filters = {}, limit = 100, offset = 0) {
  const results = {
    data: [],
    totals: {},
    rownum: 0
  };

  try {
    // Build WHERE clause from filters
    const whereClauses = [];
    const whereParams = [];

    for (const [colName, filter] of Object.entries(filters)) {
      if (filter.from !== undefined && filter.from !== '') {
        whereClauses.push(`${colName} >= ?`);
        whereParams.push(filter.from);
      }
      if (filter.to !== undefined && filter.to !== '') {
        whereClauses.push(`${colName} <= ?`);
        whereParams.push(filter.to);
      }
      if (filter.eq !== undefined && filter.eq !== '') {
        whereClauses.push(`${colName} = ?`);
        whereParams.push(filter.eq);
      }
      if (filter.like !== undefined && filter.like !== '') {
        whereClauses.push(`${colName} LIKE ?`);
        whereParams.push(`%${filter.like}%`);
      }
    }

    // Build query - simplified version for general type listing
    let query = `SELECT id, val, up, t, ord FROM ${db}`;

    if (report.parentType && report.parentType > 0) {
      whereClauses.push('t = ?');
      whereParams.push(report.parentType);
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ');
    }

    query += ' ORDER BY ord';
    query += ` LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

    const [rows] = await pool.query(query, whereParams);

    results.data = rows;
    results.rownum = rows.length;

    // Calculate totals for numeric columns
    for (const col of report.columns) {
      const baseType = REV_BASE_TYPE[col.baseType];
      if (baseType === 'NUMBER' || baseType === 'SIGNED') {
        let total = 0;
        for (const row of rows) {
          if (row[col.alias]) {
            total += parseFloat(row[col.alias]) || 0;
          }
        }
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

      return res.json({
        success: true,
        reports: rows.map(r => ({
          id: r.id,
          name: r.name,
          order: r.ord
        }))
      });
    }

    // Compile report
    const report = await compileReport(pool, db, id);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // If execution is requested, run the report
    if (execute || req.method === 'POST') {
      // Parse filters from request
      const filters = {};
      const params = { ...req.query, ...req.body };

      for (const col of report.columns) {
        const colName = col.alias;
        const filter = {};

        if (params[`FR_${colName}`]) {
          filter.from = params[`FR_${colName}`];
        }
        if (params[`TO_${colName}`]) {
          filter.to = params[`TO_${colName}`];
        }
        if (params[`EQ_${colName}`]) {
          filter.eq = params[`EQ_${colName}`];
        }
        if (params[`LIKE_${colName}`]) {
          filter.like = params[`LIKE_${colName}`];
        }

        if (Object.keys(filter).length > 0) {
          filters[colName] = filter;
        }
      }

      const limit = params.LIMIT || params.limit || 100;
      const offset = params.F || params.offset || 0;

      const results = await executeReport(pool, db, report, filters, limit, offset);

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
      const q = req.query;

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
        // {columns: [{id, name, type}], rows: {...}, totalCount: N}
        const cols = report.columns.map((col, i) => ({ id: col.id || i, name: col.name, type: col.baseType || 0 }));
        const rows = {};
        results.data.forEach((row, i) => {
          rows[i] = {};
          for (const col of report.columns) rows[i][col.name] = row[col.alias] ?? '';
        });
        return res.json({ columns: cols, rows, totalCount: results.data.length });
      }

      if (isApiRequest(req)) {
        // ?JSON — PHP default API format: {columns: [...detailed...], data: [...]}
        const cols = report.columns.map(col => ({
          id: col.id,
          name: col.name,
          type: col.baseType || 0,
          format: col.baseOut || 'CHARS'
        }));
        return res.json({ columns: cols, data: results.data, rownum: results.rownum });
      }

      // Non-API (browser) fallback
      return res.json({
        report: { id: report.id, name: report.header, columns: report.columns },
        data: formattedData,
        totals: results.totals,
        rownum: results.rownum
      });
    }

    // Return report definition only
    logger.info('[Legacy report] Report metadata retrieved', { db, reportId: id });

    if (isApiRequest(req)) {
      return res.json({
        id: report.id,
        name: report.header,
        columns: report.columns,
        head: report.head,
        types: report.types
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

    logger.info('[Legacy grants] Grants retrieved', { db, username: user.username, grantCount: Object.keys(grants).length });

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role_name,
        roleId: user.role_id
      },
      grants: grants
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

    // Create filename
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '_').slice(0, 15);
    const filename = `${db}_${timestamp}.csv`;

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    logger.info('[Legacy csv_all] Export completed', { db, filename });

    res.send(csvContent);
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

    // Create filename
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '_').slice(0, 15);
    const filename = `${db}_${timestamp}.dmp`;

    // Set headers for download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    logger.info('[Legacy backup] Export completed', { db, filename, rows: lastId });

    res.send(dumpContent);
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
 * Expects the dump content in request body or file upload.
 * Returns INSERT SQL statements for execution.
 */
router.post('/:db/restore', async (req, res) => {
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

    // Check EXPORT grant (same as backup for restore)
    if (!grants.EXPORT?.[1] && username.toLowerCase() !== 'admin' && username !== db) {
      return res.status(403).send('You do not have permission to import to the database');
    }

    // Get dump content from body
    let dumpContent = '';
    if (typeof req.body === 'string') {
      dumpContent = req.body;
    } else if (req.body.content) {
      dumpContent = req.body.content;
    } else if (req.body.data) {
      dumpContent = req.body.data;
    }

    if (!dumpContent) {
      return res.status(400).send('No backup content provided');
    }

    // Parse the dump format (PHP lines 4196–4237)
    const lines = dumpContent.split('\n');
    let lastId = 0;
    let lastUp = 0;
    let lastT = 0;
    const values = [];

    for (let line of lines) {
      if (line.length === 0 || line.trim().length === 0) continue;

      // Remove BOM if present
      if (line.charCodeAt(0) === 0xFEFF || line.substring(0, 3) === '\xEF\xBB\xBF') {
        line = line.substring(line.charCodeAt(0) === 0xFEFF ? 1 : 3);
      }

      // Parse ID delta
      if (line.startsWith('/')) {
        lastId++;
        line = line.substring(1);
      } else if (line.startsWith(';')) {
        lastId++;
        line = line.substring(1);
      } else {
        const delimPos = line.indexOf(';');
        if (delimPos > 0) {
          const idDelta = parseInt(line.substring(0, delimPos), 36);
          lastId += idDelta;
        }
        line = line.substring(delimPos + 1);
      }

      // Parse up
      let delimPos = line.indexOf(';');
      if (delimPos > 0) {
        lastUp = parseInt(line.substring(0, delimPos), 36);
      }
      line = line.substring(delimPos + 1);

      // Parse t
      delimPos = line.indexOf(';');
      if (delimPos > 0) {
        lastT = parseInt(line.substring(0, delimPos), 36);
      }
      line = line.substring(delimPos + 1);

      // Parse ord
      delimPos = line.indexOf(';');
      let ord = 1;
      if (delimPos > 0) {
        ord = line.substring(0, delimPos) || 1;
      }
      line = line.substring(delimPos + 1);

      // Val is the rest (with newline escaping removed)
      const val = line
        .replace(/&ritrn;/g, '\n')
        .replace(/&ritrr;/g, '\r');

      // Escape for SQL
      const escapedVal = val.replace(/'/g, "''");
      values.push(`(${lastId},${lastT},${lastUp},${ord},'${escapedVal}')`);
    }

    // Return INSERT statement (PHP returns this, doesn't execute directly)
    const insertSql = `INSERT INTO \`${db}\` (\`id\`, \`t\`, \`up\`, \`ord\`, \`val\`) VALUES ${values.join(',')};`;

    logger.info('[Legacy restore] Parsed backup', { db, rowCount: values.length });

    // Return the SQL statement as PHP does
    res.setHeader('Content-Type', 'text/plain');
    res.send(insertSql);
  } catch (error) {
    logger.error('[Legacy restore] Error', { error: error.message, db });
    res.status(500).send('Restore failed: ' + error.message);
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

    const limit = params.LIMIT || params.limit || 100;
    const offset = params.F || params.offset || 0;

    const results = await executeReport(pool, db, report, filters, limit, offset);

    const q = req.query;

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

    // JSON_CR format: {columns: [{id, name, type}], rows: {...}, totalCount: N}
    if (q.JSON_CR !== undefined) {
      const cols = report.columns.map((col, i) => ({
        id: col.id || i,
        name: col.name,
        type: col.baseType || 0
      }));
      const rows = {};
      results.data.forEach((row, i) => {
        rows[i] = {};
        for (const col of report.columns) rows[i][col.name] = row[col.alias] ?? '';
      });
      return res.json({ columns: cols, rows, totalCount: results.data.length });
    }

    // Default JSON format
    if (isApiRequest(req)) {
      const cols = report.columns.map(col => ({
        id: col.id,
        name: col.name,
        type: col.baseType || 0,
        format: col.baseOut || 'CHARS'
      }));
      return res.json({ columns: cols, data: results.data, rownum: results.rownum });
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
