import { describe, expect, it } from 'vitest';
import { findHelmNameMatch, helmNamesEqual, normalizeHelmName, surnameOf } from './helm-name';

const find = (scanned: string | undefined, names: string[]) =>
  findHelmNameMatch(scanned, names, n => n);

describe('helm-name', () => {
  describe('normalizeHelmName', () => {
    it('lower-cases, removes punctuation and collapses whitespace', () => {
      expect(normalizeHelmName('  J.  Smith ')).toBe('j smith');
      expect(normalizeHelmName("O'Brien, Pat")).toBe('o brien pat');
    });

    it('removes accents', () => {
      expect(normalizeHelmName('Zoë Brontë')).toBe('zoe bronte');
    });

    it('returns an empty string for missing names', () => {
      expect(normalizeHelmName(undefined)).toBe('');
      expect(normalizeHelmName('  ')).toBe('');
    });
  });

  describe('helmNamesEqual', () => {
    it('ignores case, accents and spacing', () => {
      expect(helmNamesEqual('Zoe  SMITH', 'zoë smith')).toBe(true);
    });

    it('is false for empty names', () => {
      expect(helmNamesEqual('', '')).toBe(false);
    });
  });

  describe('surnameOf', () => {
    it('returns the last word', () => {
      expect(surnameOf('Alice Jane Smith')).toBe('Smith');
      expect(surnameOf('Smith')).toBe('Smith');
    });
  });

  describe('findHelmNameMatch', () => {
    const helms = ['John Smith', 'Jane Doe', 'Peter Jones'];

    it('matches the same name', () => {
      expect(find('john  smith', helms)).toBe('John Smith');
    });

    it('matches an initial and surname in either order', () => {
      expect(find('J Smith', helms)).toBe('John Smith');
      expect(find('J. Smith', helms)).toBe('John Smith');
      expect(find('Smith J', helms)).toBe('John Smith');
      expect(find('Smith, John', helms)).toBe('John Smith');
    });

    it('matches a shortened forename', () => {
      expect(find('Pete Jones', helms)).toBe('Peter Jones');
    });

    it('does not match a different forename with the same surname', () => {
      expect(find('Jane Smith', helms)).toBeUndefined();
    });

    it('matches a surname alone', () => {
      expect(find('Doe', helms)).toBe('Jane Doe');
    });

    it('matches a minor misspelling', () => {
      expect(find('Jon Smith', helms)).toBe('John Smith');
      expect(find('Peter Jomes', helms)).toBe('Peter Jones');
      expect(find('Jaen Doe', helms)).toBe('Jane Doe');
    });

    it('does not match a name with several spelling differences', () => {
      expect(find('Jim Smyth', helms)).toBeUndefined();
    });

    it('prefers an exact match over a looser one', () => {
      expect(find('Jane Smith', ['John Smith', 'Jane Smith'])).toBe('Jane Smith');
    });

    it('returns nothing when the matching rule is ambiguous', () => {
      expect(find('J Smith', ['John Smith', 'Jane Smith'])).toBeUndefined();
      expect(find('Smith', ['John Smith', 'Jane Smith'])).toBeUndefined();
    });

    it('returns nothing for an empty scanned name', () => {
      expect(find('', helms)).toBeUndefined();
      expect(find(undefined, helms)).toBeUndefined();
    });
  });
});
