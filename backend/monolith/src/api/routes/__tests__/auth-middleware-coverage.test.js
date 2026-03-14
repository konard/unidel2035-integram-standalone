/**
 * Auth Middleware Coverage Test (Issue #386)
 *
 * Static analysis test that verifies all data-access endpoints in
 * legacy-compat.js include legacyAuthMiddleware. In PHP, Validate_Token()
 * runs before all actions, so every data endpoint requires a valid token.
 *
 * This test reads the source file and checks that each endpoint's
 * router registration line includes 'legacyAuthMiddleware'.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceFile = resolve(__dirname, '..', 'legacy-compat.js');
const source = readFileSync(sourceFile, 'utf-8');

/**
 * Extract the router registration line for a given route pattern.
 * Returns the full line, e.g.:
 *   "router.all('/:db/_dict/:typeId?', legacyAuthMiddleware, async (req, res) => {"
 */
function findRouteLine(routePattern) {
  const lines = source.split('\n');
  for (const line of lines) {
    if (line.includes(routePattern) && line.match(/^router\.(all|get|post|put|delete)\(/)) {
      return line.trim();
    }
  }
  return null;
}

describe('Auth middleware coverage for data-access endpoints (Issue #386)', () => {
  /**
   * These endpoints expose database content and MUST be protected by
   * legacyAuthMiddleware, matching PHP's Validate_Token() behaviour.
   */
  const protectedEndpoints = [
    { route: '/_dict/:typeId?', description: '_dict — type dictionary' },
    { route: '/_list/:typeId', description: '_list — object list (exact match)' },
    { route: '/_list_join/:typeId', description: '_list_join — joined object list' },
    { route: '/_d_main/:typeId', description: '_d_main — type metadata with requisites' },
    { route: '/export/:typeId', description: 'export — data export (CSV/JSON)' },
  ];

  protectedEndpoints.forEach(({ route, description }) => {
    it(`${description} has legacyAuthMiddleware`, () => {
      const routePattern = `'/:db${route}'`;
      const line = findRouteLine(routePattern);
      expect(line).not.toBeNull();
      expect(line).toContain('legacyAuthMiddleware');
    });
  });

  /**
   * Sanity check: verify that known-protected endpoints still have auth.
   * This prevents accidental removal of auth from other endpoints.
   */
  const alreadyProtected = [
    { route: '/_m_del/:id', description: '_m_del — delete object' },
    { route: '/terms', description: 'terms — type list' },
    { route: '/_ref_reqs/:refId', description: '_ref_reqs — reference requisites' },
  ];

  alreadyProtected.forEach(({ route, description }) => {
    it(`${description} still has legacyAuthMiddleware (sanity check)`, () => {
      const routePattern = `'/:db/${route.replace(/^\//, '')}'`;
      const line = findRouteLine(routePattern);
      expect(line).not.toBeNull();
      expect(line).toContain('legacyAuthMiddleware');
    });
  });

  it('_list route uses exact match (not prefix match for _list_join)', () => {
    // Ensure _list and _list_join are separate route registrations
    const listLine = findRouteLine("'/:db/_list/:typeId'");
    const listJoinLine = findRouteLine("'/:db/_list_join/:typeId'");
    expect(listLine).not.toBeNull();
    expect(listJoinLine).not.toBeNull();
    expect(listLine).not.toEqual(listJoinLine);
  });
});
