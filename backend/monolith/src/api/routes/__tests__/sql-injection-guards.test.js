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

  it('requires word boundaries (no false positives on substrings)', () => {
    // "from" inside a word should not trigger
    expect(checkInjection('information')).toBe('information');
    // "select" inside a word should not trigger
    expect(checkInjection('preselected')).toBe('preselected');
    // "table" inside a word should not trigger
    expect(checkInjection('timetable')).toBe('timetable');
    // "update" inside a word
    expect(checkInjection('autoupdate')).toBe('autoupdate');
    // "where" inside a word
    expect(checkInjection('somewhere')).toBe('somewhere');
    expect(checkInjection('anywhere')).toBe('anywhere');
    // "union" inside a word
    expect(checkInjection('reunion')).toBe('reunion');
    expect(checkInjection('communion')).toBe('communion');
    // "create" inside a word
    expect(checkInjection('recreate')).toBe('recreate');
    // "delete" inside a word
    expect(checkInjection('undelete')).toBe('undelete');
    // "into" inside a word
    expect(checkInjection('Manitowoc')).toBe('Manitowoc');
    // "drop" inside a word
    expect(checkInjection('raindrop')).toBe('raindrop');
    expect(checkInjection('droplet')).toBe('droplet');
    // "alter" inside a word
    expect(checkInjection('alternatively')).toBe('alternatively');
    // "exec" inside a word
    expect(checkInjection('executor')).toBe('executor');
    // "insert" inside a word
    expect(checkInjection('reinserted')).toBe('reinserted');
    // "truncate" inside a word
    expect(checkInjection('untruncated')).toBe('untruncated');
  });

  it('detects all 15 expanded keywords as whole words', () => {
    const keywords = [
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP',
      'ALTER', 'UNION', 'FROM', 'TABLE', 'WHERE',
      'INTO', 'EXEC', 'EXECUTE', 'CREATE', 'TRUNCATE',
    ];
    for (const kw of keywords) {
      expect(() => checkInjection(`test ${kw} something`)).toThrow('No SQL clause allowed');
    }
  });

  it('is case-insensitive for all keywords', () => {
    const keywords = [
      'select', 'INSERT', 'UpDaTe', 'dElEtE', 'Drop',
      'aLtEr', 'Union', 'from', 'TABLE', 'Where',
      'iNtO', 'exec', 'Execute', 'CREATE', 'truncate',
    ];
    for (const kw of keywords) {
      expect(() => checkInjection(kw)).toThrow('No SQL clause allowed');
    }
  });

  describe('strictMode (PHP-compatible 3-keyword list)', () => {
    it('blocks the original PHP keywords: FROM, SELECT, TABLE', () => {
      expect(() => checkInjection('FROM users', { strictMode: true })).toThrow('No SQL clause allowed');
      expect(() => checkInjection('SELECT *', { strictMode: true })).toThrow('No SQL clause allowed');
      expect(() => checkInjection('TABLE foo', { strictMode: true })).toThrow('No SQL clause allowed');
    });

    it('allows keywords not in the PHP 3-keyword list', () => {
      expect(checkInjection('DELETE something', { strictMode: true })).toBe('DELETE something');
      expect(checkInjection('DROP something', { strictMode: true })).toBe('DROP something');
      expect(checkInjection('UNION something', { strictMode: true })).toBe('UNION something');
      expect(checkInjection('WHERE something', { strictMode: true })).toBe('WHERE something');
      expect(checkInjection('INSERT something', { strictMode: true })).toBe('INSERT something');
      expect(checkInjection('UPDATE something', { strictMode: true })).toBe('UPDATE something');
    });

    it('defaults to expanded list when strictMode is not set', () => {
      expect(() => checkInjection('DELETE something')).toThrow('No SQL clause allowed');
      expect(() => checkInjection('UNION something')).toThrow('No SQL clause allowed');
    });
  });

  it('returns non-string values unchanged', () => {
    expect(checkInjection(123)).toBe(123);
    expect(checkInjection(null)).toBe(null);
  });
});
