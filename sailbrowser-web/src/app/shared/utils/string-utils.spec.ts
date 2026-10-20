import { describe, expect, it } from 'vitest';
import { normaliseWhitespace } from './string-utils';

describe('normaliseWhitespace', () => {
  it('trims and collapses runs of whitespace to one space', () => {
    expect(normaliseWhitespace('  Fusion   2 ')).toBe('Fusion 2');
    expect(normaliseWhitespace('RS\tFeva\u00a0 XL\n')).toBe('RS Feva XL');
  });

  it('returns an empty string for missing values', () => {
    expect(normaliseWhitespace(undefined)).toBe('');
    expect(normaliseWhitespace(null)).toBe('');
    expect(normaliseWhitespace('   ')).toBe('');
  });
});
