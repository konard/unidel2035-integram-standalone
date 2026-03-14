/**
 * checkTypesGrant — Unit tests (Issue #297)
 *
 * Port of PHP Check_Types_Grant() (index.php:967).
 * Authorization gate for type/metadata operations.
 */

import { describe, it, expect } from 'vitest';
import { checkTypesGrant } from '../legacy-compat.js';

describe('checkTypesGrant', () => {
  describe('admin bypass', () => {
    it('returns WRITE for admin user regardless of grants', () => {
      expect(checkTypesGrant({}, 'admin')).toBe('WRITE');
    });

    it('returns WRITE for admin user with empty grants', () => {
      expect(checkTypesGrant({}, 'admin', true)).toBe('WRITE');
    });

    it('returns WRITE for Admin (case-insensitive)', () => {
      expect(checkTypesGrant({}, 'Admin')).toBe('WRITE');
      expect(checkTypesGrant({}, 'ADMIN')).toBe('WRITE');
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

    it('throws 403 when grants[0] has invalid value (fatal=true)', () => {
      expect(() => checkTypesGrant({ 0: 'NONE' }, 'someuser', true))
        .toThrow('You do not have the grant to view and edit the metadata');
    });

    it('returns undefined when grants[0] has invalid value (fatal=false)', () => {
      expect(checkTypesGrant({ 0: 'NONE' }, 'someuser', false)).toBeUndefined();
    });
  });

  describe('no grant', () => {
    it('throws with status 403 when fatal=true and no grants', () => {
      try {
        checkTypesGrant({}, 'someuser', true);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err.message).toBe('You do not have the grant to view and edit the metadata');
        expect(err.status).toBe(403);
      }
    });

    it('throws when fatal defaults to true', () => {
      expect(() => checkTypesGrant({}, 'someuser'))
        .toThrow('You do not have the grant to view and edit the metadata');
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
