/**
 * Focused unit tests for the pure helpers exported from `race-competitor-mutator.ts`
 * and for the `SeriesEntryIdentityConflictError` shape. The mutator's coupled
 * Firestore behaviour is exercised end-to-end through `RaceCompetitorEditService`
 * and `EntryService` specs using `@testing/race-competitor-mutator-test-harness`
 * (real mutator + in-memory stores + mocked `writeBatch`).
 */
import { describe, expect, it } from 'vitest';

import {
  SeriesEntryIdentityConflictError,
  firestoreDataFromRacePatch,
} from './race-competitor-mutator';

describe('firestoreDataFromRacePatch', () => {
  it('omits keys that are absent from the patch', () => {
    const data = firestoreDataFromRacePatch({});
    expect(data).toEqual({});
  });

  it('passes plain values through unchanged', () => {
    const data = firestoreDataFromRacePatch({ manualLaps: 4, resultCode: 'OCS' });
    expect(data['manualLaps']).toBe(4);
    expect(data['resultCode']).toBe('OCS');
  });

  it('translates explicit null to a Firestore deleteField sentinel', () => {
    const data = firestoreDataFromRacePatch({ manualFinishTime: null });
    // `deleteField()` returns a `FieldValue` instance — not strictly equal to
    // null and not a primitive. The mutator never lets a raw null reach the
    // wire; that's the whole point of the patch translation.
    expect(data['manualFinishTime']).not.toBeNull();
    expect(typeof data['manualFinishTime']).toBe('object');
  });

  it('round-trips a mixed patch (absent / value / null) without coupling fields', () => {
    const data = firestoreDataFromRacePatch({
      manualLaps: 7,
      manualFinishTime: null,
    });
    expect(Object.keys(data).sort()).toEqual(['manualFinishTime', 'manualLaps']);
    expect(data['manualLaps']).toBe(7);
  });
});

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
