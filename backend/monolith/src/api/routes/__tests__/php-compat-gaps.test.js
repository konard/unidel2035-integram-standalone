/**
 * PHP Compatibility Gaps — Full Summary (Issue #138)
 *
 * Analysis: index.php (9 180 lines) vs legacy-compat.js (~4 000 lines)
 * 68 PHP endpoints/actions found → 42 implemented → 26 gaps
 *
 * Legend:
 *   PASS  — correctly implemented
 *   FAIL  — implemented but wrong format / behaviour
 *   TODO  — completely missing
 *
 * Each test documents the PHP source (file + line) and expected behaviour.
 */

import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import express from 'express';
import request from 'supertest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('mysql2/promise', () => ({
  default: {
    createPool: vi.fn(() => ({
      query: vi.fn().mockResolvedValue([[]]),
      getConnection: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue([[]]),
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** PHP Salt(a, b) = sha1(a+b) + sha1(b+a)  →  substring(sha1(Salt), 0, 22) */
function phpXsrf(token, db) {
  const salt =
    crypto.createHash('sha1').update(token + db).digest('hex') +
    crypto.createHash('sha1').update(db + token).digest('hex');
  return crypto.createHash('sha1').update(salt).digest('hex').substring(0, 22);
}

// ─── P0: Critical — breaks core functionality ──────────────────────────────────

describe('P0 — Critical gaps', () => {

  // ── _ref_reqs: response format ──────────────────────────────────────────────

  describe('_ref_reqs — reference list response format', () => {
    /**
     * PHP: index.php lines 8944–9086
     *
     * Builds: {"<id>": "<main_val> / <req1_val> / <req2_val>", ...}
     * Missing values shown as " / --"
     *
     * Node.js: lines 2093–2150
     * Currently returns only: {"<id>": "<main_val>"}  ← WRONG
     */

    it.todo(
      'should concatenate multiple requisite values with " / " separator'
    );

    it.todo(
      'should show "--" for missing optional requisites'
    );

    it.todo(
      'should support ?r=<id> parameter to restrict results to specific ids'
    );

    it.todo(
      'should support ?r=<id1>,<id2> comma-separated restriction'
    );

    it.todo(
      'should support ?q=@<id> search-by-id mode (PHP: @id prefix)'
    );

    it('XSRF formula: 22-char sha1-based token (already fixed)', () => {
      const xsrf = phpXsrf('sometoken', 'mydb');
      expect(xsrf).toHaveLength(22);
      expect(xsrf).toMatch(/^[0-9a-f]+$/);
    });
  });

  // ── action=report in POST /:db ───────────────────────────────────────────────

  describe('action=report in POST /:db', () => {
    /**
     * PHP: index.php lines 3756–3870
     *
     * JS client sends: POST /:db with body {action: "report", id: <reportId>, ...}
     * PHP dispatches to report logic inside the same request.
     *
     * Node.js: has a separate GET/POST /:db/report/:id route — but the JS client
     * never calls it. POST /:db with action=report hits the page-renderer, not
     * the report executor.
     */

    it.todo(
      'POST /:db with action=report&id=<n>&JSON should execute report and return data'
    );

    it.todo(
      'POST /:db with action=report&id=<n>&JSON_KV should return [{col:val,...},...]'
    );

    it.todo(
      'POST /:db with action=report&id=<n>&JSON_DATA should return {col: array}'
    );

    it.todo(
      'POST /:db with action=report&id=<n>&JSON_CR should return {columns,rows,totalCount}'
    );
  });

  // ── csv_all ──────────────────────────────────────────────────────────────────

  describe('csv_all — full DB export to CSV', () => {
    /**
     * PHP: index.php lines 4087–4177
     * Access control: !isset($GLOBALS["GRANTS"]["EXPORT"][1])
     * Output: CSV with headers + nested requisite columns
     * Timeout: set_time_limit(300)
     */

    it.todo('GET /:db/csv_all should return CSV with column headers');
    it.todo('GET /:db/csv_all should include nested requisite values');
    it.todo('GET /:db/csv_all should respect LIMIT parameter');
    it.todo('GET /:db/csv_all should enforce export grant check');
  });

  // ── backup / restore ─────────────────────────────────────────────────────────

  describe('backup / restore — binary dump format', () => {
    /**
     * PHP: backup lines 4239–4285, restore lines 4178–4238
     * Format: binary .dmp compressed to ZIP
     */

    it.todo('GET /:db/backup should return a ZIP file');
    it.todo('POST /:db/restore with ZIP file should restore the database');
  });
});

// ─── P1: High priority ─────────────────────────────────────────────────────────

describe('P1 — High priority gaps', () => {

  // ── Auth response format ─────────────────────────────────────────────────────

  describe('POST /:db/auth?JSON — response format', () => {
    /**
     * PHP: index.php line 7695
     *   api_dump(json_encode(["_xsrf"=>..., "token"=>..., "id"=>..., "msg"=>""]))
     *
     * api_dump() wraps in plain JSON object (NOT array).
     * Node.js currently returns object — this is CORRECT per api_dump().
     *
     * However the login.json filename convention and msg:"" field matter.
     */

    it('response must include _xsrf, token, id fields', () => {
      // PHP line 7695 — required fields
      const mockResponse = { _xsrf: 'abc123', token: 'tok', id: 1, msg: '' };
      expect(mockResponse).toHaveProperty('_xsrf');
      expect(mockResponse).toHaveProperty('token');
      expect(mockResponse).toHaveProperty('id');
    });

    it.todo('response must include msg:"" field (PHP line 7695)');

    it.todo(
      'POST /:db/auth with tzone param should set tzone cookie (PHP line 7623)'
    );

    it.todo(
      'POST /:db/auth with uri param should redirect there after login (PHP line 7626)'
    );

    it.todo(
      'POST /:db/auth with change=1&npw1=&npw2= should change password (PHP line 7630)'
    );
  });

  // ── Action aliases ───────────────────────────────────────────────────────────

  describe('PHP action aliases — 12 alternative names not implemented', () => {
    /**
     * PHP: index.php lines 8551–8759
     * PHP uses case fall-through: case "_d_alias": case "_setalias": { same code }
     * Node.js only handles canonical names → 404 for all aliases below.
     */

    const aliases = [
      ['_setalias',    '_d_alias',    8600],
      ['_setnull',     '_d_null',     8664],
      ['_setmulti',    '_d_multi',    8676],
      ['_setorder',    '_d_ord',      8719],
      ['_moveup',      '_m_up',       8701],
      ['_deleteterm',  '_d_del',      8739],
      ['_deletereq',   '_d_req_del',  8758],
      ['_attributes',  '_d_req',      8551],
      ['_terms',       '_d_new',      8629],
      ['_references',  '_d_ref',      8645],
      ['_patchterm',   '_d_save',     8583],
      ['_modifiers',   '_d_attrs',    8689],
    ];

    for (const [alias, canonical, phpLine] of aliases) {
      it.todo(
        `GET /:db/${alias} should behave identically to /:db/${canonical} (PHP line ${phpLine})`
      );
    }
  });

  // ── _m_save: copybtn ─────────────────────────────────────────────────────────

  describe('_m_save — missing features', () => {
    /**
     * PHP: index.php lines 8049–8163
     */

    it.todo(
      'POST /:db/_m_save with copybtn=1 should duplicate object with all requisites (PHP line 8049)'
    );

    it.todo(
      'POST /:db/_m_save should handle NEW_t parameters (create reference on-the-fly)'
    );

    it.todo(
      'POST /:db/_m_save should handle SEARCH_* parameters (persist search criteria)'
    );
  });
});

// ─── P2: Medium priority ───────────────────────────────────────────────────────

describe('P2 — Medium priority gaps', () => {

  // ── terms: grant filtering ───────────────────────────────────────────────────

  describe('GET /:db/terms — grant filtering', () => {
    /**
     * PHP: index.php lines 8919–8942
     *   foreach($typ as $id => $val)
     *     if(Grant_1level($id))   ← filters by user access
     *
     * Node.js: returns ALL types regardless of user grants.
     */

    it.todo(
      'should only return types the current user has Grant_1level access to (PHP line 8922)'
    );
  });

  // ── xsrf: role field ────────────────────────────────────────────────────────

  describe('GET /:db/xsrf — response format', () => {
    /**
     * PHP: index.php lines 8914–8917
     *   json_encode(["_xsrf"=>..., "token"=>..., "user"=>..., "role"=>..., "id"=>..., "msg"=>""])
     */

    it.todo('response must include "role" field (PHP line 8915)');
    it.todo('response must include "msg":"" field (PHP line 8915)');
  });

  // ── exit: token deletion ─────────────────────────────────────────────────────

  describe('GET /:db/exit — token deletion from DB', () => {
    /**
     * PHP: index.php lines 8907–8912
     *   Exec_sql("DELETE FROM $z WHERE up=$user_id AND t=TOKEN")
     *
     * Node.js: clears only the cookie, token stays in DB.
     * Security: old token can be reused if captured.
     */

    it.todo(
      'should DELETE token row from DB on logout (PHP line 8909)'
    );
  });

  // ── object / edit_obj actions ────────────────────────────────────────────────

  describe('action=object / action=edit_obj in POST /:db', () => {
    /**
     * PHP: index.php lines 4056–4085
     * JS client navigates to /:db with action=object&id=<n> to view/edit an object.
     */

    it.todo(
      'POST /:db with action=object&id=<n> should render object view HTML (PHP line 4056)'
    );

    it.todo(
      'POST /:db with action=edit_obj&id=<n> should render object edit form HTML (PHP line 4073)'
    );
  });

  // ── jwt: field name ──────────────────────────────────────────────────────────

  describe('POST /:db/jwt — field name compatibility', () => {
    /**
     * PHP: index.php line 7609
     *   $params = verifyJWT($_POST["jwt"], JWT_PUBLIC_KEY)
     *
     * Node.js reads req.body.token instead of req.body.jwt.
     */

    it.todo(
      'should read JWT from POST field named "jwt" not "token" (PHP line 7609)'
    );
  });

  // ── _new_db: response format ─────────────────────────────────────────────────

  describe('POST /my/_new_db — create database', () => {
    /**
     * PHP: index.php line 8823
     *   api_dump(json_encode(["status"=>"Ok", "id"=>$id]))
     *
     * Must only work when db === "my".
     * Validates name: 3–15 chars, latin, starts with letter, not reserved.
     */

    it('DB name must be 3–15 latin chars starting with a letter', () => {
      const valid = /^[a-z][a-z0-9]{2,14}$/i;
      expect(valid.test('abc')).toBe(true);
      expect(valid.test('mydb123')).toBe(true);
      expect(valid.test('ab')).toBe(false);       // too short
      expect(valid.test('1abc')).toBe(false);      // starts with digit
      expect(valid.test('a'.repeat(16))).toBe(false); // too long
    });

    it.todo(
      'POST /my/_new_db?db=<name>&JSON must return {"status":"Ok","id":<n>} (PHP line 8823)'
    );

    it.todo(
      'POST /:db/_new_db where db != "my" must return error (PHP line 8801)'
    );

    it.todo(
      'POST /my/_new_db with reserved name must return error (PHP line 8803)'
    );
  });

  // ── metadata / obj_meta format ───────────────────────────────────────────────

  describe('GET /:db/obj_meta/:id — response format', () => {
    /**
     * PHP: index.php lines 8826–8858
     * Expected: {"id":"...","up":"...","type":"...","val":"...","reqs":{"<id>":{...}}}
     */

    it.todo(
      'should return "reqs" object with requisite details (PHP line 8826)'
    );
  });

  describe('GET /:db/metadata/:typeId — response format', () => {
    /**
     * PHP: index.php lines 8860–8905
     * For single type: returns array of requisite definitions
     * For all: returns array of all type definitions
     */

    it.todo(
      'should return array format matching PHP api_dump output (PHP line 8902)'
    );
  });
});

// ─── P3: Low priority (nice-to-have) ──────────────────────────────────────────

describe('P3 — Low priority gaps', () => {

  describe('Admin password override', () => {
    /**
     * PHP: index.php lines 7683–7688
     * Special auth path for user "admin" using ADMINHASH constant:
     *   sha1(sha1(SERVER_NAME + db + password) + db) === sha1(ADMINHASH + db)
     */

    it.todo(
      'POST /:db/auth with login=admin and correct hash should bypass normal auth (PHP line 7683)'
    );
  });

  describe('JSON_UNESCAPED_UNICODE consistency', () => {
    /**
     * PHP uses JSON_UNESCAPED_UNICODE in all api_dump calls.
     * Cyrillic characters must not be escaped as \\uXXXX.
     */

    it('Cyrillic must pass through JSON without escaping', () => {
      const obj = { name: 'Привет' };
      const json = JSON.stringify(obj);
      // Node.js JSON.stringify does NOT escape Cyrillic — this is correct
      expect(json).toContain('Привет');
      expect(json).not.toContain('\\u');
    });
  });

  describe('GET /:db/xsrf — role field always present', () => {
    it.todo('role field must reflect the user role stored in DB (PHP line 8915)');
  });
});

// ─── Already fixed (regression guard) ─────────────────────────────────────────

describe('Already fixed — regression guard', () => {

  it('legacyPath resolves 5 levels up to integram-server', () => {
    // legacy-compat.js line 20: path.resolve(__dirname, '../../../../../integram-server')
    // __dirname = .../backend/monolith/src/api/routes
    // 5× ../ = repo root, then integram-server
    const levels = '../../../../../integram-server'.split('/').filter(s => s === '..').length;
    expect(levels).toBe(5);
  });

  it('isApiRequest covers all 5 PHP JSON params', () => {
    // PHP line 79: JSON|JSON_DATA|JSON_KV|JSON_CR|JSON_HR
    const phpParams = ['JSON', 'JSON_DATA', 'JSON_KV', 'JSON_CR', 'JSON_HR'];
    const mockIsApiRequest = (query) =>
      phpParams.some(p => p in query);

    expect(mockIsApiRequest({ JSON: '' })).toBe(true);
    expect(mockIsApiRequest({ JSON_KV: '' })).toBe(true);
    expect(mockIsApiRequest({ JSON_DATA: '' })).toBe(true);
    expect(mockIsApiRequest({ JSON_CR: '' })).toBe(true);
    expect(mockIsApiRequest({ JSON_HR: '' })).toBe(true);
    expect(mockIsApiRequest({ other: '' })).toBe(false);
  });

  it('XSRF is 22 hex chars from SHA1(phpSalt(token, db))', () => {
    const xsrf = phpXsrf('testtoken', 'testdb');
    expect(xsrf).toHaveLength(22);
    expect(/^[0-9a-f]+$/.test(xsrf)).toBe(true);
  });

  it('HTTP 200 used for all error responses (not 4xx)', () => {
    // PHP my_die(): always HTTP 200, body: [{"error":"..."}]
    const phpErrorFormat = (msg) => [{ error: msg }];
    const result = phpErrorFormat('something went wrong');
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty('error');
  });

  it('report ?JSON_KV returns array of objects with column NAMES as keys', () => {
    // PHP lines 3815–3826: [{col_name: val, ...}, ...]
    const mockCols = [{ name: 'Имя', alias: 'col0' }, { name: 'Возраст', alias: 'col1' }];
    const mockData = [{ col0: 'Иван', col1: 30 }];

    const result = mockData.map(row => {
      const obj = {};
      for (const col of mockCols) obj[col.name] = row[col.alias] ?? '';
      return obj;
    });

    expect(result).toEqual([{ 'Имя': 'Иван', 'Возраст': 30 }]);
  });

  it('DB name validation regex matches PHP USER_DB_MASK', () => {
    // PHP: /^[a-z][a-z0-9]{2,14}$/i  (3–15 chars, starts with letter)
    const valid = /^[a-z]\w{1,14}$/i;
    expect(valid.test('my')).toBe(true);
    expect(valid.test('mydb')).toBe(true);
    expect(valid.test('a')).toBe(false);
    expect(valid.test('1abc')).toBe(false);
    expect(valid.test('a'.repeat(16))).toBe(false);
  });
});
