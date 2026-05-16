import { describe, expect, it } from 'vitest';
import { DncCalculation } from 'app/club-tenant/model/club';
import { PublishedRace } from '../../published-results/model/published-race';
import { SeriesEntry } from '../../results-input/model/series-entry';
import { computeDncPoints } from './dnc-policy';
import { mergeKeyFor, type MergeStrategy } from './merge-key';

function entry(id: string, helm: string, sailNumber: number, boatClass = 'ILCA 7'): SeriesEntry {
  return {
    id,
    seriesId: 'series-1',
    helm,
    boatClass,
    sailNumber,
    handicaps: [{ scheme: 'PY', value: 1100 }],
    tags: [],
  };
}

function race(index: number, entries: SeriesEntry[], strategy: MergeStrategy): PublishedRace {
  return {
    id: `race-${index}`,
    index,
    seriesId: 'series-1',
    seriesName: 'Series',
    scheduledStart: new Date('2025-01-01T10:00:00Z'),
    raceOfDay: 1,
    type: 'Handicap',
    isDiscardable: true,
    isAverageLap: false,
    tagDefinitions: [],
    results: entries.map((e, i) => ({
      seriesEntryId: e.id,
      competitorKey: mergeKeyFor(e, strategy),
      rank: i + 1,
      boatClass: e.boatClass,
      sailNumber: e.sailNumber,
      helm: e.helm,
      crew: '',
      club: '',
      personalHandicapBand: undefined,
      handicap: 1100,
      laps: 1,
      startTime: new Date('2025-01-01T10:00:00Z'),
      finishTime: new Date('2025-01-01T11:00:00Z'),
      elapsedTime: 3600,
      correctedTime: 3600,
      points: i + 1,
      resultCode: 'OK' as const,
      tags: [],
    })),
  };
}

describe('computeDncPoints', () => {
  const strategy: MergeStrategy = 'classSailNumberHelm';
  const entries = [
    entry('e1', 'Helm 1', 101),
    entry('e2', 'Helm 2', 102),
    entry('e3', 'Helm 3', 103),
  ];

  it('computes SeriesEntries + 1', () => {
    const policy: DncCalculation = { basis: 'SeriesEntries', offset: 1, excludeNeverRaced: false };
    expect(computeDncPoints(policy, [race(0, entries.slice(0, 2), strategy)], entries, strategy)).toBe(4);
  });

  it('computes SeriesEntries + 2', () => {
    const policy: DncCalculation = { basis: 'SeriesEntries', offset: 2, excludeNeverRaced: false };
    expect(computeDncPoints(policy, [race(0, entries.slice(0, 2), strategy)], entries, strategy)).toBe(5);
  });

  it('computes MaxRaceCompetitors + 1', () => {
    const policy: DncCalculation = { basis: 'MaxRaceCompetitors', offset: 1, excludeNeverRaced: false };
    const races: PublishedRace[] = [
      race(0, entries.slice(0, 2), strategy),
      race(1, entries.slice(0, 3), strategy),
    ];
    expect(computeDncPoints(policy, races, entries, strategy)).toBe(4);
  });

  it('computes MaxRaceCompetitors + 2', () => {
    const policy: DncCalculation = { basis: 'MaxRaceCompetitors', offset: 2, excludeNeverRaced: false };
    const races: PublishedRace[] = [
      race(0, entries.slice(0, 2), strategy),
      race(1, entries.slice(0, 3), strategy),
    ];
    expect(computeDncPoints(policy, races, entries, strategy)).toBe(5);
  });

  it('excludes never-raced competitors from SeriesEntries basis', () => {
    const policy: DncCalculation = { basis: 'SeriesEntries', offset: 1, excludeNeverRaced: true };
    expect(computeDncPoints(policy, [race(0, entries.slice(0, 2), strategy)], entries, strategy)).toBe(3);
  });

  it('returns offset floor when no competitors raced', () => {
    const policy: DncCalculation = { basis: 'MaxRaceCompetitors', offset: 2, excludeNeverRaced: true };
    expect(computeDncPoints(policy, [], [], strategy)).toBe(2);
  });
});
