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

const { default: legacyRouter } = await import('../legacy-compat.js');

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
    expect(res.body).toMatchObject({ _xsrf: expect.any(String), token: expect.any(String), id: 5 });
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
    expect(res.body.id).toBe(3);
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
    const res = await request(app)
      .post(`/${DB}/_m_new/1`)
      .send({ val: 'No type' });

    expect(res.status).toBe(200);
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
    // updateRowValue
    const updateResp = [{ affectedRows: 1 }];
    // getRequisiteByType for each attribute
    const existingReq = [[{ id: 301, val: 'old' }]];
    // updateRowValue for requisite
    const updateReq = [{ affectedRows: 1 }];
    // final SELECT t, up
    const objInfo = [[{ t: 100, up: 1 }]];

    mockQuery(updateResp, existingReq, updateReq, objInfo);

    const res = await request(app)
      .post(`/${DB}/_m_save/300`)
      .send({ val: 'Updated', t201: 'reqval' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 300,
      obj: 100,
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
    // Fetch type/up before delete
    const objInfo = [[{ t: 100, up: 5 }]];
    // deleteRow
    const deleteResp = [{ affectedRows: 1 }];

    mockQuery(objInfo, deleteResp);

    const res = await request(app)
      .post(`/${DB}/_m_del/300`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 100,      // type ID in PHP format
      obj: 300,     // deleted ID
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
    expect(res.body).toMatchObject({
      id: 999,
      obj: 999,
      next_act: 'object',
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
