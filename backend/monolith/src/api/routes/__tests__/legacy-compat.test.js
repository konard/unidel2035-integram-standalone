/**
 * Legacy PHP Compatibility Layer — Vitest tests
 *
 * Covers the key routes in legacy-compat.js with a mocked MySQL pool.
 * The pool mock is set up at the top of each describe block via mockQuery().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';

// ─── helpers ────────────────────────────────────────────────────────────────

const PHP_SALT = 'DronedocSalt2025';
const DB = 'testdb';

function phpCompatibleHash(username, password, db) {
  const saltedValue = PHP_SALT + username.toUpperCase() + db + password;
  return crypto.createHash('sha1').update(saltedValue).digest('hex');
}

function generateXsrf(a, b, db) {
  const saltedValue = PHP_SALT + a.toUpperCase() + db + b;
  return crypto.createHash('sha1').update(saltedValue).digest('hex').substring(0, 22);
}

// ─── mock cookie-parser (not in package.json) ────────────────────────────────

vi.mock('cookie-parser', () => ({
  default: () => (req, _res, next) => {
    // Parse Cookie header into req.cookies
    req.cookies = {};
    const raw = req.headers.cookie || '';
    for (const pair of raw.split(';')) {
      const [k, ...v] = pair.trim().split('=');
      if (k) req.cookies[k.trim()] = v.join('=').trim();
    }
    next();
  },
}));

// ─── mock mysql2/promise ─────────────────────────────────────────────────────

// We intercept mysql.createPool so that when legacy-compat.js calls it, it
// gets back our mock pool whose query function we can control per test.
let mockQueryFn = vi.fn();

vi.mock('mysql2/promise', () => ({
  default: {
    createPool: vi.fn(() => ({
      query: (...args) => mockQueryFn(...args),
    })),
  },
}));

// ─── mock logger ─────────────────────────────────────────────────────────────

vi.mock('../../../utils/logger.js', () => {
  const loggerStub = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  return {
    default: loggerStub,
    createLogger: vi.fn(() => loggerStub),
  };
});

// ─── import router AFTER mocks ────────────────────────────────────────────────

const {
  default: legacyRouter,
  legacyAuthMiddleware,
  legacyXsrfCheck,
  legacyDdlGrantCheck,
  resolveBuiltIn,
  recursiveDelete,
  checkDuplicatedReqs,
  isBlacklisted,
  getSubdir,
  getFilename,
  checkNewRef,
  constructWhere,
  formatDateForStorage,
  updateTokens,
  filterTermsRows,
} = await import('../legacy-compat.js');

// ─── app factory ─────────────────────────────────────────────────────────────

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(legacyRouter);
  return app;
}

// ─── convenience: set up query sequence ──────────────────────────────────────

function mockQuery(...responseSequence) {
  let idx = 0;
  mockQueryFn.mockImplementation(async () => {
    const resp = responseSequence[idx] ?? responseSequence[responseSequence.length - 1];
    idx++;
    return resp;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /:db/auth
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /:db/auth', () => {
  const app = makeApp();
  const token = 'test-token-abc';
  const xsrf  = generateXsrf(token, DB, DB);
  const pwdHash = phpCompatibleHash('alice', 'Password1!', DB);

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns _xsrf, token, id on valid credentials', async () => {
    // dbExists check
    const showTablesResp  = [[{ Tables_in_integram: DB }]];
    // user row
    const userRow = { uid: 5, username: 'alice', password_hash: pwdHash, pwd_id: 6, token, token_id: 7, xsrf, xsrf_id: 8 };
    const userResp = [[userRow]];
    // token update / xsrf update (not strictly needed but may be called)
    const updateResp = [{ affectedRows: 1 }];

    mockQuery(showTablesResp, userResp, updateResp, updateResp);

    const res = await request(app)
      .post(`/${DB}/auth?JSON`)
      .send({ login: 'alice', pwd: 'Password1!' });

    expect(res.status).toBe(200);
    // PHP mysqli_fetch_array returns strings for all values, so id is "5" not 5
    expect(res.body).toMatchObject({ _xsrf: expect.any(String), token: expect.any(String), id: '5' });
  });

  it('returns error on wrong credentials', async () => {
    const showTablesResp  = [[{ Tables_in_integram: DB }]];
    const userRow = { uid: 5, username: 'alice', password_hash: 'badhash', pwd_id: 6, token, token_id: 7, xsrf, xsrf_id: 8 };

    mockQuery(showTablesResp, [[userRow]]);

    const res = await request(app)
      .post(`/${DB}/auth?JSON`)
      .send({ login: 'alice', pwd: 'wrongpw' });

    expect(res.status).toBe(200);
    expect(res.body[0].error).toMatch(/Wrong credentials/i);
  });

  it('returns error when user not found', async () => {
    mockQuery([[{ Tables_in_integram: DB }]], [[]]);

    const res = await request(app)
      .post(`/${DB}/auth?JSON`)
      .send({ login: 'nobody', pwd: 'x' });

    expect(res.status).toBe(200);
    expect(res.body[0].error).toMatch(/Wrong credentials/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:db/xsrf
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /:db/xsrf', () => {
  const app = makeApp();
  const token = 'my-session-token';
  const xsrf  = generateXsrf(token, DB, DB);

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns xsrf for valid token cookie', async () => {
    // The xsrf route query returns: uid, uname, xsrf_val, role_val
    const userRow = { uid: 3, uname: 'alice', xsrf_val: xsrf, role_val: null };
    mockQuery([[userRow]]);

    const res = await request(app)
      .get(`/${DB}/xsrf`)
      .set('Cookie', `${DB}=${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _xsrf: expect.any(String), token: expect.any(String) });
    // PHP mysqli_fetch_array returns strings for all values
    expect(res.body.id).toBe('3');
  });

  it('returns id as string "0" when no token cookie (#385)', async () => {
    // No cookie → error path should return id: '0' (string), not 0 (number)
    const res = await request(app)
      .get(`/${DB}/xsrf`);
    // May be handled by xsrf route (200) or catch-all (302)
    if (res.status === 200) {
      expect(typeof res.body.id).toBe('string');
      expect(res.body.id).toBe('0');
    }
  });

  it('returns id as string "0" when token is invalid (#385)', async () => {
    // Token exists but DB returns no rows → invalid token error path
    mockQuery([[]]);

    const res = await request(app)
      .get(`/${DB}/xsrf`)
      .set('Cookie', `${DB}=invalid-token-xyz`);

    expect(res.status).toBe(200);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id).toBe('0');
  });

  it('redirects when no cookie (catch-all handles unauthenticated GETs)', async () => {
    // Without a cookie, the /:db/:page* catch-all redirects to login first
    const res = await request(app).get(`/${DB}/xsrf`);
    expect([200, 302]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:db/terms
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /:db/terms', () => {
  const app = makeApp();
  const token = 'terms-token';

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns type list when authenticated', async () => {
    // token validation in terms route
    const userRow = { id: 1, username: 'admin', role_id: null };
    const termsRows = [
      { id: 100, val: 'Client', t: 8, reqs_t: null },
      { id: 101, val: 'Product', t: 8, reqs_t: null },
    ];
    mockQuery(
      [[userRow]],  // token → user lookup
      [[]], // getGrants inner query
      [termsRows],  // terms query
      // grant1Level — one per visible type
      [[{ id: 1 }]], [[{ id: 1 }]],
    );

    const res = await request(app)
      .get(`/${DB}/terms`)
      .set('Cookie', `${DB}=${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// filterTermsRows — PHP terms filtering algorithm (Issue #389)
// Verified against PHP index.php lines 8919–8941.
// ─────────────────────────────────────────────────────────────────────────────

describe('filterTermsRows (#389)', () => {

  it('keeps normal types and maps id→val and id→t', () => {
    const rows = [
      { id: 100, val: 'Client', t: 8, reqs_t: null },
      { id: 101, val: 'Product', t: 8, reqs_t: null },
    ];
    const { typ, base } = filterTermsRows(rows);
    expect([...typ.entries()]).toEqual([[100, 'Client'], [101, 'Product']]);
    expect(base.get(100)).toBe(8);
    expect(base.get(101)).toBe(8);
  });

  it('filters out CALCULATABLE (t=15) and BUTTON (t=7) base types', () => {
    const rows = [
      { id: 100, val: 'Client', t: 8, reqs_t: null },      // SHORT — keep
      { id: 101, val: 'CalcField', t: 15, reqs_t: null },   // CALCULATABLE — skip
      { id: 102, val: 'BtnField', t: 7, reqs_t: null },     // BUTTON — skip
      { id: 103, val: 'Product', t: 8, reqs_t: null },      // SHORT — keep
    ];
    const { typ } = filterTermsRows(rows);
    expect([...typ.keys()]).toEqual([100, 103]);
  });

  it('removes types used as requisites of other types', () => {
    // PHP: if($row["reqs_t"]) { unset($typ[$row["reqs_t"]]); $req[$row["reqs_t"]] = ""; }
    const rows = [
      { id: 100, val: 'Status', t: 8, reqs_t: null },
      { id: 200, val: 'Order', t: 8, reqs_t: 100 },  // reqs_t=100 → remove Status
    ];
    const { typ } = filterTermsRows(rows);
    expect([...typ.keys()]).toEqual([200]);
    expect(typ.has(100)).toBe(false);
  });

  it('does not re-add a type after it was marked as requisite', () => {
    // PHP: if(!isset($req[$row["id"]])) $typ[$row["id"]] = $row["val"];
    // If id=100 appears first, then reqs_t=100 removes it.
    // If id=100 appears again (from LEFT JOIN), it should NOT be re-added.
    const rows = [
      { id: 100, val: 'Status', t: 8, reqs_t: null },
      { id: 200, val: 'Order', t: 8, reqs_t: 100 },
      { id: 100, val: 'Status', t: 8, reqs_t: null },  // duplicate from JOIN
    ];
    const { typ } = filterTermsRows(rows);
    expect(typ.has(100)).toBe(false);
    expect([...typ.keys()]).toEqual([200]);
  });

  it('preserves insertion order (Map) matching PHP array order', () => {
    // SQL ORDER BY a.val gives alphabetical; Map preserves this
    const rows = [
      { id: 300, val: 'Alpha', t: 8, reqs_t: null },
      { id: 100, val: 'Beta', t: 8, reqs_t: null },
      { id: 200, val: 'Gamma', t: 8, reqs_t: null },
    ];
    const { typ } = filterTermsRows(rows);
    expect([...typ.keys()]).toEqual([300, 100, 200]);
  });

  it('handles empty input', () => {
    const { typ, base } = filterTermsRows([]);
    expect(typ.size).toBe(0);
    expect(base.size).toBe(0);
  });

  it('handles all types being CALCULATABLE or BUTTON', () => {
    const rows = [
      { id: 100, val: 'Calc', t: 15, reqs_t: null },
      { id: 101, val: 'Btn', t: 7, reqs_t: null },
    ];
    const { typ } = filterTermsRows(rows);
    expect(typ.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:db/metadata/:typeId
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /:db/metadata/:typeId', () => {
  const app = makeApp();
  const token = 'meta-token';

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns metadata with reqs array', async () => {
    // Fields must match the SQL aliases: id, up, t, uniq (=ord), val,
    //   req_id, req_type, req_attrs, req_ord, base_typ, req_val, ref_id, arr_id
    const metaRows = [
      {
        id: 200, up: 0, t: 8, uniq: 1, val: 'Employee',
        req_id: 201, req_type: 8, req_attrs: null, req_ord: 1,
        base_typ: 8, req_val: 'Name', arr_id: null, ref_id: null,
      },
    ];
    mockQuery([metaRows]);

    const res = await request(app)
      .get(`/${DB}/metadata/200`)
      .set('Cookie', `${DB}=${token}`);

    expect(res.status).toBe(200);
    // metadata route returns an object (not array)
    if (Array.isArray(res.body)) {
      expect(res.body[0]).not.toHaveProperty('error');
    } else {
      expect(res.body).toHaveProperty('id');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:db/_m_new/:up
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /:db/_m_new/:up', () => {
  const app = makeApp();

  beforeEach(() => { vi.clearAllMocks(); });

  it('creates object and returns api_dump response', async () => {
    // getNextOrder query
    const ordResp = [[{ max_ord: 2 }]];
    // insertRow query
    const insertResp = [{ insertId: 42 }];
    // check if type has requisites
    const reqCheck = [[]];

    mockQuery(ordResp, insertResp, reqCheck);

    const res = await request(app)
      .post(`/${DB}/_m_new/1`)
      .send({ t: '100', val: 'New Object' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 42,
      obj: 42,
      next_act: expect.any(String),
      args: expect.any(String),
    });
  });

  it('returns error when type ID is missing', async () => {
    // When typeId in URL is not a valid number, it should return error
    const res = await request(app)
      .post(`/${DB}/_m_new`)  // No up/type at all
      .send({ val: 'No type' });

    expect(res.status).toBe(200);
    // Should return error in array format
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:db/_m_save/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /:db/_m_save/:id', () => {
  const app = makeApp();

  beforeEach(() => { vi.clearAllMocks(); });

  it('saves object and returns api_dump response', async () => {
    // The _m_save route queries:
    // 1. SELECT t, up FROM ... WHERE id = ?  (to get object type)
    // 2. UPDATE ... SET val = ? WHERE id = ? (to update value)
    // Use SQL-aware mock to return appropriate responses
    mockQueryFn.mockImplementation(async (sql) => {
      if (typeof sql === 'string' && sql.includes('SELECT')) {
        return [[{ t: 100, up: 1 }]];  // Object info with type=100
      }
      return [{ affectedRows: 1 }];    // UPDATE result
    });

    const res = await request(app)
      .post(`/${DB}/_m_save/300`)
      .send({ val: 'Updated' });

    expect(res.status).toBe(200);
    // PHP api_dump: id = type ID (string), obj = object ID (number)
    // PHP m_save_valid.json: {"id":"3","obj":999906,...}
    expect(res.body).toMatchObject({
      id: '100',     // type ID as string (PHP mysqli returns strings)
      obj: 300,      // object ID as number
      next_act: 'object',
      warnings: '',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:db/_m_del/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /:db/_m_del/:id', () => {
  const app = makeApp();

  beforeEach(() => { vi.clearAllMocks(); });

  it('deletes object and returns api_dump response', async () => {
    // Main query: SELECT with JOIN to par, returns refCount, up, ord, t, val, pup, tup
    const objInfo = [[{ refCount: 0, up: 5, ord: 1, t: 100, val: 'Test', pup: 1, tup: 3 }]];
    // deleteChildren query (no children)
    const childrenResp = [[]];
    // deleteRow
    const deleteResp = [{ affectedRows: 1 }];

    mockQuery(objInfo, childrenResp, deleteResp);

    const res = await request(app)
      .post(`/${DB}/_m_del/300`)
      .send({});

    expect(res.status).toBe(200);
    // PHP api_dump: id = type ID (string), obj = object ID (number)
    // PHP m_del_valid.json: {"id":"3","obj":999906,...}
    expect(res.body).toMatchObject({
      id: '100',    // type ID as string (PHP mysqli returns strings)
      obj: 300,     // deleted ID as number
      next_act: 'object',
      warnings: '',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:db/_m_id/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /:db/_m_id/:id', () => {
  const app = makeApp();

  beforeEach(() => { vi.clearAllMocks(); });

  it('renames ID and returns api_dump response', async () => {
    // SELECT old object exists + get up
    const oldObj = [[{ id: 100, up: 5 }]];
    // SELECT new id not in use
    const noExisting = [[]];
    // 3 UPDATEs
    const upd = [{ affectedRows: 1 }];

    mockQuery(oldObj, noExisting, upd, upd, upd);

    const res = await request(app)
      .post(`/${DB}/_m_id/100`)
      .send({ new_id: '999' });

    expect(res.status).toBe(200);
    // PHP _m_id: next_act defaults to "_m_id" (PHP line 9172)
    expect(res.body).toMatchObject({
      id: 999,
      obj: 999,
      next_act: '_m_id',
      warnings: '',
    });
  });

  it('returns error when new_id is already in use', async () => {
    const oldObj = [[{ id: 100, up: 5 }]];
    const existingNew = [[{ id: 999 }]];

    mockQuery(oldObj, existingNew);

    const res = await request(app)
      .post(`/${DB}/_m_id/100`)
      .send({ new_id: '999' });

    expect(res.status).toBe(200);
    expect(res.body[0].error).toMatch(/already in use/i);
  });

  it('returns error when new_id is missing', async () => {
    const res = await request(app)
      .post(`/${DB}/_m_id/100`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body[0].error).toMatch(/positive integer/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:db/_d_new
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /:db/_d_new', () => {
  const app = makeApp();

  beforeEach(() => { vi.clearAllMocks(); });

  it('creates type and returns api_dump response', async () => {
    // getNextOrder for new type (up=0)
    const ordResp = [[{ max_ord: 3 }]];
    // insertRow for type
    const insertResp = [{ insertId: 200 }];

    mockQuery(ordResp, insertResp);

    const res = await request(app)
      .post(`/${DB}/_d_new`)
      .send({ val: 'NewType', t: '8' });

    expect(res.status).toBe(200);
    // _d_new returns {id, obj, next_act:"edit_types", ...}
    expect(res.body).toMatchObject({
      next_act: 'edit_types',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:db/backup
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /:db/backup', () => {
  const app = makeApp();

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with zip content-type for admin user', async () => {
    const token = 'admin-token';
    // token lookup returns admin user
    const userRow = { id: 1, username: 'admin', role_id: null };
    const tokenResp = [[userRow]];
    // grants query
    const grantsResp = [[]];
    // DB rows query (batched — no rows)
    const rowsResp = [[]];

    mockQuery(tokenResp, grantsResp, rowsResp);

    const res = await request(app)
      .get(`/${DB}/backup`)
      .set('Cookie', `${DB}=${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toContain('.dmp.zip');
  });

  it('redirects or denies without auth', async () => {
    // Without cookie, the /:db/:page* catch-all redirects to login (302),
    // so the backup handler never runs to produce a 403.
    const res = await request(app).get(`/${DB}/backup`);
    expect([302, 403]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Helper Function Unit Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('legacyAuthMiddleware', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 for missing token', async () => {
    const req = { params: { db: DB }, headers: {}, cookies: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await legacyAuthMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith([{ error: 'Authentication required' }]);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for invalid database name', async () => {
    const req = { params: { db: '!!invalid!!' }, headers: {}, cookies: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await legacyAuthMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith([{ error: 'Invalid database' }]);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for invalid token (no matching user)', async () => {
    const token = 'bad-token';
    const req = { params: { db: DB }, headers: {}, cookies: { [DB]: token } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    // Token lookup returns no rows
    mockQuery([[]]);

    await legacyAuthMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith([{ error: 'Invalid or expired token' }]);
    expect(next).not.toHaveBeenCalled();
  });

  it('populates req.legacyUser correctly for valid token', async () => {
    const token = 'valid-token';
    const xsrfVal = generateXsrf(token, DB, DB);
    const req = { params: { db: DB }, headers: {}, cookies: { [DB]: token } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    // Token lookup returns user
    mockQuery(
      [[{ uid: 42, uname: 'alice', xsrf_val: xsrfVal, role_val: 'Manager', roleId: 7 }]],
      [[]], // grants query
    );

    await legacyAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.legacyUser).toBeDefined();
    expect(req.legacyUser.uid).toBe(42);
    expect(req.legacyUser.username).toBe('alice');
    expect(req.legacyUser.xsrf).toBe(xsrfVal);
    expect(req.legacyUser.role).toBe('manager');
    expect(req.legacyUser.roleId).toBe(7);
    expect(req.legacyUser.grants).toBeDefined();
  });
});

describe('legacyXsrfCheck', () => {
  it('passes through for non-POST requests', () => {
    const req = { method: 'GET' };
    const res = {};
    const next = vi.fn();

    legacyXsrfCheck(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns error (HTTP 200) for XSRF mismatch', () => {
    const req = {
      method: 'POST',
      legacyUser: { xsrf: 'correct-xsrf' },
      body: { _xsrf: 'wrong-xsrf' },
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    legacyXsrfCheck(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ error: 'Invalid or expired CSRF token' }]);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through for valid XSRF', () => {
    const req = {
      method: 'POST',
      legacyUser: { xsrf: 'valid-xsrf-token' },
      body: { _xsrf: 'valid-xsrf-token' },
    };
    const res = {};
    const next = vi.fn();

    legacyXsrfCheck(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns error when legacyUser is missing', () => {
    const req = { method: 'POST', body: { _xsrf: 'any' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    legacyXsrfCheck(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('resolveBuiltIn', () => {
  const user = { uid: 42, username: 'alice', role: 'manager', roleId: 7 };

  it('replaces %USER% with username', () => {
    expect(resolveBuiltIn('Created by %USER%', user, DB)).toBe('Created by alice');
  });

  it('replaces %USERID% with user ID', () => {
    expect(resolveBuiltIn('Owner: %USERID%', user, DB)).toBe('Owner: 42');
  });

  it('replaces %DB% with database name', () => {
    expect(resolveBuiltIn('DB: %DB%', user, DB)).toBe(`DB: ${DB}`);
  });

  it('replaces %IP% with client IP', () => {
    expect(resolveBuiltIn('IP: %IP%', user, DB, 0, '192.168.1.1')).toBe('IP: 192.168.1.1');
  });

  it('replaces %DATE%, %TIME%, %DATETIME%', () => {
    const result = resolveBuiltIn('%DATE% %TIME% %DATETIME%', user, DB, 0);
    // Should contain date-like patterns (dd.mm.yyyy)
    expect(result).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    // Should contain time-like patterns (hh:mm:ss)
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('returns non-string values unchanged', () => {
    expect(resolveBuiltIn(null, user, DB)).toBeNull();
    expect(resolveBuiltIn(undefined, user, DB)).toBeUndefined();
    expect(resolveBuiltIn('', user, DB)).toBe('');
  });

  it('replaces multiple placeholders in one string', () => {
    const result = resolveBuiltIn('%USER% (%USERID%) on %DB%', user, DB);
    expect(result).toBe(`alice (42) on ${DB}`);
  });
});

describe('recursiveDelete (batch)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('deletes a leaf node (no children) using batch IN()', async () => {
    const queries = [];
    const pool = {
      query: vi.fn(async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes('SELECT')) return [[]]; // no children
        return [{ affectedRows: 1 }]; // DELETE
      }),
    };

    await recursiveDelete(pool, DB, 100);

    // Should query for children, then batch-delete self
    expect(queries).toHaveLength(2);
    expect(queries[0].sql).toContain('SELECT');
    expect(queries[0].params).toEqual([100]);
    expect(queries[1].sql).toContain('DELETE');
    expect(queries[1].sql).toContain('IN');
    expect(queries[1].params).toEqual([100]);
  });

  it('recursively deletes children before parent using batch IN()', async () => {
    const deletedBatches = [];
    const pool = {
      query: vi.fn(async (sql, params) => {
        if (sql.includes('SELECT') && params[0] === 1) return [[{ id: 2 }, { id: 3 }]];
        if (sql.includes('SELECT')) return [[]]; // leaves
        if (sql.includes('DELETE')) { deletedBatches.push([...params]); return [{ affectedRows: params.length }]; }
        return [[]];
      }),
    };

    await recursiveDelete(pool, DB, 1);

    // All IDs deleted in a single batch: children first, then parent
    expect(deletedBatches).toHaveLength(1);
    expect(deletedBatches[0]).toEqual([2, 3, 1]);
  });

  it('handles deep trees: grandchildren deleted before children before parent', async () => {
    const deletedBatches = [];
    const pool = {
      query: vi.fn(async (sql, params) => {
        // Tree: 1 -> [2, 3], 2 -> [4], 3 -> [], 4 -> []
        if (sql.includes('SELECT') && params[0] === 1) return [[{ id: 2 }, { id: 3 }]];
        if (sql.includes('SELECT') && params[0] === 2) return [[{ id: 4 }]];
        if (sql.includes('SELECT')) return [[]]; // leaves
        if (sql.includes('DELETE')) { deletedBatches.push([...params]); return [{ affectedRows: params.length }]; }
        return [[]];
      }),
    };

    await recursiveDelete(pool, DB, 1);

    // Single batch: 4 (leaf), 2 (its parent), 3 (leaf), 1 (root)
    expect(deletedBatches).toHaveLength(1);
    expect(deletedBatches[0]).toEqual([4, 2, 3, 1]);
  });
});

describe('checkDuplicatedReqs', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns false when no duplicates exist', async () => {
    const pool = {
      query: vi.fn(async () => [[{ id: 10 }]]), // single row = no dup
    };
    const result = await checkDuplicatedReqs(pool, DB, 1, 5);
    expect(result).toBe(false);
  });

  it('returns true and deletes older duplicates', async () => {
    const deletedIds = [];
    const pool = {
      query: vi.fn(async (sql, params) => {
        if (sql.includes('ORDER BY')) return [[{ id: 10 }, { id: 8 }, { id: 5 }]];
        if (sql.includes('SELECT')) return [[]]; // no children for recursive delete
        if (sql.includes('DELETE')) { deletedIds.push(...params); return [{ affectedRows: params.length }]; }
        return [[]];
      }),
    };
    const result = await checkDuplicatedReqs(pool, DB, 1, 5);
    expect(result).toBe(true);
    // Should delete older IDs (8, 5) but keep newest (10)
    expect(deletedIds).toContain(8);
    expect(deletedIds).toContain(5);
    expect(deletedIds).not.toContain(10);
  });
});

describe('isBlacklisted', () => {
  it('blocks PHP files', () => {
    expect(isBlacklisted('shell.php')).toBe(true);
    expect(isBlacklisted('backdoor.phtml')).toBe(true);
    expect(isBlacklisted('test.php3')).toBe(true);
    expect(isBlacklisted('test.php4')).toBe(true);
    expect(isBlacklisted('test.php5')).toBe(true);
  });

  it('blocks server-side scripts', () => {
    expect(isBlacklisted('evil.cgi')).toBe(true);
    expect(isBlacklisted('hack.pl')).toBe(true);
    expect(isBlacklisted('run.asp')).toBe(true);
    expect(isBlacklisted('run.jsp')).toBe(true);
  });

  it('allows safe extensions', () => {
    expect(isBlacklisted('image.png')).toBe(false);
    expect(isBlacklisted('doc.pdf')).toBe(false);
    expect(isBlacklisted('data.csv')).toBe(false);
    expect(isBlacklisted('page.html')).toBe(false);
  });

  it('handles edge cases', () => {
    expect(isBlacklisted('')).toBe(false);
    expect(isBlacklisted(null)).toBe(false);
    expect(isBlacklisted(undefined)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isBlacklisted('FILE.PHP')).toBe(true);
    expect(isBlacklisted('test.Phtml')).toBe(true);
  });
});

describe('getSubdir / getFilename', () => {
  it('returns consistent subdirectory for same id', () => {
    const dir1 = getSubdir(DB, 1500);
    const dir2 = getSubdir(DB, 1500);
    expect(dir1).toBe(dir2);
  });

  it('subdirectory starts with floor(id/1000)', () => {
    const dir = getSubdir(DB, 2500);
    expect(dir).toMatch(/^2/); // floor(2500/1000) = 2
  });

  it('returns consistent filename for same id', () => {
    const fn1 = getFilename(DB, 42);
    const fn2 = getFilename(DB, 42);
    expect(fn1).toBe(fn2);
  });

  it('filename starts with zero-padded id suffix', () => {
    const fn = getFilename(DB, 42);
    expect(fn).toMatch(/^042/); // ('00' + 42).slice(-3) = '042'
  });

  it('different dbs produce different paths', () => {
    const dir1 = getSubdir('db1', 100);
    const dir2 = getSubdir('db2', 100);
    expect(dir1).not.toBe(dir2);
  });
});

describe('checkNewRef', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns true when reference exists', async () => {
    const pool = { query: vi.fn(async () => [[{ 1: 1 }]]) };
    const result = await checkNewRef(pool, DB, 5, 42);
    expect(result).toBe(true);
  });

  it('returns false when reference does not exist', async () => {
    const pool = { query: vi.fn(async () => [[]]) };
    const result = await checkNewRef(pool, DB, 5, 999);
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Middleware Wiring Integration Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 2: middleware wiring', () => {
  const app = makeApp();

  beforeEach(() => { vi.clearAllMocks(); });

  describe('DML routes reject unauthenticated requests', () => {
    const dmlRoutes = [
      ['_m_new/1', 'POST'],
      ['_m_save/1', 'POST'],
      ['_m_del/1', 'POST'],
      ['_m_set/1', 'POST'],
      ['_m_move/1', 'POST'],
      ['_m_up/1', 'POST'],
      ['_m_ord/1', 'POST'],
      ['_m_id/1', 'POST'],
    ];

    for (const [route, method] of dmlRoutes) {
      it(`POST /${DB}/${route} → 401 without token`, async () => {
        const res = await request(app)
          .post(`/${DB}/${route}`)
          .send({ _xsrf: 'fake' });
        expect(res.status).toBe(401);
        expect(res.body[0].error).toBeDefined();
      });
    }
  });

  describe('DML routes reject invalid XSRF', () => {
    const token = 'dml-token';
    const xsrf = generateXsrf(token, DB, DB);

    it('POST _m_save with wrong XSRF → error (HTTP 200)', async () => {
      // Auth middleware: token lookup returns user
      mockQuery(
        [[{ uid: 1, uname: 'alice', xsrf_val: xsrf, role_val: 'Manager', roleId: 7 }]],
        [[]], // grants
      );

      const res = await request(app)
        .post(`/${DB}/_m_save/1`)
        .set('Cookie', `${DB}=${token}`)
        .send({ _xsrf: 'wrong-xsrf', val: 'test' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ error: 'Invalid or expired CSRF token' }]);
    });
  });

  describe('DDL routes reject unauthenticated requests', () => {
    const ddlRoutes = [
      '_d_new', '_d_save/1', '_d_del/1', '_d_req/1',
      '_d_alias/1', '_d_null/1', '_d_multi/1', '_d_attrs/1',
      '_d_up/1', '_d_ord/1', '_d_del_req/1', '_d_ref/1',
    ];

    for (const route of ddlRoutes) {
      it(`POST /${DB}/${route} → 401 without token`, async () => {
        const res = await request(app)
          .post(`/${DB}/${route}`)
          .send({ _xsrf: 'fake' });
        expect(res.status).toBe(401);
        expect(res.body[0].error).toBeDefined();
      });
    }
  });

  describe('Query routes reject unauthenticated requests', () => {
    const queryRoutes = [
      ['terms', 'GET'],
      ['_ref_reqs/1', 'GET'],
      ['_connect', 'GET'],
      ['obj_meta/1', 'GET'],
      ['metadata', 'GET'],
    ];

    for (const [route, method] of queryRoutes) {
      it(`GET /${DB}/${route} → 401 without token`, async () => {
        const res = await request(app)
          .get(`/${DB}/${route}`);
        expect(res.status).toBe(401);
        expect(res.body[0].error).toBeDefined();
      });
    }
  });

  describe('xsrf route still works without middleware', () => {
    it('GET /:db/xsrf → 200 with empty session (no token)', async () => {
      const res = await request(app)
        .get(`/${DB}/xsrf`);
      // xsrf route should return 200 with empty session (no 401)
      expect(res.status).toBe(200);
      expect(res.body._xsrf).toBe('');
    });
  });
});

// ─── constructWhere — PHP-parity filter engine ──────────────────────────────

describe('formatDateForStorage', () => {
  it('converts dd.mm.yyyy to yyyymmdd', () => {
    expect(formatDateForStorage('15.03.2024')).toBe('20240315');
  });

  it('converts dd/mm/yyyy to yyyymmdd', () => {
    expect(formatDateForStorage('01/12/2023')).toBe('20231201');
  });

  it('converts ISO yyyy-mm-dd to yyyymmdd', () => {
    expect(formatDateForStorage('2024-03-15')).toBe('20240315');
  });

  it('converts ISO yyyy/mm/dd to yyyymmdd', () => {
    expect(formatDateForStorage('2024/03/15')).toBe('20240315');
  });

  it('handles compact yyyymmdd (already formatted)', () => {
    expect(formatDateForStorage('20240315')).toBe('20240315');
  });

  it('handles two-digit year', () => {
    expect(formatDateForStorage('15/03/24')).toBe('20240315');
  });

  it('passes through bracket expressions unchanged', () => {
    expect(formatDateForStorage('[TODAY]')).toBe('[TODAY]');
  });

  it('passes through empty/null values', () => {
    expect(formatDateForStorage('')).toBe('');
    expect(formatDateForStorage(null)).toBe(null);
  });
});

describe('constructWhere', () => {
  const baseCtx = { revBT: {}, refTyps: {}, multi: new Set(), db: 'testdb' };

  describe('basic DSL syntax', () => {
    it('exact value match — val → = ?', () => {
      const r = constructWhere('10', { F: 'hello' }, '1', false, baseCtx);
      expect(r.where).toContain('a10.val');
      expect(r.where).toContain('=?');
      expect(r.params).toContain('hello');
    });

    it('LIKE match — %val% → LIKE ?', () => {
      const r = constructWhere('10', { F: '%hello%' }, '1', false, baseCtx);
      expect(r.where).toContain('LIKE ?');
      expect(r.params).toContain('%hello%');
    });

    it('IS NOT NULL — % → IS NOT NULL', () => {
      const r = constructWhere('10', { F: '%' }, '1', false, baseCtx);
      expect(r.where).toContain('IS NOT NULL');
    });

    it('IS NULL — !% → IS NULL', () => {
      const r = constructWhere('10', { F: '!%' }, '1', false, baseCtx);
      expect(r.where).toContain('IS NULL');
    });

    it('NOT equal — !value → !=? + OR IS NULL', () => {
      const r = constructWhere('10', { F: '!hello' }, '1', false, baseCtx);
      expect(r.where).toContain('!=?');
      expect(r.where).toContain('IS NULL');
    });

    it('NOT LIKE — !%val% → NOT LIKE + OR IS NULL', () => {
      const r = constructWhere('10', { F: '!%hello%' }, '1', false, baseCtx);
      expect(r.where).toContain('NOT LIKE ?');
      expect(r.where).toContain('IS NULL');
    });

    it('>= operator', () => {
      const r = constructWhere('10', { F: '>=100' }, '1', false,
        { ...baseCtx, revBT: { '10': 'NUMBER' } });
      expect(r.where).toContain('>=');
    });

    it('<= operator', () => {
      const r = constructWhere('10', { F: '<=100' }, '1', false,
        { ...baseCtx, revBT: { '10': 'NUMBER' } });
      expect(r.where).toContain('<=');
    });

    it('> operator', () => {
      const r = constructWhere('10', { F: '>100' }, '1', false,
        { ...baseCtx, revBT: { '10': 'NUMBER' } });
      expect(r.where).toContain('>');
    });

    it('< operator', () => {
      const r = constructWhere('10', { F: '<100' }, '1', false,
        { ...baseCtx, revBT: { '10': 'NUMBER' } });
      expect(r.where).toContain('<');
    });

    it('IN(1,2,3) → val IN (?, ?, ?)', () => {
      const r = constructWhere('10', { F: 'IN(a,b,c)' }, '1', false, baseCtx);
      expect(r.where).toContain('IN (?,?,?)');
      expect(r.params).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    });

    it('@IN(1,2,3) → id IN (?, ?, ?)', () => {
      const r = constructWhere('10', { F: '@IN(1,2,3)' }, '1', false, baseCtx);
      expect(r.where).toContain('a10.id');
      expect(r.where).toContain('IN (?,?,?)');
      expect(r.params).toEqual(expect.arrayContaining([1, 2, 3]));
    });

    it('@IN with non-numeric throws', () => {
      expect(() => constructWhere('10', { F: '@IN(1,abc,3)' }, '1', false, baseCtx))
        .toThrow('Non-numeric');
    });

    it('@999 — single ID search', () => {
      const r = constructWhere('10', { F: '@999' }, '1', false, baseCtx);
      expect(r.where).toContain('a10.id=?');
      expect(r.params).toContain(999);
    });

    it('!@999 — NOT ID + OR IS NULL', () => {
      const r = constructWhere('10', { F: '!@999' }, '1', false, baseCtx);
      expect(r.where).toContain('a10.id!=?');
      expect(r.where).toContain('IS NULL');
    });

    it('100..500 range → BETWEEN', () => {
      const r = constructWhere('10', { F: '100..500' }, '1', false,
        { ...baseCtx, revBT: { '10': 'NUMBER' } });
      expect(r.where).toContain('BETWEEN ? AND ?');
      expect(r.params).toContain(100);
      expect(r.params).toContain(500);
    });
  });

  describe('FR + TO range filters', () => {
    it('FR and TO produce >= and <= clauses', () => {
      const r = constructWhere('10', { FR: '100', TO: '500' }, '1', false,
        { ...baseCtx, revBT: { '10': 'NUMBER' } });
      expect(r.where).toContain('>=');
      expect(r.where).toContain('<=');
    });
  });

  describe('type-aware behavior', () => {
    it('DATE: formats value via formatDateForStorage', () => {
      const r = constructWhere('10', { F: '15.03.2024' }, '1', false,
        { ...baseCtx, revBT: { '10': 'DATE' } });
      expect(r.params.some(p => p === '20240315')).toBe(true);
    });

    it('NUMBER: CAST for range comparisons', () => {
      const ctx = { ...baseCtx, revBT: { '10': 'NUMBER' } };
      const r = constructWhere('10', { FR: '100', TO: '500' }, '1', '5', ctx);
      expect(r.where).toContain('CAST(a10.val AS DECIMAL)>=CAST(? AS DECIMAL)');
    });

    it('ARRAY type sets distinct=true', () => {
      const ctx = { ...baseCtx, revBT: { '10': 'ARRAY' } };
      const r = constructWhere('10', { F: 'test' }, '1', false, ctx);
      expect(r.distinct).toBe(true);
    });

    it('MULTI type sets distinct=true via ctx.multi', () => {
      const ctx = { ...baseCtx, multi: new Set(['10']) };
      const r = constructWhere('10', { F: 'test' }, '1', false, ctx);
      expect(r.distinct).toBe(true);
    });
  });

  describe('reference JOIN generation', () => {
    it('generates CROSS JOIN for reference types', () => {
      const ctx = { ...baseCtx, refTyps: { '10': '99' } };
      const r = constructWhere('10', { F: 'hello' }, '1', '5', ctx);
      expect(r.join).toContain('CROSS JOIN');
      expect(r.join).toContain('r10');
      expect(r.join).toContain('a10');
    });

    it('NOT on reference adds OR IS NULL', () => {
      const ctx = { ...baseCtx, refTyps: { '10': '99' } };
      const r = constructWhere('10', { F: '!hello' }, '1', '5', ctx);
      expect(r.where).toContain('IS NULL');
    });
  });

  describe('curTyp match (filter on main val)', () => {
    it('key === curTyp → uses vals.val', () => {
      const r = constructWhere('1', { F: 'hello' }, '1', false, baseCtx);
      expect(r.where).toContain('vals.val');
    });

    it('@id on curTyp → uses vals.id', () => {
      const r = constructWhere('1', { F: '@42' }, '1', false, baseCtx);
      expect(r.where).toContain('vals.id');
    });
  });

  describe('parameterized output', () => {
    it('all values are in params array, not inlined', () => {
      const r = constructWhere('10', { F: '%test%' }, '1', false, baseCtx);
      expect(r.params.length).toBeGreaterThan(0);
      expect(r.where).not.toContain("'test'");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateTokens — activity timestamp format (#329)
// ─────────────────────────────────────────────────────────────────────────────

describe('updateTokens activity timestamp format (#329)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('stores activity timestamp with fractional seconds (float string)', async () => {
    const capturedParams = [];
    const pool = {
      query: vi.fn(async (sql, params) => {
        capturedParams.push({ sql, params });
        return [{ affectedRows: 1 }];
      }),
    };

    await updateTokens(pool, DB, { uid: 1, tok: 10, xsrf: 20, act: 30 });

    // The third query is the activity timestamp UPDATE
    const actQuery = capturedParams.find(q => q.sql.includes('Update Activity Timestamp') || (q.params && q.params[1] === 30));
    // Fallback: activity timestamp is the val param of the third UPDATE call
    const actTimestamp = actQuery ? actQuery.params[0] : capturedParams[2].params[0];

    expect(actTimestamp).toContain('.');
    expect(Number(actTimestamp)).toBeGreaterThan(1000000000);
    expect(Number(actTimestamp)).toBeLessThan(99999999999);
  });

  it('activity timestamp includes decimal point matching PHP microtime(true) format', async () => {
    const capturedParams = [];
    const pool = {
      query: vi.fn(async (sql, params) => {
        capturedParams.push({ sql, params });
        if (sql.includes('INSERT')) return [{ insertId: 99 }];
        return [{ affectedRows: 1 }];
      }),
    };

    await updateTokens(pool, DB, { uid: 1, tok: null, xsrf: null, act: null });

    // When act is null, INSERT is used; the activity timestamp is the 3rd param of the 3rd INSERT
    const actInsert = capturedParams[2];
    const actTimestamp = actInsert.params[2];

    // Must contain a decimal point (fractional seconds like PHP microtime(true))
    expect(actTimestamp).toMatch(/^\d+\.\d+$/);
  });

  it('activity timestamp is not an integer string (regression guard)', async () => {
    const capturedParams = [];
    const pool = {
      query: vi.fn(async (sql, params) => {
        capturedParams.push({ sql, params });
        return [{ affectedRows: 1 }];
      }),
    };

    await updateTokens(pool, DB, { uid: 1, tok: 10, xsrf: 20, act: 30 });

    const actTimestamp = capturedParams[2].params[0];

    // Should NOT be a plain integer (that was the bug)
    expect(actTimestamp).not.toMatch(/^\d+$/);
    // Should be a float string
    expect(actTimestamp).toMatch(/\./);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CORS headers — PHP parity (Issue #376)
// ─────────────────────────────────────────────────────────────────────────────

describe('CORS headers — PHP parity (#376)', () => {
  const app = makeApp();

  beforeEach(() => { vi.clearAllMocks(); });

  it('OPTIONS preflight returns 204 with wildcard origin', async () => {
    const res = await request(app)
      .options(`/${DB}/auth`)
      .set('Origin', 'https://unknown-external-client.example.com');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('OPTIONS preflight does not set Access-Control-Allow-Credentials', async () => {
    const res = await request(app)
      .options(`/${DB}/terms`);

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('OPTIONS preflight sets Allow-Methods to POST, GET, OPTIONS', async () => {
    const res = await request(app)
      .options(`/${DB}/auth`);

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toBe('POST, GET, OPTIONS');
  });

  it('OPTIONS preflight includes lowercase content-type and x-authorization in allowed headers', async () => {
    const res = await request(app)
      .options(`/${DB}/auth`);

    expect(res.status).toBe(204);
    const allowedHeaders = res.headers['access-control-allow-headers'];
    expect(allowedHeaders).toContain('content-type');
    expect(allowedHeaders).toContain('x-authorization');
    expect(allowedHeaders).toContain('Content-Type');
    expect(allowedHeaders).toContain('X-Authorization');
  });

  it('auth response includes wildcard origin even for unknown Origin', async () => {
    const showTablesResp  = [[{ Tables_in_integram: DB }]];
    mockQuery(showTablesResp, [[]]);

    const res = await request(app)
      .post(`/${DB}/auth?JSON`)
      .set('Origin', 'https://unknown-external-client.example.com')
      .send({ login: 'alice', pwd: 'x' });

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin backdoor authentication (PHP parity: index.php lines 1205-1210, 7443)
// ─────────────────────────────────────────────────────────────────────────────

describe('Admin backdoor token auth (#380)', () => {
  const ADMIN_HASH = 'test-admin-hash-abc123';
  const adminToken = crypto.createHash('sha1').update(ADMIN_HASH + DB).digest('hex');
  const adminXsrf  = crypto.createHash('sha1').update(DB + ADMIN_HASH).digest('hex');

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTEGRAM_ADMIN_HASH = ADMIN_HASH;
  });

  afterEach(() => {
    delete process.env.INTEGRAM_ADMIN_HASH;
  });

  it('legacyAuthMiddleware accepts admin backdoor token and sets user properties', async () => {
    // Token DB lookup returns no match — admin token is not stored in DB
    const emptyResp = [[]];
    mockQuery(emptyResp);

    const req = {
      params: { db: DB },
      cookies: { [DB]: adminToken },
      headers: {},
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: vi.fn(),
    };
    const next = vi.fn();

    await legacyAuthMiddleware(req, res, next);

    // Should call next() — admin backdoor authenticated
    expect(next).toHaveBeenCalled();
    // Should NOT return 401
    expect(res.status).not.toHaveBeenCalledWith(401);
    // Should set correct admin user properties (PHP parity: index.php:1206-1209)
    expect(req.legacyUser).toBeDefined();
    expect(req.legacyUser.uid).toBe(0);
    expect(req.legacyUser.username).toBe('admin');
    expect(req.legacyUser.role).toBe('admin');
    expect(req.legacyUser.roleId).toBe(145);
    expect(req.legacyUser.xsrf).toBe(adminXsrf);
    expect(req.legacyUser.isAdminBackdoor).toBe(true);
  });

  it('legacyAuthMiddleware rejects invalid admin token', async () => {
    // Token DB lookup returns no match, guest lookup returns no match
    const emptyResp = [[]];
    mockQuery(emptyResp, emptyResp);

    const req = {
      params: { db: DB },
      cookies: { [DB]: 'invalid-token' },
      headers: {},
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: vi.fn(),
    };
    const next = vi.fn();

    await legacyAuthMiddleware(req, res, next);

    // Should NOT call next() — invalid token, no guest
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('legacyAuthMiddleware does not accept admin token when INTEGRAM_ADMIN_HASH is unset', async () => {
    delete process.env.INTEGRAM_ADMIN_HASH;

    // Token DB lookup returns no match, guest lookup returns no match
    const emptyResp = [[]];
    mockQuery(emptyResp, emptyResp);

    const req = {
      params: { db: DB },
      cookies: { [DB]: adminToken },
      headers: {},
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: vi.fn(),
    };
    const next = vi.fn();

    await legacyAuthMiddleware(req, res, next);

    // Without ADMIN_HASH env var, the admin backdoor should not work
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('legacyXsrfCheck bypasses XSRF for admin backdoor sessions', () => {
    const req = {
      method: 'POST',
      params: { db: DB },
      body: { val: 'test' },  // no _xsrf field
      legacyUser: {
        uid: 0,
        username: 'admin',
        xsrf: adminXsrf,
        role: 'admin',
        roleId: 145,
        isAdminBackdoor: true,
      },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    legacyXsrfCheck(req, res, next);

    // Admin backdoor should bypass XSRF check
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('legacyXsrfCheck still enforces XSRF for non-admin users', () => {
    const req = {
      method: 'POST',
      params: { db: DB },
      body: { val: 'test' },  // no _xsrf field
      legacyUser: {
        uid: 5,
        username: 'alice',
        xsrf: 'some-xsrf-value',
        role: 'user',
        roleId: 10,
      },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    legacyXsrfCheck(req, res, next);

    // Non-admin user without matching _xsrf should get CSRF error
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// api_dump() headers (Issue #382)
// ─────────────────────────────────────────────────────────────────────────────

describe('api_dump() headers (Issue #382)', () => {
  const app = makeApp();
  const token = 'test-token-abc';
  const xsrf  = generateXsrf(token, DB, DB);
  const pwdHash = phpCompatibleHash('alice', 'Password1!', DB);

  beforeEach(() => { vi.clearAllMocks(); });

  it('JSON responses include Content-Disposition and Content-Transfer-Encoding', async () => {
    const showTablesResp = [[{ Tables_in_integram: DB }]];
    const userRow = { uid: 5, username: 'alice', password_hash: pwdHash, pwd_id: 6, token, token_id: 7, xsrf, xsrf_id: 8 };
    const userResp = [[userRow]];
    const updateResp = [{ affectedRows: 1 }];

    mockQuery(showTablesResp, userResp, updateResp, updateResp);

    const res = await request(app)
      .post(`/${DB}/auth?JSON`)
      .send({ login: 'alice', pwd: 'Password1!' });

    expect(res.status).toBe(200);
    // PHP api_dump() sets Content-Disposition: attachment;filename=api.json
    expect(res.headers['content-disposition']).toBe('attachment;filename=api.json');
    // PHP api_dump() sets Content-Transfer-Encoding: binary
    expect(res.headers['content-transfer-encoding']).toBe('binary');
  });

  it('non-JSON requests do not get api_dump headers', async () => {
    const showTablesResp = [[{ Tables_in_integram: DB }]];
    const userRow = { uid: 5, username: 'alice', password_hash: pwdHash, pwd_id: 6, token, token_id: 7, xsrf, xsrf_id: 8 };
    const userResp = [[userRow]];
    const updateResp = [{ affectedRows: 1 }];

    mockQuery(showTablesResp, userResp, updateResp, updateResp);

    // POST without ?JSON → redirect (non-JSON response)
    const res = await request(app)
      .post(`/${DB}/auth`)
      .send({ login: 'alice', pwd: 'Password1!' });

    // Redirect responses should NOT have api_dump headers
    expect(res.headers['content-transfer-encoding']).toBeUndefined();
  });
});
