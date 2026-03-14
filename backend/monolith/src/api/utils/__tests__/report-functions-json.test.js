import { describe, it, expect } from 'vitest';
import { getJsonVal, checkJson } from '../report-functions.js';

describe('getJsonVal', () => {
  it('returns value for a direct top-level key', () => {
    const json = JSON.stringify({ name: 'Alice', age: 30 });
    expect(getJsonVal('name', json)).toBe('Alice');
  });

  it('returns JSON-encoded array for a top-level array property', () => {
    const json = JSON.stringify({ items: [1, 2, 3], other: 'x' });
    expect(getJsonVal('items', json)).toBe('[1,2,3]');
  });

  it('finds nested key via recursive walk', () => {
    const json = JSON.stringify({ data: { inner: { target: 'found' } } });
    expect(getJsonVal('target', json)).toBe('found');
  });

  it('returns first match when key appears multiple times', () => {
    const json = JSON.stringify({ a: { val: 'first' }, b: { val: 'second' } });
    expect(getJsonVal('val', json)).toBe('first');
  });

  it('returns original value when key is not found in text (case-insensitive pre-check)', () => {
    const json = JSON.stringify({ foo: 'bar' });
    expect(getJsonVal('nothere', json)).toBe(json);
  });

  it('returns original value for empty jsonKey', () => {
    const json = JSON.stringify({ a: 1 });
    expect(getJsonVal('', json)).toBe(json);
  });

  it('returns original value for invalid JSON', () => {
    expect(getJsonVal('key', 'not json {{')).toBe('not json {{');
  });

  it('returns original value for non-string val', () => {
    expect(getJsonVal('key', 42)).toBe(42);
  });

  it('handles null JSON value', () => {
    expect(getJsonVal('key', 'null')).toBe('null');
  });

  it('finds key inside array elements', () => {
    const json = JSON.stringify({ list: [{ id: 1 }, { id: 2, name: 'Bob' }] });
    expect(getJsonVal('name', json)).toBe('Bob');
  });
});

describe('checkJson', () => {
  it('extracts value for a top-level key', () => {
    const json = JSON.stringify({ status: 'ok', code: 200 });
    expect(checkJson('status', json)).toBe('ok');
  });

  it('extracts value for a nested key', () => {
    const json = JSON.stringify({ response: { data: { result: 42 } } });
    expect(checkJson('result', json)).toBe(42);
  });

  it('returns original value when key not found', () => {
    const json = JSON.stringify({ a: 1 });
    expect(checkJson('missing', json)).toBe(json);
  });

  it('returns original value for invalid JSON', () => {
    expect(checkJson('key', 'bad json')).toBe('bad json');
  });

  it('returns original value for non-string input', () => {
    expect(checkJson('key', 123)).toBe(123);
  });

  it('returns original value for null jsonKey', () => {
    const json = JSON.stringify({ a: 1 });
    expect(checkJson(null, json)).toBe(json);
  });

  it('finds key inside array elements', () => {
    const json = JSON.stringify([{ x: 10 }, { y: 20, target: 'hit' }]);
    expect(checkJson('target', json)).toBe('hit');
  });
});
