/**
 * JSON Key Sorting Utility Tests (Issue #173)
 *
 * Tests for the sortKeysRecursive function and phpJsonMiddleware
 * that ensure byte-for-byte parity with PHP's json_encode() key ordering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sortKeysRecursive, jsonStringifySorted, phpJsonMiddleware } from '../jsonSortKeys.js';

describe('sortKeysRecursive', () => {
  describe('basic functionality', () => {
    it('sorts top-level object keys alphabetically', () => {
      const input = { z: 1, a: 2, m: 3, b: 4 };
      const result = sortKeysRecursive(input);

      // Note: Due to V8's numeric key handling, we check keys via iteration
      expect(result).toEqual({ a: 2, b: 4, m: 3, z: 1 });
    });

    it('sorts nested object keys alphabetically', () => {
      const input = { z: { y: 1, x: 2 }, a: 3 };
      const result = sortKeysRecursive(input);

      expect(result).toEqual({ a: 3, z: { x: 2, y: 1 } });
    });

    it('sorts deeply nested objects', () => {
      const input = {
        c: {
          f: {
            i: 3,
            h: 2,
            g: 1
          },
          e: 2,
          d: 1
        },
        b: 2,
        a: 1
      };
      const result = sortKeysRecursive(input);

      expect(result.a).toBe(1);
      expect(result.b).toBe(2);
      expect(result.c.d).toBe(1);
      expect(result.c.e).toBe(2);
      expect(result.c.f.g).toBe(1);
    });

    it('preserves array order but sorts objects within arrays', () => {
      const input = [{ b: 1, a: 2 }, { d: 3, c: 4 }];
      const result = sortKeysRecursive(input);

      expect(result).toEqual([{ a: 2, b: 1 }, { c: 4, d: 3 }]);
    });

    it('handles arrays of primitives', () => {
      const input = [3, 1, 2];
      const result = sortKeysRecursive(input);

      expect(result).toEqual([3, 1, 2]); // Array order preserved
    });

    it('handles mixed arrays with objects and primitives', () => {
      const input = [1, { z: 'a', a: 'z' }, 'string', null];
      const result = sortKeysRecursive(input);

      expect(result).toEqual([1, { a: 'z', z: 'a' }, 'string', null]);
    });
  });

  describe('edge cases', () => {
    it('handles null values', () => {
      expect(sortKeysRecursive(null)).toBe(null);
    });

    it('handles undefined values', () => {
      expect(sortKeysRecursive(undefined)).toBe(undefined);
    });

    it('handles primitive strings', () => {
      expect(sortKeysRecursive('test')).toBe('test');
    });

    it('handles primitive numbers', () => {
      expect(sortKeysRecursive(42)).toBe(42);
      expect(sortKeysRecursive(3.14)).toBe(3.14);
    });

    it('handles booleans', () => {
      expect(sortKeysRecursive(true)).toBe(true);
      expect(sortKeysRecursive(false)).toBe(false);
    });

    it('handles empty objects', () => {
      expect(sortKeysRecursive({})).toEqual({});
    });

    it('handles empty arrays', () => {
      expect(sortKeysRecursive([])).toEqual([]);
    });

    it('handles objects with null values', () => {
      const input = { b: null, a: null };
      const result = sortKeysRecursive(input);

      expect(result).toEqual({ a: null, b: null });
    });

    it('handles Date objects', () => {
      const date = new Date('2026-01-01');
      const input = { b: date, a: 'test' };
      const result = sortKeysRecursive(input);

      expect(result.b).toBeInstanceOf(Date);
    });
  });
});

describe('jsonStringifySorted', () => {
  describe('basic functionality', () => {
    it('produces JSON with alphabetically sorted keys', () => {
      const input = { b: 1, a: 2 };
      const result = jsonStringifySorted(input);

      expect(result).toBe('{"a":2,"b":1}');
    });

    it('handles nested structures', () => {
      const input = { z: { y: 1, x: 2 }, a: 3 };
      const result = jsonStringifySorted(input);

      expect(result).toBe('{"a":3,"z":{"x":2,"y":1}}');
    });

    it('supports indentation parameter', () => {
      const input = { b: 1, a: 2 };
      const result = jsonStringifySorted(input, 2);

      expect(result).toBe('{\n  "a": 2,\n  "b": 1\n}');
    });
  });

  describe('numeric string keys', () => {
    it('sorts numeric string keys alphabetically (string comparison)', () => {
      // Alphabetical string sort: "1" < "10" < "2"
      const input = { '10': 'a', '2': 'b', '1': 'c' };
      const result = jsonStringifySorted(input);

      expect(result).toBe('{"1":"c","10":"a","2":"b"}');
    });

    it('handles mixed numeric and string keys', () => {
      const input = { z: 1, '10': 2, a: 3, '2': 4 };
      const result = jsonStringifySorted(input);

      // Alphabetical: "10" < "2" < "a" < "z"
      expect(result).toBe('{"10":2,"2":4,"a":3,"z":1}');
    });

    it('sorts nested objects with numeric keys', () => {
      const input = { z: { '3': 1, '1': 2, '20': 3 }, a: 5 };
      const result = jsonStringifySorted(input);

      // Alphabetical: "1" < "20" < "3"
      expect(result).toBe('{"a":5,"z":{"1":2,"20":3,"3":1}}');
    });
  });

  describe('edge cases', () => {
    it('handles null values', () => {
      expect(jsonStringifySorted(null)).toBe('null');
    });

    it('handles undefined values', () => {
      expect(jsonStringifySorted(undefined)).toBe('null');
    });

    it('handles booleans', () => {
      expect(jsonStringifySorted(true)).toBe('true');
      expect(jsonStringifySorted(false)).toBe('false');
    });

    it('handles numbers', () => {
      expect(jsonStringifySorted(42)).toBe('42');
      expect(jsonStringifySorted(3.14)).toBe('3.14');
    });

    it('handles strings', () => {
      expect(jsonStringifySorted('test')).toBe('"test"');
      expect(jsonStringifySorted('')).toBe('""');
    });

    it('handles empty objects', () => {
      expect(jsonStringifySorted({})).toBe('{}');
    });

    it('handles empty arrays', () => {
      expect(jsonStringifySorted([])).toBe('[]');
    });

    it('handles arrays with primitives', () => {
      expect(jsonStringifySorted([1, 2, 3])).toBe('[1,2,3]');
    });

    it('handles arrays with objects', () => {
      const input = [{ b: 1, a: 2 }];
      expect(jsonStringifySorted(input)).toBe('[{"a":2,"b":1}]');
    });

    it('handles Date objects', () => {
      const date = new Date('2026-01-15T12:00:00.000Z');
      const result = jsonStringifySorted(date);
      expect(result).toBe('"2026-01-15T12:00:00.000Z"');
    });

    it('handles Infinity as null', () => {
      expect(jsonStringifySorted(Infinity)).toBe('null');
      expect(jsonStringifySorted(-Infinity)).toBe('null');
    });

    it('handles NaN as null', () => {
      expect(jsonStringifySorted(NaN)).toBe('null');
    });

    it('skips undefined values in objects', () => {
      const input = { a: 1, b: undefined, c: 3 };
      expect(jsonStringifySorted(input)).toBe('{"a":1,"c":3}');
    });

    it('handles strings with special characters', () => {
      const input = { key: 'hello\nworld\t"quoted"' };
      const result = jsonStringifySorted(input);
      expect(JSON.parse(result)).toEqual(input);
    });
  });

  describe('PHP parity examples', () => {
    it('produces predictable output for PR #172 arr_type example', () => {
      // This tests that numeric keys are sorted alphabetically, not numerically
      const nodeInput = {
        '271': '197019',
        '954': '961',
        '957': '967',
        '8772': '8775',
        '17691': '17693',
        '198016': '198018'
      };

      const result = jsonStringifySorted(nodeInput);

      // Alphabetical sort of numeric strings:
      // "17691" < "198016" < "271" < "8772" < "954" < "957"
      expect(result).toBe('{"17691":"17693","198016":"198018","271":"197019","8772":"8775","954":"961","957":"967"}');
    });

    it('produces identical JSON for nested structures', () => {
      const input = {
        reqs: {
          '194638': {
            '20': '******',
            '38': '...',
            '40': '******',
            '41': 'unidel@yandex.ru'
          }
        },
        object: [
          { id: 100, val: 'test', up: 0 }
        ]
      };

      const result = jsonStringifySorted(input);
      const parsed = JSON.parse(result);

      // Verify structure
      expect(parsed.object).toEqual([{ id: 100, up: 0, val: 'test' }]);
      expect(parsed.reqs['194638']['20']).toBe('******');

      // Verify key ordering in JSON string
      expect(result.indexOf('"object"')).toBeLessThan(result.indexOf('"reqs"'));
      expect(result.indexOf('"20"')).toBeLessThan(result.indexOf('"38"'));
    });
  });
});

describe('phpJsonMiddleware', () => {
  it('wraps res.json to sort keys and send as string', () => {
    const middleware = phpJsonMiddleware();

    const req = {};
    const sendMock = vi.fn();
    const setHeaderMock = vi.fn();
    const res = {
      send: sendMock,
      setHeader: setHeaderMock,
      json: vi.fn() // Will be overwritten
    };
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();

    // Call the wrapped json method
    res.json({ z: 1, a: 2 });

    // Verify Content-Type header was set
    expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');

    // Verify sorted JSON string was sent
    expect(sendMock).toHaveBeenCalledWith('{"a":2,"z":1}');
  });

  it('sorts nested objects through middleware', () => {
    const middleware = phpJsonMiddleware();

    const req = {};
    const sendMock = vi.fn();
    const setHeaderMock = vi.fn();
    const res = {
      send: sendMock,
      setHeader: setHeaderMock,
      json: vi.fn()
    };
    const next = vi.fn();

    middleware(req, res, next);

    res.json({
      z: { c: 1, a: 2 },
      m: [{ b: 1, a: 2 }]
    });

    // Keys should be sorted: m before z, and within objects
    expect(sendMock).toHaveBeenCalledWith('{"m":[{"a":2,"b":1}],"z":{"a":2,"c":1}}');
  });

  it('handles numeric string keys correctly', () => {
    const middleware = phpJsonMiddleware();

    const req = {};
    const sendMock = vi.fn();
    const setHeaderMock = vi.fn();
    const res = {
      send: sendMock,
      setHeader: setHeaderMock,
      json: vi.fn()
    };
    const next = vi.fn();

    middleware(req, res, next);

    res.json({ '10': 'a', '2': 'b', '1': 'c' });

    // Alphabetical string sort: "1" < "10" < "2"
    expect(sendMock).toHaveBeenCalledWith('{"1":"c","10":"a","2":"b"}');
  });
});
