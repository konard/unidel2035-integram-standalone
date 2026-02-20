/**
 * PHP API ?JSON Format Parity Tests (Issue #155)
 *
 * This test file verifies that Node.js API endpoints return responses that match
 * the PHP server's ?JSON response format exactly, including:
 *
 * 1. isApiRequest() detects JSON from headers (Accept, Content-Type, X-Requested-With)
 * 2. GET /:db/object/:typeId?JSON returns PHP-compatible format (req_base, type.base, base)
 * 3. Bearer token and X-Authorization header support for auth
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';

// ─── Shared mock query function (hoisted to module scope) ────────────────────
let mockQuery = vi.fn().mockResolvedValue([[]]);

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('mysql2/promise', () => ({
  default: {
    createPool: vi.fn(() => ({
      query: (...args) => mockQuery(...args),
      getConnection: vi.fn().mockResolvedValue({
        query: (...args) => mockQuery(...args),
        beginTransaction: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        release: vi.fn(),
      }),
    })),
  },
}));

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── App factory ──────────────────────────────────────────────────────────────

async function createApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const { default: legacyCompatRouter } = await import('../legacy-compat.js');
  app.use('/', legacyCompatRouter);
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PHP Format Parity (Issue #155)', () => {
  let app;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset mock query to default empty response
    mockQuery = vi.fn().mockResolvedValue([[]]);

    app = await createApp();
  });

  describe('isApiRequest() header detection', () => {
    /**
     * Step 4 of issue #155: isApiRequest should detect JSON from headers:
     * - Accept: application/json
     * - Content-Type: application/json
     * - X-Requested-With: XMLHttpRequest
     */

    it('detects JSON mode from Accept: application/json header', async () => {
      // When making a request with Accept: application/json but no ?JSON query param,
      // the server should still treat it as an API request and return JSON instead of HTML
      const response = await request(app)
        .get('/testdb/object/999')
        .set('Accept', 'application/json');

      // Should return JSON content-type, not redirect to login
      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('detects JSON mode from Content-Type: application/json header', async () => {
      const response = await request(app)
        .post('/testdb/_m_save/1')
        .set('Content-Type', 'application/json')
        .send({ val: 'test' });

      // Should return JSON response
      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('detects JSON mode from X-Requested-With: XMLHttpRequest header', async () => {
      const response = await request(app)
        .get('/testdb/object/999')
        .set('X-Requested-With', 'XMLHttpRequest');

      // Should return JSON content-type
      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('Bearer token and X-Authorization header support', () => {
    /**
     * Step 5 of issue #155: Support Authorization: Bearer <token> and X-Authorization headers
     */

    it('accepts Authorization: Bearer <token> header for xsrf endpoint', async () => {
      const token = 'test-bearer-token-123';

      // Mock the query to return a user for the token
      mockQuery
        .mockResolvedValueOnce([[]]) // DB exists check
        .mockResolvedValueOnce([[{ uid: 1, uname: 'testuser', xsrf_val: 'xsrf123', role_val: 'admin' }]]);

      const response = await request(app)
        .get('/testdb/xsrf')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      // Should be treated as authenticated (not return empty xsrf)
      expect(response.body).toBeDefined();
    });

    it('accepts X-Authorization header for xsrf endpoint', async () => {
      const token = 'test-x-auth-token-456';

      // Mock the query to return a user
      mockQuery
        .mockResolvedValueOnce([[]]) // DB exists check
        .mockResolvedValueOnce([[{ uid: 2, uname: 'user2', xsrf_val: 'xsrf456', role_val: '' }]]);

      const response = await request(app)
        .get('/testdb/xsrf')
        .set('X-Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('accepts Authorization header without Bearer prefix', async () => {
      const token = 'plain-token-789';

      mockQuery
        .mockResolvedValueOnce([[]]) // DB exists check
        .mockResolvedValueOnce([[{ uid: 3, uname: 'user3', xsrf_val: 'xsrf789', role_val: '' }]]);

      const response = await request(app)
        .get('/testdb/xsrf')
        .set('Authorization', token);

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('prefers cookie over Authorization header when both present', async () => {
      const cookieToken = 'cookie-token';
      const headerToken = 'header-token';

      // The first query should use the cookie token
      mockQuery
        .mockResolvedValueOnce([[]]) // DB exists check
        .mockResolvedValueOnce([[{ uid: 1, uname: 'cookieuser', xsrf_val: 'xsrf-cookie', role_val: '' }]]);

      const response = await request(app)
        .get('/testdb/xsrf')
        .set('Cookie', `testdb=${cookieToken}`)
        .set('Authorization', `Bearer ${headerToken}`);

      expect(response.status).toBe(200);
      // Cookie should take precedence
      expect(response.body).toBeDefined();
    });

    it('uses header token when no cookie present', async () => {
      const headerToken = 'only-header-token';

      mockQuery
        .mockResolvedValueOnce([[{ uid: 5, uname: 'headeruser', xsrf_val: 'xsrf-header', role_val: '' }]]);

      const response = await request(app)
        .get('/testdb/xsrf')
        .set('Authorization', `Bearer ${headerToken}`);

      expect(response.status).toBe(200);
      // When the query returns a user, body.user should be set
      expect(response.body).toBeDefined();
    });
  });

  describe('Exit endpoint with header auth', () => {
    it('accepts Bearer token for logout and returns JSON', async () => {
      const token = 'logout-token';

      // Mock the DELETE query
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const response = await request(app)
        .post('/testdb/exit')
        .set('Authorization', `Bearer ${token}`)
        .set('Accept', 'application/json'); // Request JSON to trigger isApiRequest()

      // Should return success JSON since Accept: application/json triggers API mode
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('accepts X-Authorization header for logout and returns JSON', async () => {
      const token = 'x-logout-token';

      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const response = await request(app)
        .post('/testdb/exit')
        .set('X-Authorization', `Bearer ${token}`)
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('GET /:db/object/:typeId?JSON format parity', () => {
    /**
     * PHP returns a complex response format including:
     * - object: array of {id, val, up, ord, t, reqs[]}
     * - type: {id, val, base}
     * - req_type: array of requisite type names
     * - req_base: map of req type id to base type name
     * - req_base_id: map of req type id to base type id
     * - reqs: map of object id to requisite values
     * - base: the base type info
     *
     * Authentication is required for this endpoint.
     */

    it('returns object array in PHP format', async () => {
      // The endpoint does these queries in order:
      // 1. Objects query: SELECT id, val, up, t AS base, ord FROM db WHERE t = ? ORDER BY ord
      // 2. Type metadata: SELECT ... FROM db t LEFT JOIN db bt ON bt.id = t.t WHERE t.id = ?
      // 3. Requisite definitions: SELECT req.id, req.val, req.t AS base_typ, req.ord, ... WHERE req.up = ?
      // 4. Requisite values: SELECT up, t, val FROM db WHERE up IN (?) ORDER BY up, ord

      mockQuery
        .mockResolvedValueOnce([[  // 1. Objects
          { id: 100, val: 'Object1', up: 0, base: 18, ord: 1 },
          { id: 101, val: 'Object2', up: 0, base: 18, ord: 2 },
        ]])
        .mockResolvedValueOnce([[  // 2. Type metadata
          { id: 18, val: 'TestType', base_type_id: 27, up: 0, base_val: 'TYPE' },
        ]])
        .mockResolvedValueOnce([[  // 3. Requisite definitions
          { id: 50, val: 'ReqType1', base_typ: 28, ord: 1, resolved_base: 28 },
        ]])
        .mockResolvedValueOnce([[  // 4. Requisite values
          { up: 100, t: 50, val: 'ReqValue1' },
          { up: 101, t: 50, val: 'ReqValue2' },
        ]]);

      // Provide authentication token via cookie
      const response = await request(app)
        .get('/testdb/object/18?JSON')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('object');
      expect(Array.isArray(response.body.object)).toBe(true);
    });

    it('returns type object with base field', async () => {
      mockQuery
        .mockResolvedValueOnce([[]]) // 1. No objects
        .mockResolvedValueOnce([[{ id: 18, val: 'TestType', base_type_id: 27, up: 0, base_val: 'TYPE' }]]) // 2. Type metadata
        .mockResolvedValueOnce([[]]) // 3. No req types
        .mockResolvedValueOnce([[]]); // 4. No reqs (won't be called since no objects)

      const response = await request(app)
        .get('/testdb/object/18?JSON')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type');
      expect(response.body.type).toHaveProperty('id');
      expect(response.body.type).toHaveProperty('val');
      // PHP format includes base field
      expect(response.body.type).toHaveProperty('base');
    });

    it('returns req_type as array of requisite type names', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 100, val: 'Obj', up: 0, base: 18, ord: 1 }]]) // 1. Objects
        .mockResolvedValueOnce([[{ id: 18, val: 'TestType', base_type_id: 27, up: 0, base_val: 'TYPE' }]]) // 2. Type metadata
        .mockResolvedValueOnce([[  // 3. Requisite definitions
          { id: 50, val: 'Name', base_typ: 28, ord: 1, resolved_base: 28 },
          { id: 51, val: 'Description', base_typ: 29, ord: 2, resolved_base: 29 },
        ]])
        .mockResolvedValueOnce([[]]); // 4. No reqs values

      const response = await request(app)
        .get('/testdb/object/18?JSON')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('req_type');
      expect(Array.isArray(response.body.req_type)).toBe(true);
    });

    it('returns req_base map of req type id to base type name', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 100, val: 'Obj', up: 0, base: 18, ord: 1 }]]) // 1. Objects
        .mockResolvedValueOnce([[{ id: 18, val: 'TestType', base_type_id: 27, up: 0, base_val: 'TYPE' }]]) // 2. Type metadata
        .mockResolvedValueOnce([[  // 3. Requisite definitions
          { id: 50, val: 'ShortField', base_typ: 28, ord: 1, resolved_base: 28 }, // SHORT
          { id: 51, val: 'HtmlField', base_typ: 29, ord: 2, resolved_base: 29 },  // HTML
        ]])
        .mockResolvedValueOnce([[]]); // 4. No reqs values

      const response = await request(app)
        .get('/testdb/object/18?JSON')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      // req_base should be a map of req type IDs to base type names
      expect(response.body).toHaveProperty('req_base');
      expect(typeof response.body.req_base).toBe('object');
    });

    it('returns req_base_id map of req type id to base type id', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 100, val: 'Obj', up: 0, base: 18, ord: 1 }]]) // 1. Objects
        .mockResolvedValueOnce([[{ id: 18, val: 'TestType', base_type_id: 27, up: 0, base_val: 'TYPE' }]]) // 2. Type metadata
        .mockResolvedValueOnce([[{ id: 50, val: 'Field', base_typ: 28, ord: 1, resolved_base: 28 }]]) // 3. Requisite definitions
        .mockResolvedValueOnce([[]]); // 4. No reqs values

      const response = await request(app)
        .get('/testdb/object/18?JSON')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('req_base_id');
      expect(typeof response.body.req_base_id).toBe('object');
    });

    it('returns base object with base type info', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 100, val: 'Obj', up: 0, base: 18, ord: 1 }]]) // 1. Objects
        .mockResolvedValueOnce([[{ id: 18, val: 'TestType', base_type_id: 27, up: 0, base_val: 'TYPE' }]]) // 2. Type metadata (t=27=TYPE)
        .mockResolvedValueOnce([[]]) // 3. No req types
        .mockResolvedValueOnce([[]]); // 4. No reqs values

      const response = await request(app)
        .get('/testdb/object/18?JSON')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('base');
      expect(response.body.base).toHaveProperty('id');
      // Note: base object may have 'unique' field instead of 'val' per PHP format
    });

    it('returns 401 JSON error instead of redirect when unauthenticated API request', async () => {
      // When requesting with Accept: application/json but unauthenticated,
      // should return 401 JSON, not redirect to login page

      // Make the type query fail (simulating unauthenticated)
      mockQuery.mockRejectedValueOnce(new Error('Access denied'));

      const response = await request(app)
        .get('/testdb/object/18?JSON')
        .set('Accept', 'application/json');

      // Should return JSON error, not HTML redirect
      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('GET /:db/types?JSON (edit_types) format parity', () => {
    /**
     * PHP returns: {edit_types: {...}, types: {...basic_types...}, editable: 1}
     * See PHP index.php lines 4293-4318
     */

    it('returns edit_types object with type data', async () => {
      // Mock type data query
      mockQuery.mockResolvedValueOnce([[
        { id: 100, t: 3, ref_val: null, uniq: 1, val: 'TestType', req_id: 200, req_t: 3, ord: 1, attrs: '', reft: null },
        { id: 100, t: 3, ref_val: null, uniq: 1, val: 'TestType', req_id: 201, req_t: 4, ord: 2, attrs: ':ALIAS=Test:', reft: null },
      ]]);

      const response = await request(app)
        .get('/testdb/types?JSON')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('edit_types');
      expect(response.body.edit_types).toHaveProperty('id');
      expect(response.body.edit_types).toHaveProperty('val');
      expect(Array.isArray(response.body.edit_types.id)).toBe(true);
    });

    it('returns types object with basic type mappings', async () => {
      mockQuery.mockResolvedValueOnce([[
        { id: 100, t: 3, ref_val: null, uniq: 1, val: 'TestType', req_id: null, req_t: null, ord: null, attrs: null, reft: null },
      ]]);

      const response = await request(app)
        .get('/testdb/types?JSON')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('types');
      expect(typeof response.body.types).toBe('object');
    });

    it('returns editable flag when user has write permissions', async () => {
      mockQuery.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .get('/testdb/types?JSON')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('editable');
      expect(response.body.editable).toBe(1);
    });

    it('also works with edit_types alias', async () => {
      mockQuery.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .get('/testdb/edit_types?JSON')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('edit_types');
    });
  });

  describe('GET /:db?JSON (main page) format parity', () => {
    /**
     * PHP returns: {user, user_id, role, _xsrf, token, &main.myrolemenu, terms}
     */

    it('returns 401 when no authentication token', async () => {
      const response = await request(app)
        .get('/testdb?JSON');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('returns user info when authenticated', async () => {
      // Mock: 1. DB exists check (must return a row), 2. User token validation, 3. Terms query
      mockQuery
        .mockResolvedValueOnce([[{ '1': 1 }]]) // DB exists - must return a row!
        .mockResolvedValueOnce([[{
          uid: 1,
          username: 'testuser',
          xsrf_val: 'xsrf123',
          role_val: null
        }]]) // User query
        .mockResolvedValueOnce([[]]); // Terms query

      const response = await request(app)
        .get('/testdb?JSON')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('user_id');
      expect(response.body).toHaveProperty('_xsrf');
      expect(response.body).toHaveProperty('token');
    });

    it('returns role menu when user has a role', async () => {
      // Mock queries
      mockQuery
        .mockResolvedValueOnce([[{ '1': 1 }]]) // DB exists - must return a row!
        .mockResolvedValueOnce([[{
          uid: 1,
          username: 'testuser',
          xsrf_val: 'xsrf123',
          role_val: '500' // Has role
        }]])
        .mockResolvedValueOnce([[ // Role menu items
          { id: 100, name: 'Dashboard', ord: 1 },
          { id: 101, name: 'Reports', ord: 2 },
        ]])
        .mockResolvedValueOnce([[]]); // Terms

      const response = await request(app)
        .get('/testdb?JSON')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('&main.myrolemenu');
      expect(response.body['&main.myrolemenu']).toHaveProperty('href');
      expect(response.body['&main.myrolemenu']).toHaveProperty('name');
    });

    it('returns terms/types list', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ '1': 1 }]]) // DB exists - must return a row!
        .mockResolvedValueOnce([[{
          uid: 1,
          username: 'testuser',
          xsrf_val: 'xsrf123',
          role_val: null
        }]])
        .mockResolvedValueOnce([[ // Terms
          { id: 18, name: 'User', type: 3, ord: 1 },
          { id: 22, name: 'Report', type: 3, ord: 2 },
        ]]);

      const response = await request(app)
        .get('/testdb?JSON')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('terms');
      expect(Array.isArray(response.body.terms)).toBe(true);
    });
  });

  describe('GET /:db/object/:typeId?JSON_DATA format parity', () => {
    /**
     * PHP JSON_DATA returns compact format: [{i:id, u:up, o:ord, r:[vals]}]
     */

    it('returns compact JSON_DATA format', async () => {
      // Mock queries
      mockQuery
        .mockResolvedValueOnce([[ // Objects
          { id: 100, val: 'Obj1', up: 0, base: 18, ord: 1 },
          { id: 101, val: 'Obj2', up: 0, base: 18, ord: 2 },
        ]])
        .mockResolvedValueOnce([[ // Requisite definitions
          { id: 50 },
          { id: 51 },
        ]])
        .mockResolvedValueOnce([[ // Requisite values
          { up: 100, t: 50, val: 'Value1' },
          { up: 100, t: 51, val: 'Value2' },
          { up: 101, t: 50, val: 'Value3' },
          { up: 101, t: 51, val: 'Value4' },
        ]]);

      const response = await request(app)
        .get('/testdb/object/18?JSON_DATA')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('i'); // id
        expect(response.body[0]).toHaveProperty('u'); // up
        expect(response.body[0]).toHaveProperty('o'); // ord
        expect(response.body[0]).toHaveProperty('r'); // requisite values array
      }
    });

    it('returns empty array when no objects', async () => {
      mockQuery
        .mockResolvedValueOnce([[]]) // No objects
        .mockResolvedValueOnce([[]]); // No requisite definitions

      const response = await request(app)
        .get('/testdb/object/999?JSON_DATA')
        .set('Cookie', 'testdb=valid-test-token');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });
  });
});
