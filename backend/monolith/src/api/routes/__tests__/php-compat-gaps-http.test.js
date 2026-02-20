/**
 * PHP Compatibility Gaps — HTTP Integration Tests (Issue #150)
 *
 * This test file verifies the same features as php-compat-gaps.test.js (issue #148 / PR #149),
 * but uses a different approach: HTTP integration testing via supertest, mounting the actual
 * Express router and making real HTTP requests to verify end-to-end behaviour.
 *
 * Features under test:
 *   1. action=object in POST /:db          (PHP index.php lines 4056–4072)
 *   2. action=edit_obj in POST /:db        (PHP index.php lines 4073–4085)
 *   3. SEARCH_* params in POST /:db/_m_save (PHP index.php lines 8011–8017)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// ─── App factory ──────────────────────────────────────────────────────────────

async function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const { default: legacyCompatRouter } = await import('../legacy-compat.js');
  app.use('/', legacyCompatRouter);
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HTTP integration — action=object / action=edit_obj in POST /:db', () => {
  /**
   * PHP: index.php lines 4056–4085
   * POST /:db with action=object&id=<n> or action=edit_obj&id=<n>
   * Without template files present, the handler falls through to next(),
   * which eventually redirects to /:db (login).
   * With id=0 / missing id, the handler returns 200 "Object id is empty or 0".
   */

  let app;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe('action=object', () => {
    it('POST /:db with action=object and missing id returns 200 with "Object id is empty or 0"', async () => {
      const response = await request(app)
        .post('/testdb')
        .send({ action: 'object' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('Object id is empty or 0');
    });

    it('POST /:db with action=object and id=0 returns 200 with "Object id is empty or 0"', async () => {
      const response = await request(app)
        .post('/testdb')
        .send({ action: 'object', id: '0' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('Object id is empty or 0');
    });

    it('POST /:db with action=object and valid id falls through when template not found', async () => {
      // No integram-server directory in test environment → fs.existsSync returns false
      // → handler calls next() → subsequent POST /:db handler runs → no token cookie
      // → handler tries to serve login page (also missing) → redirects to /:db
      const response = await request(app)
        .post('/testdb')
        .send({ action: 'object', id: '123' });

      // Handler falls through to login/redirect logic
      expect([200, 302]).toContain(response.status);
    });

    it('POST /:db with action=object via query string and missing id returns error', async () => {
      const response = await request(app)
        .post('/testdb?action=object');

      expect(response.status).toBe(200);
      expect(response.text).toBe('Object id is empty or 0');
    });
  });

  describe('action=edit_obj', () => {
    it('POST /:db with action=edit_obj and missing id returns 200 with "Object id is empty or 0"', async () => {
      const response = await request(app)
        .post('/testdb')
        .send({ action: 'edit_obj' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('Object id is empty or 0');
    });

    it('POST /:db with action=edit_obj and id=0 returns 200 with "Object id is empty or 0"', async () => {
      const response = await request(app)
        .post('/testdb')
        .send({ action: 'edit_obj', id: '0' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('Object id is empty or 0');
    });

    it('POST /:db with action=edit_obj and valid id falls through when template not found', async () => {
      const response = await request(app)
        .post('/testdb')
        .send({ action: 'edit_obj', id: '456' });

      expect([200, 302]).toContain(response.status);
    });

    it('POST /:db with action=edit_obj via query string and missing id returns error', async () => {
      const response = await request(app)
        .post('/testdb?action=edit_obj');

      expect(response.status).toBe(200);
      expect(response.text).toBe('Object id is empty or 0');
    });
  });

  describe('action routing — both actions handled by same route', () => {
    it('POST /:db without action does NOT return "Object id is empty or 0"', async () => {
      // No action → falls to the generic POST /:db handler, not the object/edit_obj one
      const response = await request(app)
        .post('/testdb')
        .send({ val: 'something' });

      expect(response.text).not.toBe('Object id is empty or 0');
    });

    it('POST /:db with unrecognised action does NOT return "Object id is empty or 0"', async () => {
      const response = await request(app)
        .post('/testdb')
        .send({ action: 'report', id: '1' });

      expect(response.text).not.toBe('Object id is empty or 0');
    });
  });
});

describe('HTTP integration — SEARCH_* params in POST /:db/_m_save/:id', () => {
  /**
   * PHP: index.php lines 8011–8017
   * When saving an object, SEARCH_* parameters that changed from their PREV_SEARCH_*
   * counterparts are collected and returned as {"search": {typeId: value}}.
   */

  let app;
  let mockQuery;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up mysql mock with a query spy that returns reasonable defaults
    mockQuery = vi.fn().mockResolvedValue([[]]);

    const mysql = await import('mysql2/promise');
    mysql.default.createPool.mockReturnValue({
      query: mockQuery,
      getConnection: vi.fn().mockResolvedValue({
        query: mockQuery,
        beginTransaction: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        release: vi.fn(),
      }),
    });

    // Reset module registry so legacy-compat picks up the new pool mock
    vi.resetModules();
    // Re-mock after reset
    vi.mock('mysql2/promise', () => ({
      default: {
        createPool: vi.fn(() => ({
          query: mockQuery,
          getConnection: vi.fn().mockResolvedValue({
            query: mockQuery,
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

    app = await createApp();
  });

  it('POST /:db/_m_save/:id without SEARCH_* params returns standard {status, id, val, saved1}', async () => {
    const response = await request(app)
      .post('/testdb/_m_save/99')
      .send({ val: 'My Object' });

    expect(response.status).toBe(200);
    const body = response.body;
    expect(body).toHaveProperty('status', 'Ok');
    expect(body).toHaveProperty('id', 99);
    expect(body).toHaveProperty('saved1', 1);
    expect(body).not.toHaveProperty('search');
  });

  it('POST /:db/_m_save/:id with changed SEARCH_* param includes it in response.search', async () => {
    const response = await request(app)
      .post('/testdb/_m_save/99')
      .send({
        val: 'My Object',
        SEARCH_42: 'filter text',
        PREV_SEARCH_42: 'old filter',
      });

    expect(response.status).toBe(200);
    const body = response.body;
    expect(body).toHaveProperty('status', 'Ok');
    expect(body).toHaveProperty('search');
    expect(body.search['42']).toBe('filter text');
  });

  it('POST /:db/_m_save/:id with new SEARCH_* param (no PREV_) includes it in response.search', async () => {
    const response = await request(app)
      .post('/testdb/_m_save/99')
      .send({
        val: 'My Object',
        SEARCH_18: 'another filter',
      });

    expect(response.status).toBe(200);
    const body = response.body;
    expect(body).toHaveProperty('search');
    expect(body.search['18']).toBe('another filter');
  });

  it('POST /:db/_m_save/:id with empty SEARCH_* param does NOT include it in response.search', async () => {
    const response = await request(app)
      .post('/testdb/_m_save/99')
      .send({
        val: 'My Object',
        SEARCH_7: '',        // empty — should be skipped
        SEARCH_18: 'keep',   // non-empty — should be included
      });

    expect(response.status).toBe(200);
    const body = response.body;
    expect(body).toHaveProperty('search');
    expect(body.search['7']).toBeUndefined();
    expect(body.search['18']).toBe('keep');
  });

  it('POST /:db/_m_save/:id with unchanged SEARCH_* param does NOT include it in response.search', async () => {
    const response = await request(app)
      .post('/testdb/_m_save/99')
      .send({
        val: 'My Object',
        SEARCH_42: 'same value',
        PREV_SEARCH_42: 'same value', // same as SEARCH_42 — should be skipped
      });

    expect(response.status).toBe(200);
    const body = response.body;
    // search key should either be absent or not contain key 42
    if (body.search) {
      expect(body.search['42']).toBeUndefined();
    } else {
      expect(body).not.toHaveProperty('search');
    }
  });

  it('POST /:db/_m_save/:id with multiple SEARCH_* params includes all changed ones', async () => {
    const response = await request(app)
      .post('/testdb/_m_save/99')
      .send({
        val: 'My Object',
        SEARCH_42: 'changed',
        PREV_SEARCH_42: 'old',
        SEARCH_18: 'new criteria',    // no PREV_ → include
        SEARCH_7: '',                  // empty → skip
        SEARCH_55: 'same',
        PREV_SEARCH_55: 'same',        // unchanged → skip
      });

    expect(response.status).toBe(200);
    const body = response.body;
    expect(body).toHaveProperty('search');
    expect(body.search['42']).toBe('changed');
    expect(body.search['18']).toBe('new criteria');
    expect(body.search['7']).toBeUndefined();
    expect(body.search['55']).toBeUndefined();
  });
});
