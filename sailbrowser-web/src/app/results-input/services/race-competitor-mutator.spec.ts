/**
 * Focused unit tests for the `SeriesEntryIdentityConflictError` shape.
 * Behaviour of merge writes lives in `@testing/race-competitor-mutator-test-harness`
 * (`race-competitor-mutator.behavior.spec.ts`) plus `FirestoreHelper` partial-mode specs.
 */
import { describe, expect, it } from 'vitest';

import { SeriesEntryIdentityConflictError } from './race-competitor-mutator';

describe('SeriesEntryIdentityConflictError', () => {
  it('preserves the colliding entry id and proposed identity for callers', () => {
    const err = new SeriesEntryIdentityConflictError('se-99', 's1', {
      helm: 'Sam',
      boatClass: 'ILCA 7',
      sailNumber: 100,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.collidingEntryId).toBe('se-99');
    expect(err.seriesId).toBe('s1');
    expect(err.identity).toEqual({ helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100 });
    expect(err.message).toContain('Sam');
    expect(err.message).toContain('100');
    expect(err.message).toContain('se-99');
  });
});
