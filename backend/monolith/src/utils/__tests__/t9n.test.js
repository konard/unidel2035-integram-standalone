/**
 * t9n() — i18n translation function tests (Issue #253)
 *
 * Tests for dictionary-based and PHP-compatible inline translation modes.
 */

import { describe, it, expect } from 'vitest';
import { t9n } from '../t9n.js';

describe('t9n — i18n translation function', () => {
  describe('dictionary mode', () => {
    it('returns English message by default', () => {
      expect(t9n('invalid_database')).toBe('Invalid database');
    });

    it('returns Russian message when locale is RU', () => {
      expect(t9n('invalid_database', 'RU')).toBe('Неверная база данных');
    });

    it('returns English message when locale is EN', () => {
      expect(t9n('auth_failed', 'EN')).toBe('Authentication failed');
    });

    it('locale is case-insensitive', () => {
      expect(t9n('invalid_database', 'ru')).toBe('Неверная база данных');
      expect(t9n('invalid_database', 'en')).toBe('Invalid database');
    });

    it('unknown key returns key as-is', () => {
      expect(t9n('some_unknown_key')).toBe('some_unknown_key');
      expect(t9n('some_unknown_key', 'RU')).toBe('some_unknown_key');
    });

    it('empty/null key returns empty string', () => {
      expect(t9n('')).toBe('');
      expect(t9n(null)).toBe('');
      expect(t9n(undefined)).toBe('');
    });
  });

  describe('inline mode (PHP compat)', () => {
    it('extracts RU text', () => {
      expect(t9n('[RU]Текст[EN]Text', 'RU')).toBe('Текст');
    });

    it('extracts EN text', () => {
      expect(t9n('[RU]Текст[EN]Text', 'EN')).toBe('Text');
    });

    it('extracts text when locale is last segment', () => {
      expect(t9n('[RU]Русский[EN]English', 'EN')).toBe('English');
    });

    it('returns original when locale not found', () => {
      expect(t9n('[RU]Текст[EN]Text', 'DE')).toBe('[RU]Текст[EN]Text');
    });

    it('handles multiline content', () => {
      const msg = '[RU]Строка 1\nСтрока 2[EN]Line 1\nLine 2';
      expect(t9n(msg, 'RU')).toBe('Строка 1\nСтрока 2');
      expect(t9n(msg, 'EN')).toBe('Line 1\nLine 2');
    });
  });

  describe('common dictionary keys', () => {
    it.each([
      ['not_logged', 'EN', 'not logged'],
      ['not_logged', 'RU', 'Не авторизован'],
      ['password_too_short', 'EN', 'Password must be at least 6 characters'],
      ['password_too_short', 'RU', 'Пароль должен быть не менее 6 символов'],
      ['server_error', 'EN', 'server error'],
      ['server_error', 'RU', 'Ошибка сервера'],
      ['object_not_found', 'EN', 'Object not found'],
      ['object_not_found', 'RU', 'Объект не найден'],
      ['insufficient_privileges', 'EN', 'Insufficient privileges'],
      ['insufficient_privileges', 'RU', 'Недостаточно прав'],
    ])('t9n(%s, %s) → %s', (key, lang, expected) => {
      expect(t9n(key, lang)).toBe(expected);
    });
  });
});
