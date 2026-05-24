import { describe, it, expect } from 'vitest';
import { Race } from '../../race-calender/model/race';
import { Series } from '../../race-calender/model/series';
import { RaceCompetitor } from '../../results-input/model/race-competitor';
import { SeriesEntry } from '../../results-input/model/series-entry';
import { ResultCode } from '../model/result-code';
import { score } from './scorer';
import { PublishedRace } from '../../published-results/model/published-race';
import { ScoringConfig } from './series-scorer';
import { mergeKeyFor } from './merge-key';
import { buildDncContext } from '../core/rules/dnc-context';

interface CompetitorSeed {
  helm: string;
  sailNumber: string;
  finishTime?: Date;
  resultCode?: ResultCode;
}

function createMockRace(id: string, index: number): Race {
  return {
    id,
    index,
    fleetId: 'fleet1',
    seriesId: 'series1',
    seriesName: 'Test Series',
    scheduledStart: new Date(),
    raceOfDay: 1,
    type: 'Handicap',
    isDiscardable: true,
    status: 'Completed',
    isAverageLap: false,
    timeInputMode: 'tod',
    dirty: false,
    resultsSheetImage: '',
  };
}

function createMockSeries(): Series {
  return {
    id: 'series1',
    seasonId: 'Season',
    archived: false,
    name: 'Test Series',
    scoringAlgorithm: 'short',
    entryAlgorithm: 'classSailNumberHelm',
    /** Many milestones for scorer tests (every 2 races from 3). */
    discards: Array.from({ length: Math.floor((200 - 3) / 2) + 1 }, (_, i) => 3 + 2 * i),
    primaryScoringConfiguration: {
      id: 'overall',
      name: 'Overall',
      type: 'Handicap',
      fleet: { id: 'fleet1', type: 'GeneralHandicap', name: 'General Handicap' },
      handicapScheme: 'PY',
    },
  };
}

function entryIdFor(c: CompetitorSeed): string {
  return `entry-${c.sailNumber}`;
}

function createMockCompetitors(raceId: string, seeds: CompetitorSeed[]): RaceCompetitor[] {
  return seeds.map((c, i) => new RaceCompetitor({
    id: `${raceId}-${c.sailNumber}-${i}`,
    raceId,
    seriesId: 'series1',
    seriesEntryId: entryIdFor(c),
    manualFinishTime: c.finishTime,
    startTime: new Date(),
    resultCode: c.resultCode ?? 'OK',
  }));
}

function buildSeriesEntries(seeds: CompetitorSeed[]): SeriesEntry[] {
  const byId = new Map<string, SeriesEntry>();
  for (const c of seeds) {
    const id = entryIdFor(c);
    if (byId.has(id)) continue;
    byId.set(id, {
      id,
      seriesId: 'series1',
      helm: c.helm,
      boatClass: 'TestClass',
      sailNumber: c.sailNumber,
      handicaps: [{ scheme: 'PY', value: 1000 }],
      tags: [],
    });
  }
  return Array.from(byId.values());
}

function distinctMergeGroups(entries: SeriesEntry[]): number {
  const keys = new Set<string>();
  for (const e of entries) {
    keys.add(mergeKeyFor(e, 'classSailNumberHelm'));
  }
  return keys.size;
}

function mergeEntries(...lists: SeriesEntry[][]): SeriesEntry[] {
  const byId = new Map<string, SeriesEntry>();
  for (const list of lists) {
    for (const e of list) {
      byId.set(e.id, e);
    }
  }
  return Array.from(byId.values());
}

describe('score (Orchestrator)', () => {
  const config: ScoringConfig = { seriesType: 'short', discards: 1, dncPoints: 3 };
  const series = createMockSeries();
  const mergeStrategy = series.entryAlgorithm;

  it('should score the first race and handle DNC points correctly when a new competitor joins later', () => {
    const race1 = createMockRace('race1', 0);
    const seeds1: CompetitorSeed[] = [
      { helm: 'Helm 1', sailNumber: '101', finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
      { helm: 'Helm 2', sailNumber: '102', finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) },
    ];
    const competitors1 = createMockCompetitors('race1', seeds1);
    let entries = buildSeriesEntries(seeds1);

    let scoredRaces: PublishedRace[] = [];
    let seriesResults;

    ({ scoredRaces, seriesResults } = score(
      race1, competitors1, scoredRaces, entries, { ...config, dncPoints: distinctMergeGroups(entries) + 1 },
      series.primaryScoringConfiguration, mergeStrategy,
    ));

    let race1Result = scoredRaces.find(r => r.id === 'race1')!;
    expect(race1Result.results.find(r => r.sailNumber === '101')?.points).toBe(1);
    expect(race1Result.results.find(r => r.sailNumber === '102')?.points).toBe(2);
    expect(seriesResults.length).toBe(2);

    const race2 = createMockRace('race2', 1);
    const seeds2: CompetitorSeed[] = [
      { helm: 'Helm 1', sailNumber: '101', finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
      { helm: 'Helm 3', sailNumber: '103', finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) },
    ];
    const competitors2 = createMockCompetitors('race2', seeds2);
    entries = mergeEntries(entries, buildSeriesEntries(seeds2));

    ({ scoredRaces, seriesResults } = score(
      race2, competitors2, scoredRaces, entries, { ...config, dncPoints: distinctMergeGroups(entries) + 1 },
      series.primaryScoringConfiguration, mergeStrategy,
    ));

    const dncPoints = 3 + 1;

    const helm2SeriesResult = seriesResults.find(r => r.sailNumber === '102')!;
    const helm2Race2Score = helm2SeriesResult.raceScores.find(rs => rs.raceIndex === 1)!;
    expect(helm2Race2Score.resultCode).toBe('DNC');
    expect(helm2Race2Score.points).toBe(dncPoints);

    const helm3SeriesResult = seriesResults.find(r => r.sailNumber === '103')!;
    const helm3Race1Score = helm3SeriesResult.raceScores.find(rs => rs.raceIndex === 0)!;
    expect(helm3Race1Score.resultCode).toBe('DNC');
    expect(helm3Race1Score.points).toBe(dncPoints);
  });

  it('should re-calculate SCP points when the number of series competitors changes', () => {
    const race1 = createMockRace('race1', 0);
    const seeds1: CompetitorSeed[] = [
      { helm: 'Helm 1', sailNumber: '101', finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
      { helm: 'Helm 2', sailNumber: '102', finishTime: new Date(new Date().getTime() + 11 * 60 * 1000), resultCode: 'SCP' },
    ];
    const competitors1 = createMockCompetitors('race1', seeds1);
    let entries = buildSeriesEntries(seeds1);

    let { scoredRaces } = score(
      race1, competitors1, [], entries, { ...config, dncPoints: distinctMergeGroups(entries) + 1 },
      series.primaryScoringConfiguration, mergeStrategy,
    );

    let race1Result = scoredRaces.find(r => r.id === 'race1')!;
    expect(race1Result.results.find(r => r.sailNumber === '102')?.points).toBe(3);

    const race2 = createMockRace('race2', 1);
    const seeds2: CompetitorSeed[] = [
      { helm: 'Helm 3', sailNumber: '103', finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) },
    ];
    const competitors2 = createMockCompetitors('race2', seeds2);
    entries = mergeEntries(entries, buildSeriesEntries(seeds2));

    ({ scoredRaces } = score(
      race2, competitors2, scoredRaces, entries, { ...config, dncPoints: distinctMergeGroups(entries) + 1 },
      series.primaryScoringConfiguration, mergeStrategy,
    ));

    race1Result = scoredRaces.find(r => r.id === 'race1')!;
    expect(race1Result.results.find(r => r.sailNumber === '102')?.points).toBe(4);
  });

  it('should update race results with points calculated from series averages (e.g., RDGA), preserving the boat\'s finishing rank', () => {
    const race1 = createMockRace('race1', 0);
    const seeds1: CompetitorSeed[] = [
      { helm: 'Helm 1', sailNumber: '101', finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) },
      { helm: 'Helm 2', sailNumber: '102', finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
    ];
    const competitors1 = createMockCompetitors('race1', seeds1);
    let entries = buildSeriesEntries(seeds1);

    let { scoredRaces } = score(
      race1, competitors1, [], entries, { ...config, dncPoints: distinctMergeGroups(entries) + 1 },
      series.primaryScoringConfiguration, mergeStrategy,
    );

    // Race 2: Helm 1 actually finishes 1st on the water (8 min, fastest) but
    // is awarded RDGA. Helm 2 finishes 2nd. The series scorer's applyIsafRedress
    // should override Helm 1's points with the series average (2, from race 1)
    // but must NOT change the rank assigned by the per-race scorer (1, by
    // finishing position). Helm 2's rank must also stay at 2.
    const race2 = createMockRace('race2', 1);
    const seeds2: CompetitorSeed[] = [
      { helm: 'Helm 1', sailNumber: '101', resultCode: 'RDGA', finishTime: new Date(new Date().getTime() + 8 * 60 * 1000) },
      { helm: 'Helm 2', sailNumber: '102', finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
    ];
    const competitors2 = createMockCompetitors('race2', seeds2);
    entries = mergeEntries(entries, buildSeriesEntries(seeds2));

    ({ scoredRaces } = score(
      race2, competitors2, scoredRaces, entries, { ...config, dncPoints: distinctMergeGroups(entries) + 1 },
      series.primaryScoringConfiguration, mergeStrategy,
    ));

    const race2Result = scoredRaces.find(r => r.id === 'race2')!;
    const helm101Race2Result = race2Result.results.find(res => res.sailNumber === '101')!;
    const helm102Race2Result = race2Result.results.find(res => res.sailNumber === '102')!;

    // RDGA writeback overrides Helm 1's race 2 points with the series-average
    // value (2 = the only ISAF-pool race for Helm 1, race 1).
    expect(helm101Race2Result.points).toBe(2);

    // Per-race rank reflects finishing position; the series writeback must
    // not change it. Without this assertion the previous calculateRanks bug
    // (re-rank from sorted points) silently passed because Helm 1 happened
    // to remain ahead of Helm 2 by points.
    expect(helm101Race2Result.rank).toBe(1);
    expect(helm102Race2Result.rank).toBe(2);
  });

  it('keeps an OOD entry at the bottom of an earlier race after series writeback rewrites its points (RRS A4.2)', () => {
    // Reproduces the user-reported failure mode at the integration level.
    // Race 1 has 3 OK finishers + an OOD competitor. Adding a later race in
    // which the OOD-marked sailor actually races triggers applyClubOod's
    // writeback for race 1; that writeback must NOT pull the OOD entry into
    // a finisher's rank slot in race 1's results array.
    const race1 = createMockRace('race1', 0);
    const seeds1: CompetitorSeed[] = [
      { helm: 'Helm 1', sailNumber: '101', finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
      { helm: 'Helm 2', sailNumber: '102', finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) },
      { helm: 'Helm 3', sailNumber: '103', finishTime: new Date(new Date().getTime() + 12 * 60 * 1000) },
      { helm: 'Helm OOD', sailNumber: '104', resultCode: 'OOD' },
    ];
    const competitors1 = createMockCompetitors('race1', seeds1);
    let entries = buildSeriesEntries(seeds1);

    let { scoredRaces } = score(
      race1, competitors1, [], entries, { ...config, dncPoints: distinctMergeGroups(entries) + 1 },
      series.primaryScoringConfiguration, mergeStrategy,
    );

    let race1Result = scoredRaces.find(r => r.id === 'race1')!;
    let oodInRace1 = race1Result.results.find(r => r.sailNumber === '104')!;

    expect(oodInRace1.rank).toBe(0);
    expect(race1Result.results[race1Result.results.length - 1].sailNumber).toBe('104');

    // Add race 2 - helm OOD now actually sails and finishes ahead of helm 1.
    const race2 = createMockRace('race2', 1);
    const seeds2: CompetitorSeed[] = [
      { helm: 'Helm 1', sailNumber: '101', finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) },
      { helm: 'Helm OOD', sailNumber: '104', finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
    ];
    const competitors2 = createMockCompetitors('race2', seeds2);
    entries = mergeEntries(entries, buildSeriesEntries(seeds2));

    ({ scoredRaces } = score(
      race2, competitors2, scoredRaces, entries, { ...config, dncPoints: distinctMergeGroups(entries) + 1 },
      series.primaryScoringConfiguration, mergeStrategy,
    ));

    // Re-fetch race 1; scorer.ts step 4 writes back the recomputed OOD pool
    // average to race 1's helm 104 results row.
    race1Result = scoredRaces.find(r => r.id === 'race1')!;
    oodInRace1 = race1Result.results.find(r => r.sailNumber === '104')!;

    expect(oodInRace1.resultCode).toBe('OOD');
    expect(oodInRace1.rank).toBe(0);
    // Most importantly: OOD remains the last entry in the array (UI order).
    expect(race1Result.results[race1Result.results.length - 1].sailNumber).toBe('104');

    // Real finishers in race 1 keep their original ranks; no rank slot is
    // consumed by the OOD entry even though its points may now coincide
    // with a real finisher's points.
    const r101 = race1Result.results.find(r => r.sailNumber === '101')!;
    const r102 = race1Result.results.find(r => r.sailNumber === '102')!;
    const r103 = race1Result.results.find(r => r.sailNumber === '103')!;
    expect(r101.rank).toBe(1);
    expect(r102.rank).toBe(2);
    expect(r103.rank).toBe(3);
  });

  it('end-to-end: MaxRaceCompetitors+1 with an OOD competitor yields DNC = 4 (not 5) for never-raced competitors', () => {
    // Full path through buildDncContext -> score(): a race with 3 OK + 1 OOD
    // must produce dncPoints = 3 + 1 = 4 under MaxRaceCompetitors+1 (NOT 5).
    // A competitor who never sails should then get DNC = 4 in their missing
    // races. If a regression re-included OOD in the per-race count, the
    // never-raced competitor would get DNC = 5 and this test would fail.
    const race1 = createMockRace('race1', 0);
    const seeds1: CompetitorSeed[] = [
      { helm: 'Helm 1', sailNumber: '101', finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
      { helm: 'Helm 2', sailNumber: '102', finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) },
      { helm: 'Helm 3', sailNumber: '103', finishTime: new Date(new Date().getTime() + 12 * 60 * 1000) },
      { helm: 'Helm OOD', sailNumber: '104', resultCode: 'OOD' },
    ];
    const competitors1 = createMockCompetitors('race1', seeds1);
    const entries = buildSeriesEntries(seeds1);

    const policyConfig = {
      racesToScore: [race1],
      config: series.primaryScoringConfiguration,
      seriesEntries: entries,
      allSeriesCompetitors: competitors1,
      mergeStrategy,
      dncPolicy: { basis: 'MaxRaceCompetitors' as const, offset: 1, excludeNeverRaced: false },
    };

    // The OOD-aware DNC resolver must filter out helm 104's OOD row before
    // counting per-race competitors.
    const { dncPoints } = buildDncContext(policyConfig);
    expect(dncPoints).toBe(4);

    // A second race with a brand-new competitor makes the never-raced DNC
    // visible in the series results for the helms who didn't sail it.
    const race2 = createMockRace('race2', 1);
    const seeds2: CompetitorSeed[] = [
      { helm: 'Helm 5', sailNumber: '105', finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) },
    ];
    const competitors2 = createMockCompetitors('race2', seeds2);
    const allEntries = mergeEntries(entries, buildSeriesEntries(seeds2));
    const allCompetitors = [...competitors1, ...competitors2];

    // Recompute dncPoints across both races. r1 filtered = 3, r2 filtered = 1
    // => max = 3, + offset 1 = 4. OOD still excluded.
    const { dncPoints: dncPointsBoth } = buildDncContext({
      ...policyConfig,
      racesToScore: [race1, race2],
      seriesEntries: allEntries,
      allSeriesCompetitors: allCompetitors,
    });
    expect(dncPointsBoth).toBe(4);

    let { scoredRaces } = score(
      race1, competitors1, [], allEntries, { ...config, dncPoints: dncPointsBoth },
      series.primaryScoringConfiguration, mergeStrategy,
    );

    let seriesResults;
    ({ scoredRaces, seriesResults } = score(
      race2, competitors2, scoredRaces, allEntries, { ...config, dncPoints: dncPointsBoth },
      series.primaryScoringConfiguration, mergeStrategy,
    ));

    // Helm 5 didn't sail race 1 -> DNC for race 1 must reflect the
    // OOD-excluded count (4), not 5.
    const helm5SeriesResult = seriesResults.find(r => r.sailNumber === '105')!;
    const helm5Race1 = helm5SeriesResult.raceScores.find(rs => rs.raceIndex === 0)!;
    expect(helm5Race1.resultCode).toBe('DNC');
    expect(helm5Race1.points).toBe(4);

    // Helms 1-3 didn't sail race 2 -> they also get DNC = 4 there.
    for (const sn of ['101', '102', '103']) {
      const helm = seriesResults.find(r => r.sailNumber === sn)!;
      const race2Score = helm.raceScores.find(rs => rs.raceIndex === 1)!;
      expect(race2Score.resultCode).toBe('DNC');
      expect(race2Score.points).toBe(4);
    }
  });
});
