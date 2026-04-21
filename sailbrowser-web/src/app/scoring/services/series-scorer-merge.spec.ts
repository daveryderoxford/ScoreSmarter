import { describe, expect, it } from 'vitest';
import type { PublishedRace, RaceResult } from '../../published-results/model/published-race';
import type { SeriesEntry } from '../../results-input/model/series-entry';
import { ResultCode } from '../model/result-code';
import { MERGED_BOAT_CLASS_SEPARATOR, scoreSeries, ScoringConfig } from './series-scorer';
import { mergeKeyFor, type MergeStrategy } from './merge-key';

/**
 * Test fixtures for the late-merge behaviour in series scoring.
 *
 * Two key responsibilities being exercised:
 *
 * 1. `aggregateCompetitorResults` collapses per-hull RaceResults into one row
 *    per merge group, seeded from the chronologically *first* race the group
 *    appears in.
 * 2. DNC points are derived from the count of distinct *merge groups* (not
 *    per-hull entries), so a helm sailing two hulls counts once.
 */

interface ResultSeed {
  entryId: string;
  raceIndex: number;
  points: number;
  resultCode?: ResultCode;
}

function entry(over: Partial<SeriesEntry> & Pick<SeriesEntry, 'id'>): SeriesEntry {
  return {
    seriesId: 'series-1',
    helm: 'Helm',
    boatClass: 'ILCA 7',
    sailNumber: 1000,
    handicaps: [{ scheme: 'PY', value: 1100 }],
    ...over,
  };
}

function rr(seed: ResultSeed, entries: SeriesEntry[], mergeStrategy: MergeStrategy): RaceResult {
  const e = entries.find(x => x.id === seed.entryId);
  if (!e) throw new Error(`No entry for id ${seed.entryId}`);
  return {
    seriesEntryId: e.id,
    competitorKey: mergeKeyFor(e, mergeStrategy),
    rank: 1,
    boatClass: e.boatClass,
    sailNumber: e.sailNumber,
    helm: e.helm,
    crew: e.crew,
    club: e.club,
    handicap: e.handicaps[0]?.value ?? 0,
    personalHandicapBand: e.personalHandicapBand,
    laps: 1,
    startTime: new Date('2024-04-01T10:00:00Z'),
    finishTime: new Date('2024-04-01T10:30:00Z'),
    elapsedTime: 1800,
    correctedTime: 1800,
    points: seed.points,
    resultCode: seed.resultCode ?? 'OK',
  };
}

function race(
  index: number,
  seeds: ResultSeed[],
  entries: SeriesEntry[],
  mergeStrategy: MergeStrategy,
): PublishedRace {
  return {
    id: `r${index}`,
    seriesId: 'series-1',
    seriesName: 'Series',
    scheduledStart: new Date(`2024-04-0${index + 1}T10:00:00Z`),
    raceOfDay: 1,
    index,
    type: 'Handicap',
    isDiscardable: true,
    isAverageLap: false,
    results: seeds
      .filter(s => s.raceIndex === index)
      .map(s => rr(s, entries, mergeStrategy)),
  };
}

const config: ScoringConfig = { seriesType: 'short', discards: 0 };

describe("scoreSeries — strategy 'helm' (late merge)", () => {
  /**
   * One helm sails two different hulls on different days. Should appear as
   * a single series row that scores both races.
   */
  it('collapses two hulls sailed by the same helm into a single series row', () => {
    const entries: SeriesEntry[] = [
      entry({ id: 'eA', helm: 'Sam Skipper', boatClass: 'ILCA 7', sailNumber: 100 }),
      entry({ id: 'eB', helm: 'Sam Skipper', boatClass: 'RS Aero 7', sailNumber: 200 }),
      entry({ id: 'eC', helm: 'Other Person', boatClass: 'ILCA 6', sailNumber: 300 }),
    ];

    const races = [
      race(0, [
        { entryId: 'eA', raceIndex: 0, points: 1 },
        { entryId: 'eC', raceIndex: 0, points: 2 },
      ], entries, 'helm'),
      race(1, [
        { entryId: 'eB', raceIndex: 1, points: 1 },
        { entryId: 'eC', raceIndex: 1, points: 2 },
      ], entries, 'helm'),
    ];

    const results = scoreSeries(races, entries, config, 'PY', 'helm');

    expect(results).toHaveLength(2);

    const sam = results.find(r => r.helm === 'Sam Skipper')!;
    expect(sam).toBeDefined();
    expect(sam.raceScores).toHaveLength(2);
    expect(sam.raceScores.find(s => s.raceIndex === 0)?.points).toBe(1);
    expect(sam.raceScores.find(s => s.raceIndex === 1)?.points).toBe(1);
    expect(sam.totalPoints).toBe(2);
    expect(sam.boatClass).toBe(`ILCA 7${MERGED_BOAT_CLASS_SEPARATOR}RS Aero 7`);
  });

  it("seeds display fields (boatClass, sail #, handicap) from the chronologically first race the merged competitor sailed", () => {
    const entries: SeriesEntry[] = [
      entry({
        id: 'eA',
        helm: 'Sam Skipper',
        boatClass: 'ILCA 7',
        sailNumber: 100,
        handicaps: [{ scheme: 'PY', value: 1100 }],
      }),
      entry({
        id: 'eB',
        helm: 'Sam Skipper',
        boatClass: 'RS Aero 7',
        sailNumber: 200,
        handicaps: [{ scheme: 'PY', value: 1063 }],
      }),
    ];

    // Sam sails the Aero in the EARLIER race (index 0) and the ILCA in the later
    // one. Series row should reflect Aero details.
    const races = [
      race(0, [{ entryId: 'eB', raceIndex: 0, points: 1 }], entries, 'helm'),
      race(1, [{ entryId: 'eA', raceIndex: 1, points: 1 }], entries, 'helm'),
    ];

    const [row] = scoreSeries(races, entries, config, 'PY', 'helm');

    expect(row.helm).toBe('Sam Skipper');
    expect(row.boatClass).toBe(`ILCA 7${MERGED_BOAT_CLASS_SEPARATOR}RS Aero 7`);
    expect(row.sailNumber).toBe(200);
    expect(row.handicap).toBe(1063);
  });

  it('reseeds display fields from the chronologically first race even if races are passed out of order', () => {
    const entries: SeriesEntry[] = [
      entry({ id: 'eA', helm: 'Sam Skipper', boatClass: 'ILCA 7', sailNumber: 100 }),
      entry({ id: 'eB', helm: 'Sam Skipper', boatClass: 'RS Aero 7', sailNumber: 200 }),
    ];

    const races = [
      race(1, [{ entryId: 'eA', raceIndex: 1, points: 1 }], entries, 'helm'),
      race(0, [{ entryId: 'eB', raceIndex: 0, points: 1 }], entries, 'helm'),
    ];

    const [row] = scoreSeries(races, entries, config, 'PY', 'helm');
    expect(row.boatClass).toBe(`ILCA 7${MERGED_BOAT_CLASS_SEPARATOR}RS Aero 7`);
    expect(row.sailNumber).toBe(200);
  });

  it('counts each merged competitor once for DNC points', () => {
    const entries: SeriesEntry[] = [
      entry({ id: 'eA', helm: 'Sam', sailNumber: 100, boatClass: 'ILCA 7' }),
      entry({ id: 'eB', helm: 'Sam', sailNumber: 200, boatClass: 'RS Aero 7' }),
      entry({ id: 'eC', helm: 'Other', sailNumber: 300, boatClass: 'ILCA 6' }),
    ];

    // Race 0: Both sailors race. Race 1: only Sam (in his other hull).
    const races = [
      race(0, [
        { entryId: 'eA', raceIndex: 0, points: 1 },
        { entryId: 'eC', raceIndex: 0, points: 2 },
      ], entries, 'helm'),
      race(1, [{ entryId: 'eB', raceIndex: 1, points: 1 }], entries, 'helm'),
    ];

    const results = scoreSeries(races, entries, config, 'PY', 'helm');

    // 2 distinct merge groups => DNC = 3 even though there are 3 SeriesEntries.
    const other = results.find(r => r.helm === 'Other')!;
    expect(other.raceScores.find(s => s.raceIndex === 1)?.points).toBe(3);
    expect(other.raceScores.find(s => s.raceIndex === 1)?.resultCode).toBe('DNC');
  });

  it('keeps an entry that never raced as a known merge group (DNC for every race)', () => {
    const entries: SeriesEntry[] = [
      entry({ id: 'eA', helm: 'Sam', sailNumber: 100, boatClass: 'ILCA 7' }),
      entry({ id: 'eB', helm: 'Other', sailNumber: 300, boatClass: 'ILCA 6' }),
    ];

    const races = [
      race(0, [{ entryId: 'eA', raceIndex: 0, points: 1 }], entries, 'helm'),
    ];

    const results = scoreSeries(races, entries, config, 'PY', 'helm');

    // Both entries known => 2 merge groups => DNC = 3
    expect(results).toHaveLength(2);
    const other = results.find(r => r.helm === 'Other')!;
    expect(other.raceScores).toHaveLength(1);
    expect(other.raceScores[0]?.points).toBe(3);
    expect(other.raceScores[0]?.resultCode).toBe('DNC');
  });
});

describe("scoreSeries — strategy 'classSailNumber' (late merge by hull)", () => {
  it('merges different helms sharing one hull and seeds from chronologically first race', () => {
    const entries: SeriesEntry[] = [
      entry({ id: 'eA', helm: 'Crew A', boatClass: 'GP14', sailNumber: 4242 }),
      entry({ id: 'eB', helm: 'Crew B', boatClass: 'GP14', sailNumber: 4242 }),
      entry({ id: 'eC', helm: 'Crew C', boatClass: 'ILCA 7', sailNumber: 1 }),
    ];

    const races = [
      // Race 0: Crew A sails the GP14
      race(0, [
        { entryId: 'eA', raceIndex: 0, points: 1 },
        { entryId: 'eC', raceIndex: 0, points: 2 },
      ], entries, 'classSailNumber'),
      // Race 1: Crew B sails the same GP14
      race(1, [
        { entryId: 'eB', raceIndex: 1, points: 2 },
        { entryId: 'eC', raceIndex: 1, points: 1 },
      ], entries, 'classSailNumber'),
    ];

    const results = scoreSeries(races, entries, config, 'PY', 'classSailNumber');

    expect(results).toHaveLength(2);
    const gp14 = results.find(r => r.boatClass === 'GP14')!;
    // Display seeded from first race => Crew A
    expect(gp14.helm).toBe('Crew A');
    expect(gp14.sailNumber).toBe(4242);
    // Both race points present (1 + 2 = 3)
    expect(gp14.raceScores).toHaveLength(2);
    expect(gp14.totalPoints).toBe(3);
  });
});

describe("scoreSeries — strategy 'classSailNumberHelm' (no merge baseline)", () => {
  it('keeps each per-hull SeriesEntry as its own row even when helm is shared', () => {
    const entries: SeriesEntry[] = [
      entry({ id: 'eA', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100 }),
      entry({ id: 'eB', helm: 'Sam', boatClass: 'RS Aero 7', sailNumber: 200 }),
    ];

    const races = [
      race(0, [{ entryId: 'eA', raceIndex: 0, points: 1 }], entries, 'classSailNumberHelm'),
      race(1, [{ entryId: 'eB', raceIndex: 1, points: 1 }], entries, 'classSailNumberHelm'),
    ];

    const results = scoreSeries(races, entries, config, 'PY', 'classSailNumberHelm');

    // Two rows, two hulls
    expect(results).toHaveLength(2);
    const ilca = results.find(r => r.boatClass === 'ILCA 7')!;
    const aero = results.find(r => r.boatClass === 'RS Aero 7')!;
    // ILCA only sailed race 0 => DNC for race 1
    expect(ilca.raceScores.find(s => s.raceIndex === 1)?.resultCode).toBe('DNC');
    expect(aero.raceScores.find(s => s.raceIndex === 0)?.resultCode).toBe('DNC');
  });

  it('preserves per-race handicap on the per-hull row', () => {
    const entries: SeriesEntry[] = [
      entry({
        id: 'eA',
        helm: 'Sam',
        boatClass: 'ILCA 7',
        sailNumber: 100,
        handicaps: [{ scheme: 'PY', value: 1100 }],
      }),
      entry({
        id: 'eB',
        helm: 'Sam',
        boatClass: 'RS Aero 7',
        sailNumber: 200,
        handicaps: [{ scheme: 'PY', value: 1063 }],
      }),
    ];

    const races = [
      race(0, [{ entryId: 'eA', raceIndex: 0, points: 1 }], entries, 'classSailNumberHelm'),
      race(1, [{ entryId: 'eB', raceIndex: 1, points: 1 }], entries, 'classSailNumberHelm'),
    ];

    const results = scoreSeries(races, entries, config, 'PY', 'classSailNumberHelm');

    expect(results.find(r => r.boatClass === 'ILCA 7')!.handicap).toBe(1100);
    expect(results.find(r => r.boatClass === 'RS Aero 7')!.handicap).toBe(1063);
  });
});
