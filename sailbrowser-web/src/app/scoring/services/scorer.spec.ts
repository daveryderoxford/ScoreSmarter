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

interface CompetitorSeed {
  helm: string;
  sailNumber: number;
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
    initialDiscardAfter: 3,
    subsequentDiscardsEveryN: 2,
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
  const config: ScoringConfig = { seriesType: 'short', discards: 1 };
  const series = createMockSeries();
  const mergeStrategy = series.entryAlgorithm;

  it('should score the first race and handle DNC points correctly when a new competitor joins later', () => {
    const race1 = createMockRace('race1', 0);
    const seeds1: CompetitorSeed[] = [
      { helm: 'Helm 1', sailNumber: 101, finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
      { helm: 'Helm 2', sailNumber: 102, finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) },
    ];
    const competitors1 = createMockCompetitors('race1', seeds1);
    let entries = buildSeriesEntries(seeds1);

    let scoredRaces: PublishedRace[] = [];
    let seriesResults;

    ({ scoredRaces, seriesResults } = score(
      race1, competitors1, scoredRaces, entries, config,
      series.primaryScoringConfiguration, mergeStrategy, distinctMergeGroups(entries),
    ));

    let race1Result = scoredRaces.find(r => r.id === 'race1')!;
    expect(race1Result.results.find(r => r.sailNumber === 101)?.points).toBe(1);
    expect(race1Result.results.find(r => r.sailNumber === 102)?.points).toBe(2);
    expect(seriesResults.length).toBe(2);

    const race2 = createMockRace('race2', 1);
    const seeds2: CompetitorSeed[] = [
      { helm: 'Helm 1', sailNumber: 101, finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
      { helm: 'Helm 3', sailNumber: 103, finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) },
    ];
    const competitors2 = createMockCompetitors('race2', seeds2);
    entries = mergeEntries(entries, buildSeriesEntries(seeds2));

    ({ scoredRaces, seriesResults } = score(
      race2, competitors2, scoredRaces, entries, config,
      series.primaryScoringConfiguration, mergeStrategy, distinctMergeGroups(entries),
    ));

    const dncPoints = 3 + 1;

    const helm2SeriesResult = seriesResults.find(r => r.sailNumber === 102)!;
    const helm2Race2Score = helm2SeriesResult.raceScores.find(rs => rs.raceIndex === 1)!;
    expect(helm2Race2Score.resultCode).toBe('DNC');
    expect(helm2Race2Score.points).toBe(dncPoints);

    const helm3SeriesResult = seriesResults.find(r => r.sailNumber === 103)!;
    const helm3Race1Score = helm3SeriesResult.raceScores.find(rs => rs.raceIndex === 0)!;
    expect(helm3Race1Score.resultCode).toBe('DNC');
    expect(helm3Race1Score.points).toBe(dncPoints);
  });

  it('should re-calculate SCP points when the number of series competitors changes', () => {
    const race1 = createMockRace('race1', 0);
    const seeds1: CompetitorSeed[] = [
      { helm: 'Helm 1', sailNumber: 101, finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
      { helm: 'Helm 2', sailNumber: 102, finishTime: new Date(new Date().getTime() + 11 * 60 * 1000), resultCode: 'SCP' },
    ];
    const competitors1 = createMockCompetitors('race1', seeds1);
    let entries = buildSeriesEntries(seeds1);

    let { scoredRaces } = score(
      race1, competitors1, [], entries, config,
      series.primaryScoringConfiguration, mergeStrategy, distinctMergeGroups(entries),
    );

    let race1Result = scoredRaces.find(r => r.id === 'race1')!;
    expect(race1Result.results.find(r => r.sailNumber === 102)?.points).toBe(3);

    const race2 = createMockRace('race2', 1);
    const seeds2: CompetitorSeed[] = [
      { helm: 'Helm 3', sailNumber: 103, finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) },
    ];
    const competitors2 = createMockCompetitors('race2', seeds2);
    entries = mergeEntries(entries, buildSeriesEntries(seeds2));

    ({ scoredRaces } = score(
      race2, competitors2, scoredRaces, entries, config,
      series.primaryScoringConfiguration, mergeStrategy, distinctMergeGroups(entries),
    ));

    race1Result = scoredRaces.find(r => r.id === 'race1')!;
    expect(race1Result.results.find(r => r.sailNumber === 102)?.points).toBe(4);
  });

  it('should update race results with points calculated from series averages (e.g., RDGA)', () => {
    const race1 = createMockRace('race1', 0);
    const seeds1: CompetitorSeed[] = [
      { helm: 'Helm 1', sailNumber: 101, finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) },
      { helm: 'Helm 2', sailNumber: 102, finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
    ];
    const competitors1 = createMockCompetitors('race1', seeds1);
    let entries = buildSeriesEntries(seeds1);

    let { scoredRaces } = score(
      race1, competitors1, [], entries, config,
      series.primaryScoringConfiguration, mergeStrategy, distinctMergeGroups(entries),
    );

    const race2 = createMockRace('race2', 1);
    const seeds2: CompetitorSeed[] = [
      { helm: 'Helm 1', sailNumber: 101, resultCode: 'RDGA', finishTime: new Date() },
      { helm: 'Helm 2', sailNumber: 102, finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
    ];
    const competitors2 = createMockCompetitors('race2', seeds2);
    entries = mergeEntries(entries, buildSeriesEntries(seeds2));

    ({ scoredRaces } = score(
      race2, competitors2, scoredRaces, entries, config,
      series.primaryScoringConfiguration, mergeStrategy, distinctMergeGroups(entries),
    ));

    const race2Result = scoredRaces.find(r => r.id === 'race2')!;
    const helm101Race2Result = race2Result.results.find(res => res.sailNumber === 101)!;
    expect(helm101Race2Result.points).toBe(2);
  });
});
