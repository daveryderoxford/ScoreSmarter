import { describe, expect, it } from 'vitest';
import { toFirebaseId } from './firebase-id';

describe('toFirebaseId', () => {
  it('lowercases and replaces whitespace and invalid characters', () => {
    expect(toFirebaseId('B-ILCA 7-GBR 123/45')).toBe('b-ilca-7-gbr-123-45');
  });

  it('collapses repeated separators', () => {
    expect(toFirebaseId('  foo   bar!!  ')).toBe('foo-bar');
  });

  it('returns empty for whitespace-only input', () => {
    expect(toFirebaseId('   ')).toBe('');
  });
});
