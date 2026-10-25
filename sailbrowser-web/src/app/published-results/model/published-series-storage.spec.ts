import { describe, expect, it } from 'vitest';
import type { PublishedSeriesResult } from './published-series';
import { compactSeriesResults, expandSeriesResult } from './published-series-storage';

function competitor(extra: Partial<PublishedSeriesResult> = {}): PublishedSeriesResult {
  return {
    competitorKey: 'k1',
    seriesEntryId: 'e1',
    rank: 1,
    helm: 'Sam',
    boatClass: 'ILCA 7',
    sailNumber: '123',
    club: 'IBRSC',
    handicap: 1100,
    handicapScheme: 'PY',
    totalPoints: 4,
    netPoints: 3,
    raceScores: [
      { raceIndex: 1, points: 1, resultCode: 'OK', isDiscard: false },
      { raceIndex: 2, points: 3, resultCode: 'DNC', isDiscard: true, notes: 'note' },
    ],
    scoresForTiebreak: [1, 3],
    divisions: [],
    ...extra,
  };
}

describe('published series storage', () => {
  it('leaves out OK result codes, false discards, tie-break scores and unset fields', () => {
    const [stored] = compactSeriesResults([competitor({ crew: undefined, boatName: null as unknown as string })]);

    expect(stored.raceScores).toEqual([
      { raceIndex: 1, points: 1 },
      { raceIndex: 2, points: 3, resultCode: 'DNC', isDiscard: true, notes: 'note' },
    ]);
    expect('scoresForTiebreak' in stored).toBe(false);
    expect('crew' in stored).toBe(false);
    expect('boatName' in stored).toBe(false);
  });

  it('restores the full row when read back', () => {
    const original = competitor();
    const [stored] = compactSeriesResults([original]);

    expect(expandSeriesResult(stored)).toEqual({ ...original, scoresForTiebreak: [] });
  });

  it('reads rows stored in the older full form unchanged', () => {
    const original = competitor();
    expect(expandSeriesResult(original)).toEqual(original);
  });
});
