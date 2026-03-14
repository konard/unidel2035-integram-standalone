import { describe, it, expect } from 'vitest';
import { localize } from './legacy-compat.js';

describe('localize', () => {
  it('returns text unchanged when no <t9n> tags present', () => {
    expect(localize('Hello world', 'EN')).toBe('Hello world');
  });

  it('returns empty string for null/undefined input', () => {
    expect(localize(null, 'EN')).toBe('');
    expect(localize(undefined, 'EN')).toBe('');
    expect(localize('', 'EN')).toBe('');
  });

  it('extracts correct locale from a basic t9n block', () => {
    const text = '<t9n>[RU]Привет[EN]Hello</t9n>';
    expect(localize(text, 'EN')).toBe('Hello');
    expect(localize(text, 'RU')).toBe('Привет');
  });

  it('handles three or more locales', () => {
    const text = '<t9n>[RU]Привет[EN]Hello[DE]Hallo</t9n>';
    expect(localize(text, 'EN')).toBe('Hello');
    expect(localize(text, 'RU')).toBe('Привет');
    expect(localize(text, 'DE')).toBe('Hallo');
  });

  it('handles multiple t9n blocks in one string', () => {
    const text = 'Label: <t9n>[RU]Имя[EN]Name</t9n> Value: <t9n>[RU]Значение[EN]Value</t9n>';
    expect(localize(text, 'EN')).toBe('Label: Name Value: Value');
    expect(localize(text, 'RU')).toBe('Label: Имя Value: Значение');
  });

  it('returns empty for missing locale (falls back gracefully)', () => {
    const text = '<t9n>[RU]Привет[EN]Hello</t9n>';
    expect(localize(text, 'FR')).toBe('');
  });

  it('strips unmatched t9n block when locale is missing among other text', () => {
    const text = 'Before <t9n>[RU]Привет[EN]Hello</t9n> After';
    expect(localize(text, 'FR')).toBe('Before  After');
  });

  it('handles multiline content inside t9n blocks', () => {
    const text = '<t9n>[RU]Строка 1\nСтрока 2[EN]Line 1\nLine 2</t9n>';
    expect(localize(text, 'EN')).toBe('Line 1\nLine 2');
    expect(localize(text, 'RU')).toBe('Строка 1\nСтрока 2');
  });

  it('defaults locale to EN when not provided', () => {
    const text = '<t9n>[RU]Привет[EN]Hello</t9n>';
    expect(localize(text, null)).toBe('Hello');
    expect(localize(text, undefined)).toBe('Hello');
  });

  it('is case-insensitive for locale parameter', () => {
    const text = '<t9n>[RU]Привет[EN]Hello</t9n>';
    expect(localize(text, 'en')).toBe('Hello');
    expect(localize(text, 'En')).toBe('Hello');
  });

  it('handles nested brackets in content (non-locale brackets)', () => {
    const text = '<t9n>[EN]Value [units][RU]Значение [единицы]</t9n>';
    // The content after [EN] up to [RU] should be extracted
    expect(localize(text, 'EN')).toBe('Value [units]');
  });

  it('handles t9n block with surrounding HTML', () => {
    const text = '<div><t9n>[RU]Привет[EN]Hello</t9n></div>';
    expect(localize(text, 'EN')).toBe('<div>Hello</div>');
  });

  it('handles locale as last entry without trailing bracket', () => {
    const text = '<t9n>[EN]Only English</t9n>';
    expect(localize(text, 'EN')).toBe('Only English');
  });

  it('handles empty locale content', () => {
    const text = '<t9n>[RU][EN]Hello</t9n>';
    expect(localize(text, 'RU')).toBe('');
  });
});
