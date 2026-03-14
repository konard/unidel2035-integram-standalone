/**
 * checkTypesGrant — Unit tests (Issue #297, #333)
 *
 * Port of PHP Check_Types_Grant() (index.php:967).
 * Authorization gate for type/metadata operations.
 */

import { describe, it, expect } from 'vitest';
import { checkTypesGrant } from '../legacy-compat.js';

describe('checkTypesGrant', () => {
  describe('admin bypass', () => {
    it('returns WRITE for exact "admin" username regardless of grants', () => {
      expect(checkTypesGrant({}, 'admin')).toBe('WRITE');
    });

    it('returns WRITE for admin user with empty grants', () => {
      expect(checkTypesGrant({}, 'admin', true)).toBe('WRITE');
    });

    it('does NOT bypass for "Admin" or "ADMIN" (case-sensitive, PHP parity)', () => {
      // PHP uses exact match: $GLOBALS["GLOBAL_VARS"]["user"] == "admin"
      const resultAdmin = checkTypesGrant({}, 'Admin', false);
      const resultADMIN = checkTypesGrant({}, 'ADMIN', false);
      expect(resultAdmin).toBeUndefined();
      expect(resultADMIN).toBeUndefined();
    });

    it('returns WRITE for admin even when grants[0] is READ', () => {
      expect(checkTypesGrant({ 0: 'READ' }, 'admin')).toBe('WRITE');
    });
  });

  describe('grant ID 0 check', () => {
    it('returns WRITE when grants[0] is WRITE', () => {
      expect(checkTypesGrant({ 0: 'WRITE' }, 'someuser')).toBe('WRITE');
    });

    it('returns READ when grants[0] is READ', () => {
      expect(checkTypesGrant({ 0: 'READ' }, 'someuser')).toBe('READ');
    });

    it('returns error object with status 200 when grants[0] has invalid value (fatal=true)', () => {
      const result = checkTypesGrant({ 0: 'NONE' }, 'someuser', true);
      expect(result).toEqual({
        error: 'You do not have the grant to view and edit the metadata',
        status: 200,
      });
    });

    it('returns undefined when grants[0] has invalid value (fatal=false)', () => {
      expect(checkTypesGrant({ 0: 'NONE' }, 'someuser', false)).toBeUndefined();
    });
  });

  describe('no grant — fatal (PHP die() parity)', () => {
    it('returns error object with status 200 when fatal=true and no grants', () => {
      const result = checkTypesGrant({}, 'someuser', true);
      expect(result).toEqual({
        error: 'You do not have the grant to view and edit the metadata',
        status: 200,
      });
    });

    it('returns error object when fatal defaults to true', () => {
      const result = checkTypesGrant({}, 'someuser');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('status', 200);
    });

    it('includes role prefix in error message when role is provided', () => {
      const result = checkTypesGrant({}, 'someuser', true, 'Manager');
      expect(result).toEqual({
        error: '[Manager] You do not have the grant to view and edit the metadata',
        status: 200,
      });
    });

    it('omits role prefix when role is empty', () => {
      const result = checkTypesGrant({}, 'someuser', true, '');
      expect(result.error).toBe('You do not have the grant to view and edit the metadata');
    });

    it('returns undefined when fatal=false and no grants', () => {
      expect(checkTypesGrant({}, 'someuser', false)).toBeUndefined();
    });

    it('returns undefined when fatal=false and grants is null-ish', () => {
      expect(checkTypesGrant(null, 'someuser', false)).toBeUndefined();
      expect(checkTypesGrant(undefined, 'someuser', false)).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('handles missing username gracefully with fatal=false', () => {
      expect(checkTypesGrant({}, '', false)).toBeUndefined();
      expect(checkTypesGrant({}, null, false)).toBeUndefined();
    });

    it('does not confuse other grant IDs with grant 0', () => {
      expect(checkTypesGrant({ 1: 'WRITE', 5: 'READ' }, 'someuser', false)).toBeUndefined();
    });

    it('grant 0 takes precedence regardless of other grants', () => {
      expect(checkTypesGrant({ 0: 'READ', 1: 'WRITE' }, 'someuser')).toBe('READ');
    });
  });
});
