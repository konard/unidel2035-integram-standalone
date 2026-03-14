/**
 * SQL Injection Guards — Unit tests (Issue #308)
 *
 * Tests for sanitizeIdentifier() and checkInjection() functions
 * added to legacy-compat.js as defense-in-depth against SQL injection.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeIdentifier, checkInjection } from '../legacy-compat.js';

describe('sanitizeIdentifier', () => {
  it('accepts simple alphanumeric names', () => {
    expect(sanitizeIdentifier('testdb')).toBe('`testdb`');
    expect(sanitizeIdentifier('my_table')).toBe('`my_table`');
    expect(sanitizeIdentifier('DB123')).toBe('`DB123`');
  });

  it('accepts underscored names', () => {
    expect(sanitizeIdentifier('user_data_2025')).toBe('`user_data_2025`');
  });

  it('rejects names with spaces', () => {
    expect(() => sanitizeIdentifier('my table')).toThrow('Invalid SQL identifier');
  });

  it('rejects names with backticks', () => {
    expect(() => sanitizeIdentifier('my`table')).toThrow('Invalid SQL identifier');
  });

  it('rejects names with semicolons', () => {
    expect(() => sanitizeIdentifier('db; DROP TABLE')).toThrow('Invalid SQL identifier');
  });

  it('rejects names with dashes', () => {
    expect(() => sanitizeIdentifier('my-table')).toThrow('Invalid SQL identifier');
  });

  it('rejects names with dots', () => {
    expect(() => sanitizeIdentifier('schema.table')).toThrow('Invalid SQL identifier');
  });

  it('rejects empty string', () => {
    expect(() => sanitizeIdentifier('')).toThrow('non-empty string');
  });

  it('rejects null/undefined', () => {
    expect(() => sanitizeIdentifier(null)).toThrow('non-empty string');
    expect(() => sanitizeIdentifier(undefined)).toThrow('non-empty string');
  });

  it('rejects SQL comment sequences', () => {
    expect(() => sanitizeIdentifier('db--comment')).toThrow('Invalid SQL identifier');
  });

  it('rejects parentheses', () => {
    expect(() => sanitizeIdentifier('db()')).toThrow('Invalid SQL identifier');
  });
});

describe('checkInjection', () => {
  it('passes normal search values', () => {
    expect(checkInjection('hello')).toBe('hello');
    expect(checkInjection('123')).toBe('123');
    expect(checkInjection('John Doe')).toBe('John Doe');
    expect(checkInjection('%partial%')).toBe('%partial%');
  });

  it('passes values with @ prefix (ID search)', () => {
    expect(checkInjection('@123')).toBe('@123');
    expect(checkInjection('!@456')).toBe('!@456');
  });

  it('passes values with IN() syntax (uses parameterized queries downstream)', () => {
    // Note: IN() is allowed because constructWhere handles it with parameterized queries
    expect(checkInjection('IN(1,2,3)')).toBe('IN(1,2,3)');
  });

  it('blocks SELECT keyword', () => {
    expect(() => checkInjection('test SELECT * FROM users')).toThrow('No SQL clause allowed');
    expect(() => checkInjection('select')).toThrow(/Found: select/i);
  });

  it('blocks INSERT keyword', () => {
    expect(() => checkInjection('INSERT INTO users')).toThrow('No SQL clause allowed');
  });

  it('blocks UPDATE keyword', () => {
    expect(() => checkInjection('UPDATE users SET')).toThrow('No SQL clause allowed');
  });

  it('blocks DELETE keyword', () => {
    expect(() => checkInjection('DELETE FROM users')).toThrow('No SQL clause allowed');
  });

  it('blocks DROP keyword', () => {
    expect(() => checkInjection('DROP TABLE users')).toThrow('No SQL clause allowed');
  });

  it('blocks UNION keyword', () => {
    expect(() => checkInjection('1 UNION SELECT 1')).toThrow('No SQL clause allowed');
  });

  it('blocks ALTER keyword', () => {
    expect(() => checkInjection('ALTER TABLE users')).toThrow('No SQL clause allowed');
  });

  it('blocks TRUNCATE keyword', () => {
    expect(() => checkInjection('TRUNCATE TABLE users')).toThrow('No SQL clause allowed');
  });

  it('blocks CREATE keyword', () => {
    expect(() => checkInjection('CREATE TABLE evil')).toThrow('No SQL clause allowed');
  });

  it('blocks EXEC/EXECUTE keywords', () => {
    expect(() => checkInjection('EXEC sp_evil')).toThrow('No SQL clause allowed');
    expect(() => checkInjection('EXECUTE sp_evil')).toThrow('No SQL clause allowed');
  });

  it('is case-insensitive', () => {
    expect(() => checkInjection('sElEcT * from users')).toThrow('No SQL clause allowed');
    expect(() => checkInjection('DROP table')).toThrow('No SQL clause allowed');
  });

  it('requires word boundaries (no false positives)', () => {
    // "from" inside a word should not trigger
    expect(checkInjection('information')).toBe('information');
    // "select" inside a word should not trigger
    expect(checkInjection('preselected')).toBe('preselected');
    // "table" inside a word should not trigger
    expect(checkInjection('timetable')).toBe('timetable');
    // "update" inside a word
    expect(checkInjection('autoupdate')).toBe('autoupdate');
  });

  it('returns non-string values unchanged', () => {
    expect(checkInjection(123)).toBe(123);
    expect(checkInjection(null)).toBe(null);
  });
});
