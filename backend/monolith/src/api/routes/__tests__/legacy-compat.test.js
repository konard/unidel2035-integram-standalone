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

vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

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
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for invalid database name', async () => {
    const req = { params: { db: '!!invalid!!' }, headers: {}, cookies: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await legacyAuthMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid database' });
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
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
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

describe('recursiveDelete', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('deletes a leaf node (no children)', async () => {
    const queries = [];
    const pool = {
      query: vi.fn(async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes('SELECT')) return [[]]; // no children
        return [{ affectedRows: 1 }]; // DELETE
      }),
    };

    await recursiveDelete(pool, DB, 100);

    // Should query for children, then delete self
    expect(queries).toHaveLength(2);
    expect(queries[0].sql).toContain('SELECT');
    expect(queries[0].params).toEqual([100]);
    expect(queries[1].sql).toContain('DELETE');
    expect(queries[1].params).toEqual([100]);
  });

  it('recursively deletes children before parent', async () => {
    const deletedIds = [];
    const pool = {
      query: vi.fn(async (sql, params) => {
        if (sql.includes('SELECT') && params[0] === 1) return [[{ id: 2 }, { id: 3 }]];
        if (sql.includes('SELECT')) return [[]]; // leaves
        if (sql.includes('DELETE')) { deletedIds.push(params[0]); return [{ affectedRows: 1 }]; }
        return [[]];
      }),
    };

    await recursiveDelete(pool, DB, 1);

    // Children deleted before parent
    expect(deletedIds).toEqual([2, 3, 1]);
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
        if (sql.includes('DELETE')) { deletedIds.push(params[0]); return [{ affectedRows: 1 }]; }
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
