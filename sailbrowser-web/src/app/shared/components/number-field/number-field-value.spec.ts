import { describe, expect, it } from 'vitest';
import {
  coerceNumberFieldMode,
  isAllowedNumberFieldText,
  normalizeNumberFieldInsert,
  numberFieldInputMode,
  numberFieldPattern,
  replaceNumberFieldSelection,
  sanitizeNumberFieldText,
} from './number-field-value';

describe('coerceNumberFieldMode', () => {
  it('defaults bare or unknown values to integer', () => {
    expect(coerceNumberFieldMode(undefined)).toBe('integer');
    expect(coerceNumberFieldMode('')).toBe('integer');
    expect(coerceNumberFieldMode(true)).toBe('integer');
    expect(coerceNumberFieldMode('decimal')).toBe('decimal');
    expect(coerceNumberFieldMode('signedDecimal')).toBe('signedDecimal');
  });
});

describe('numberFieldInputMode and pattern', () => {
  it('uses numeric keyboards for integers and decimal otherwise', () => {
    expect(numberFieldInputMode('integer')).toBe('numeric');
    expect(numberFieldInputMode('decimal')).toBe('decimal');
    expect(numberFieldInputMode('signedDecimal')).toBe('decimal');
  });

  it('matches the HTML constraint patterns used on the existing fields', () => {
    expect(numberFieldPattern('integer')).toBe('[0-9]*');
    expect(numberFieldPattern('decimal')).toBe('[0-9]*[.]?[0-9]*');
    expect(numberFieldPattern('signedDecimal')).toBe('-?[0-9]*[.]?[0-9]*');
  });
});

describe('isAllowedNumberFieldText', () => {
  it('allows empty and digit prefixes for every mode', () => {
    expect(isAllowedNumberFieldText('', 'integer')).toBe(true);
    expect(isAllowedNumberFieldText('12', 'integer')).toBe(true);
    expect(isAllowedNumberFieldText('12a', 'integer')).toBe(false);
    expect(isAllowedNumberFieldText('1.2', 'integer')).toBe(false);
    expect(isAllowedNumberFieldText('-1', 'integer')).toBe(false);
  });

  it('allows a single decimal point while typing', () => {
    expect(isAllowedNumberFieldText('.', 'decimal')).toBe(true);
    expect(isAllowedNumberFieldText('1.', 'decimal')).toBe(true);
    expect(isAllowedNumberFieldText('.5', 'decimal')).toBe(true);
    expect(isAllowedNumberFieldText('1.2.3', 'decimal')).toBe(false);
    expect(isAllowedNumberFieldText('-1', 'decimal')).toBe(false);
  });

  it('allows a leading minus only for signedDecimal', () => {
    expect(isAllowedNumberFieldText('-', 'signedDecimal')).toBe(true);
    expect(isAllowedNumberFieldText('-.', 'signedDecimal')).toBe(true);
    expect(isAllowedNumberFieldText('-51.5', 'signedDecimal')).toBe(true);
    expect(isAllowedNumberFieldText('5-1', 'signedDecimal')).toBe(false);
    expect(isAllowedNumberFieldText('--1', 'signedDecimal')).toBe(false);
  });
});

describe('sanitizeNumberFieldText', () => {
  it('strips letters and extra punctuation', () => {
    expect(sanitizeNumberFieldText('12ab3', 'integer')).toBe('123');
    expect(sanitizeNumberFieldText('1.2.3', 'decimal')).toBe('1.23');
    expect(sanitizeNumberFieldText('lat -51.50N', 'signedDecimal')).toBe('-51.50');
  });

  it('keeps a leading minus and the first decimal only', () => {
    expect(sanitizeNumberFieldText('--12.3.4', 'signedDecimal')).toBe('-12.34');
    expect(sanitizeNumberFieldText('12,5', 'decimal')).toBe('12.5');
    expect(sanitizeNumberFieldText('12,5', 'integer')).toBe('125');
  });
});

describe('normalizeNumberFieldInsert and replaceNumberFieldSelection', () => {
  it('rewrites commas to dots except in integer mode', () => {
    expect(normalizeNumberFieldInsert(',', 'decimal')).toBe('.');
    expect(normalizeNumberFieldInsert('1,2', 'signedDecimal')).toBe('1.2');
    expect(normalizeNumberFieldInsert(',', 'integer')).toBe(',');
  });

  it('replaces the selected range', () => {
    expect(replaceNumberFieldSelection('1234', 1, 3, '9')).toBe('194');
  });
});
