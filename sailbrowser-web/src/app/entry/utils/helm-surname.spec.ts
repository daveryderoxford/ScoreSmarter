import { describe, expect, it } from 'vitest';
import {
  formatHelmSurnameLast,
  helmMatchesLetterRange,
  letterRangeForSurname,
  surnameOf,
} from './helm-surname';

describe('surnameOf', () => {
  it('uses the last word as surname', () => {
    expect(surnameOf('Alice Smith')).toBe('Smith');
  });

  it('uses the whole name for a single token', () => {
    expect(surnameOf('Bob')).toBe('Bob');
  });
});

describe('letterRangeForSurname', () => {
  it('buckets by first letter', () => {
    expect(letterRangeForSurname('Smith')).toBe('S-T');
    expect(letterRangeForSurname('Adams')).toBe('A-B');
    expect(letterRangeForSurname('Jones')).toBe('I-K');
    expect(letterRangeForSurname('Wilson')).toBe('U-Z');
  });
});

describe('helmMatchesLetterRange', () => {
  it('matches when no range is selected', () => {
    expect(helmMatchesLetterRange('Alice Smith', null)).toBe(true);
  });

  it('filters by range', () => {
    expect(helmMatchesLetterRange('Alice Smith', 'S-T')).toBe(true);
    expect(helmMatchesLetterRange('Alice Smith', 'A-B')).toBe(false);
  });
});

describe('formatHelmSurnameLast', () => {
  it('puts surname first', () => {
    expect(formatHelmSurnameLast('Alice Smith')).toBe('Smith, Alice');
  });

  it('returns single names unchanged', () => {
    expect(formatHelmSurnameLast('Bob')).toBe('Bob');
  });
});
