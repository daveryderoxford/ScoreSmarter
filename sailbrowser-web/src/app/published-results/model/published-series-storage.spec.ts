import { describe, expect, it } from 'vitest';
import type { PublishedSeries, PublishedSeriesResult } from './published-series';
import { compactPublishedSeries, expandPublishedSeries, type StoredPublishedSeries } from './published-series-storage';

type Score = PublishedSeriesResult['raceScores'][number];
const ok = (raceIndex: number, points: number, isDiscard = false): Score => ({ raceIndex, points, resultCode: 'OK', isDiscard });
const dnc = (raceIndex: number, isDiscard = false, points = 15): Score => ({ raceIndex, points, resultCode: 'DNC', isDiscard });

function competitor(key: string, raceScores: Score[], extra: Partial<PublishedSeriesResult> = {}): PublishedSeriesResult {
  return {
    competitorKey: key,
    seriesEntryId: key,
    rank: 1,
    helm: key,
    boatClass: 'ILCA 7',
    sailNumber: '1',
    club: 'IBRSC',
    handicap: 1100,
    handicapScheme: 'PY',
    totalPoints: 0,
    netPoints: 0,
    raceScores,
    scoresForTiebreak: [1, 2],
    divisions: [],
    ...extra,
  };
}

function series(competitors: PublishedSeriesResult[], raceNumbers = [1, 2, 3]): PublishedSeries {
  return {
    id: 's1',
    name: 'Saturday',
    fleetId: 'f',
    competitors,
    divisionDefinitions: [],
    raceStarts: raceNumbers.map(index => ({ index, scheduledStart: new Date(2026, 5, index) })),
  };
}

const withoutTiebreak = (s: PublishedSeries) => ({
  ...s,
  competitors: s.competitors.map(c => ({ ...c, scoresForTiebreak: [] })),
});

describe('published series storage', () => {
  const alex = competitor('alex', [ok(1, 1), dnc(2, true), { raceIndex: 3, points: 4, resultCode: 'DNF', isDiscard: false, notes: 'gear' }]);
  const sam = competitor('sam', [dnc(1), dnc(2, true), ok(3, 2)], { crew: undefined });

  it('leaves out DNC scores, OK codes, discard flags and tie-break scores', () => {
    const stored = compactPublishedSeries(series([alex, sam]));

    expect(stored.dncPoints).toBe(15);
    expect(stored.competitors[0].raceScores).toEqual([
      { raceIndex: 1, points: 1 },
      { raceIndex: 3, points: 4, resultCode: 'DNF', notes: 'gear' },
    ]);
    expect(stored.competitors[0].discardedRaces).toEqual([2]);
    expect(stored.competitors[1].raceScores).toEqual([{ raceIndex: 3, points: 2 }]);
    expect('scoresForTiebreak' in stored.competitors[0]).toBe(false);
    expect('crew' in stored.competitors[1]).toBe(false);
  });

  it('restores every race score when read back', () => {
    const original = series([alex, sam]);
    expect(expandPublishedSeries(compactPublishedSeries(original))).toEqual(withoutTiebreak(original));
  });

  it('keeps DNC scores whose points differ from the series DNC points', () => {
    const odd = competitor('odd', [dnc(1, false, 9), dnc(2), dnc(3)]);
    const original = series([odd, sam]);
    const stored = compactPublishedSeries(original);

    expect(stored.competitors[0].raceScores).toEqual([{ raceIndex: 1, points: 9, resultCode: 'DNC' }]);
    expect(expandPublishedSeries(stored)).toEqual(withoutTiebreak(original));
  });

  it('keeps DNC scores when rows do not line up with the race list', () => {
    const short = competitor('short', [ok(1, 1), dnc(2)]);
    const original = series([short, sam]);
    const stored = compactPublishedSeries(original);

    expect(stored.dncPoints).toBeUndefined();
    expect(stored.competitors[0].raceScores).toHaveLength(2);
    expect(expandPublishedSeries(stored)).toEqual(withoutTiebreak(original));
  });

  it('keeps DNC scores for series published without race starts', () => {
    const original = { ...series([alex]), raceStarts: undefined };
    expect(compactPublishedSeries(original).dncPoints).toBeUndefined();
    expect(expandPublishedSeries(compactPublishedSeries(original))).toEqual(withoutTiebreak(original));
  });

  it('reads documents in the older full and per-score discard formats', () => {
    const full = series([alex]);
    expect(expandPublishedSeries(full as unknown as StoredPublishedSeries)).toEqual(full);

    const perScoreDiscards = {
      ...full,
      competitors: [{ ...alex, raceScores: [{ raceIndex: 1, points: 1 }, { raceIndex: 2, points: 15, resultCode: 'DNC', isDiscard: true }] }],
    } as unknown as StoredPublishedSeries;
    expect(expandPublishedSeries(perScoreDiscards).competitors[0].raceScores).toEqual([ok(1, 1), dnc(2, true)]);
  });
});
