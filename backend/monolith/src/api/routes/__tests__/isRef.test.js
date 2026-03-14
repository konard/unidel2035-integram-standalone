import { describe, it, expect } from 'vitest';
import { isRef } from '../legacy-compat.js';

describe('isRef', () => {
  it('returns the reference target type when typ exists in report.refTyp', () => {
    const report = { id: 1, parentType: 10, refTyp: { '5': 42 } };
    expect(isRef(report, 5)).toBe(42);
  });

  it('works when typ is passed as a string', () => {
    const report = { id: 1, parentType: 10, refTyp: { '5': 42 } };
    expect(isRef(report, '5')).toBe(42);
  });

  it('returns false when typ is not in report.refTyp', () => {
    const report = { id: 1, parentType: 10, refTyp: { '5': 42 } };
    expect(isRef(report, 99)).toBe(false);
  });

  it('returns false when report.refTyp is missing', () => {
    const report = { id: 1, parentType: 10 };
    expect(isRef(report, 5)).toBe(false);
  });

  it('returns false when report is null', () => {
    expect(isRef(null, 5)).toBe(false);
  });

  it('returns false when report is undefined', () => {
    expect(isRef(undefined, 5)).toBe(false);
  });

  it('returns 0 (falsy but not false) when refTyp value is 0', () => {
    const report = { id: 1, parentType: 10, refTyp: { '7': 0 } };
    // The value exists so it should be returned, even though it is 0
    expect(isRef(report, 7)).toBe(0);
  });

  it('handles multiple entries in refTyp', () => {
    const report = {
      id: 1,
      parentType: 10,
      refTyp: { '3': 100, '5': 200, '8': 300 },
    };
    expect(isRef(report, 3)).toBe(100);
    expect(isRef(report, 5)).toBe(200);
    expect(isRef(report, 8)).toBe(300);
    expect(isRef(report, 99)).toBe(false);
  });
});
