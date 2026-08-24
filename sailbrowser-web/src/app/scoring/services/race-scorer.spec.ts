import { describe, it, expect } from 'vitest';
import { RaceCompetitor } from '../../results-input/model/race-competitor';
import { SeriesEntry } from '../../results-input/model/series-entry';
import { ResultCode } from '../model/result-code';
import { Race } from '../../race-calender/model/race';
import { scoreRace, buildRaceResults, calculateRacePoints } from './race-scorer';
import { ScoreSmarterError } from '../../shared/utils/scoresmarter-error';
import { HandicapScheme } from '../model/handicap-scheme';
import { SeriesScoringScheme } from '../model/scoring-algotirhm';
import { RaceResult } from '../../published-results/model/published-race';

/**
 * Per-test fixture options. RaceCompetitor itself no longer carries helm /
 * boatClass / sailNumber / handicaps - those live on the SeriesEntry. The
 * helper splits options into per-race scoring data and per-hull entry data.
 */
interface CompetitorFixtureOptions {
  manualPosition?: number;
  manualLaps?: number;
  lapTimes?: Date[];
  crewOverride?: string;
  helm?: string;
  crew?: string;
  boatClass?: string;
  sailNumber?: string;
  boatName?: string;
  handicaps?: { scheme: string; value: number }[];
}

interface CompetitorFixture {
  competitor: RaceCompetitor;
  entry: SeriesEntry;
}

function createCompetitor(
  id: string,
  finishTimeOffset: number | null,
  resultCode: ResultCode,
  options: CompetitorFixtureOptions = {},
): CompetitorFixture {
  const startTime = new Date('2024-01-01T10:00:00Z');
  const finishTime = finishTimeOffset !== null ? new Date(startTime.getTime() + finishTimeOffset * 1000) : undefined;
  const seriesEntryId = `entry${id}`;

  const competitor = new RaceCompetitor({
    id,
    raceId: 'race1',
    seriesId: 'series1',
    seriesEntryId,
    crewOverride: options.crewOverride,
    startTime,
    recordedFinishTime: finishTime,
    manualLaps: options.manualLaps ?? 0,
    lapTimes: options.lapTimes ?? [],
    resultCode,
    manualPosition: options.manualPosition,
  });

  const entry: SeriesEntry = {
    id: seriesEntryId,
    seriesId: 'series1',
    helm: options.helm ?? `Helm ${id}`,
    crew: options.crew,
    boatClass: options.boatClass ?? 'Test Class',
    sailNumber: options.sailNumber ?? String(100 + parseInt(id, 10)),
    boatName: options.boatName,
    handicaps: (options.handicaps ?? [{ scheme: 'PY', value: 1000 }]) as SeriesEntry['handicaps'],
    tags: [],
  } as SeriesEntry;

  return { competitor, entry };
}

function competitorsOf(fixtures: CompetitorFixture[]): RaceCompetitor[] {
  return fixtures.map(f => f.competitor);
}

function entriesOf(fixtures: CompetitorFixture[]): SeriesEntry[] {
  return fixtures.map(f => f.entry);
}

function scoreRaceHelper(
  race: Race,
  fixtures: CompetitorFixture[],
  scheme: HandicapScheme,
  seriesType: SeriesScoringScheme,
  seriesCompetitorCount: number,
): RaceResult[] {
  const results = buildRaceResults(competitorsOf(fixtures), entriesOf(fixtures), scheme, 'classSailNumberHelm');
  return scoreRace(race, results, scheme, seriesType, seriesCompetitorCount + 1);
}

describe('RaceScorer', () => {
  const mockRace: Race = {
    id: '1',
    seriesName: 'Series',
    fleetId: 'fleet1',
    index: 1,
    seriesId: 'series',
    scheduledStart: new Date('2023-01-01T10:00:00Z'),
    raceOfDay: 1,
    type: 'Handicap',
    status: 'Completed',
    isDiscardable: true,
    isAverageLap: false,
    dirty: false,
    resultsSheetImage: '',
  };

  it('should score a level rating race with 3 competitors', () => {
    const competitors = [
      createCompetitor('2', 720, 'OK'), // 2nd, 12 mins
      createCompetitor('1', 600, 'OK'), // 1st, 10 mins
      createCompetitor('3', 840, 'OK'), // 3rd, 14 mins
    ];
    const results = scoreRaceHelper(mockRace, competitors, 'Level Rating', 'short', 3);

    const r1 = results.find(r => r.sailNumber === '101')!;
    const r2 = results.find(r => r.sailNumber === '102')!;
    const r3 = results.find(r => r.sailNumber === '103')!;

    expect(r1.points).toBe(1);
    expect(r1.elapsedTime).toBe(600);
    expect(r2.points).toBe(2);
    expect(r2.elapsedTime).toBe(720);
    expect(r3.points).toBe(3);
    expect(r3.elapsedTime).toBe(840);
  });

  it('should score a pursuit race based on manual position', () => {
    const pursuitRace: Race = { ...mockRace, type: 'Pursuit' };
    const competitors = [
      createCompetitor('1', null, 'OK', { manualPosition: 2 }),
      createCompetitor('2', null, 'OK', { manualPosition: 1 }),
      createCompetitor('3', null, 'OK', { manualPosition: 3 }),
    ];
    const results = scoreRaceHelper(pursuitRace, competitors, 'Level Rating', 'short', 3);

    const r1 = results.find(r => r.sailNumber === '101')!;
    const r2 = results.find(r => r.sailNumber === '102')!;
    const r3 = results.find(r => r.sailNumber === '103')!;

    expect(r2.points).toBe(1); // from manualPosition: 1
    expect(r1.points).toBe(2); // from manualPosition: 2
    expect(r3.points).toBe(3); // from manualPosition: 3
  });

  it('should score a level rating race with tied manual positions', () => {
    const levelRace: Race = { ...mockRace, type: 'Handicap' };
    const competitors = [
      createCompetitor('1', null, 'OK', { manualPosition: 2 }), // Tied for 2nd
      createCompetitor('2', null, 'OK', { manualPosition: 1 }), // 1st
      createCompetitor('3', null, 'OK', { manualPosition: 2 }), // Tied for 2nd
      createCompetitor('4', null, 'OK', { manualPosition: 4 }), // 4th
    ];
    const results = scoreRaceHelper(levelRace, competitors, 'Level Rating', 'short', 4);

    const r1 = results.find(r => r.sailNumber === '101')!;
    const r2 = results.find(r => r.sailNumber === '102')!;
    const r3 = results.find(r => r.sailNumber === '103')!;
    const r4 = results.find(r => r.sailNumber === '104')!;

    expect(r2.rank).toBe(1);
    expect(r2.points).toBe(1);
    expect(r1.rank).toBe(2);
    expect(r1.points).toBe(2.5);
    expect(r3.rank).toBe(2);
    expect(r3.points).toBe(2.5);
    expect(r4.rank).toBe(4);
    expect(r4.points).toBe(4);
  });

  it('should handle a 3-way tie for 2nd place in a handicap race with 5 competitors', () => {
    const competitors = [
      createCompetitor('1', 600, 'OK'), // 1st, corrected 600
      createCompetitor('2', 840, 'OK', { handicaps: [{ scheme: 'PY', value: 1200 }] }), // Corrected: 700. Ties for 2nd
      createCompetitor('3', 630, 'OK', { handicaps: [{ scheme: 'PY', value: 900 }] }),  // Corrected: 700. Ties for 2nd
      createCompetitor('4', 700, 'OK'), // Corrected: 700. Ties for 2nd
      createCompetitor('5', 900, 'OK'), // 5th, corrected 900
    ];
    // c1 is 1st (1pt)
    // c2, c3, c4 tie for 2nd. They occupy places 2, 3, 4. Points = (2+3+4)/3 = 3
    // c5 is 5th (5pts)
    const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', 5);

    const r1 = results.find(r => r.sailNumber === '101')!;
    const r2 = results.find(r => r.sailNumber === '102')!;
    const r3 = results.find(r => r.sailNumber === '103')!;
    const r4 = results.find(r => r.sailNumber === '104')!;
    const r5 = results.find(r => r.sailNumber === '105')!;

    expect(r1.rank).toBe(1);
    expect(r1.points).toBe(1);
    expect(r2.rank).toBe(2);
    expect(r2.points).toBe(3);
    expect(r3.rank).toBe(2);
    expect(r3.points).toBe(3);
    expect(r4.rank).toBe(2);
    expect(r4.points).toBe(3);
    expect(r5.rank).toBe(5);
    expect(r5.points).toBe(5);
  });

  it('should handle a 4-way tie for 1st place and round points', () => {
    const competitors = [
      ...['1', '2', '3', '4'].map(id => createCompetitor(id, 600, 'OK')),
    ];
    // Positions 1, 2, 3 are tied. Points = (1+2+3)/3 = 2
    // Position 4 gets 4 points.
    // Position 5 gets 5 points.
    const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', 5);

    const r1 = results.find(r => r.sailNumber === '101')!;
    const r2 = results.find(r => r.sailNumber === '102')!;
    const r3 = results.find(r => r.sailNumber === '103')!;
    const r4 = results.find(r => r.sailNumber === '104')!;
    // 4 boats tie for 1st. They take places 1,2,3,4. Points = (1+2+3+4)/4 = 2.5
    expect(r1.rank).toBe(1);
    expect(r1.points).toBe(2.5);
    expect(r2.rank).toBe(1);
    expect(r2.points).toBe(2.5);
    expect(r3.rank).toBe(1);
    expect(r3.points).toBe(2.5);
    expect(r4.rank).toBe(1);
    expect(r4.points).toBe(2.5);
  });

  it('should correctly assign points for various result codes', () => {
    const seriesCompetitorCount = 6;
    const competitors = [
      createCompetitor('1', 600, 'OK'),   // Finisher, 1st
      createCompetitor('2', 700, 'OK'),   // Finisher, 2nd
      createCompetitor('3', null, 'DNF'), // Did Not Finish
      createCompetitor('4', null, 'OCS'), // On Course Side
      createCompetitor('5', null, 'DNS'), // Did Not Start
      createCompetitor('6', null, 'DSQ'), // Disqualified
    ];
    // For short series, all non-finishers (except DNC) get seriesCompetitorCount + 1
    const penaltyPoints = seriesCompetitorCount + 1; // 7 points
    const nonStarterPoints = penaltyPoints;

    const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', seriesCompetitorCount);

    const r1 = results.find(r => r.sailNumber === '101')!;
    const r2 = results.find(r => r.sailNumber === '102')!;
    const r3 = results.find(r => r.sailNumber === '103')!;
    const r4 = results.find(r => r.sailNumber === '104')!;
    const r5 = results.find(r => r.sailNumber === '105')!;
    const r6 = results.find(r => r.sailNumber === '106')!;

    expect(r1.points).toBe(1);
    expect(r2.points).toBe(2);
    expect(r3.points).toBe(penaltyPoints); // DNF
    expect(r4.points).toBe(penaltyPoints); // OCS
    expect(r5.points).toBe(nonStarterPoints); // DNS
    expect(r6.points).toBe(penaltyPoints); // DSQ
  });

  it("should handle 'NOT FINISHED' result code", () => {
    const seriesCompetitorCount = 3;
    const competitors = [
      createCompetitor('1', 600, 'OK'),
      createCompetitor('2', null, 'NOT FINISHED'),
      createCompetitor('3', null, 'DNS'),
    ];
    // 'NOT FINISHED' is not a starter.
    // Starters = 1 (only competitor '1')
    const starterPoints = 1 + 1; // 2
    const nonStarterPoints = seriesCompetitorCount + 1; // 4

    const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', seriesCompetitorCount);

    const r1 = results.find(r => r.sailNumber === '101')!;
    const r2 = results.find(r => r.sailNumber === '102')!;
    const r3 = results.find(r => r.sailNumber === '103')!;

    expect(r1.points).toBe(1);
    expect(r2.points).toBe(nonStarterPoints); // NOT FINISHED gets non-starter points
    expect(r3.points).toBe(nonStarterPoints); // DNS gets non-starter points
  });

  it('should apply SCP (Scoring Penalty for short series)', () => {
    const competitors = [
      createCompetitor('1', 600, 'OK'), // 1st
      createCompetitor('2', 700, 'SCP'), // 2nd, but gets penalty
      createCompetitor('3', 800, 'OK'), // 3rd
    ];
    // SCP for short series 
    // c2 finishes 2nd, gets 2 points.
    // SCP penalty is 20% of series entries = 100 * 0.2 = 20
    // Final order by points: c1 (1), c3 (3), c2 (22)
    const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', 100);

    const r1 = results.find(r => r.sailNumber === '101')!;
    const r2 = results.find(r => r.sailNumber === '102')!;
    const r3 = results.find(r => r.sailNumber === '103')!;

    // RRS 44.3(c): the penalty raises the boat's points but the scores of
    // other boats are not changed. The penalised boat keeps its finishing rank
    // (2); the boat behind keeps rank 3.
    expect(r1.points).toBe(1);
    expect(r1.rank).toBe(1);
    expect(r2.points).toBe(22); // (100 * 0.2)+2 = 22
    expect(r2.rank).toBe(2);
    expect(r3.points).toBe(3);
    expect(r3.rank).toBe(3);
  });

  it('should round SCP penalty to 1/10 of a point', () => {
    const seriesCompetitorCount = 13;
    const competitors = [
      createCompetitor('1', 600, 'OK'),  // 1st -> 1 point
      createCompetitor('2', 700, 'SCP'), // 2nd -> 2 points + penalty
    ];
    // seriesCompetitorCount = 13
    // Penalty = 20% of 13 = 2.6
    // c2 finishes 2nd (2 pts). Penalty is 2.6. Total = 4.6 points.
    const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', seriesCompetitorCount);

    const r2 = results.find(r => r.sailNumber === '102')!;
    expect(r2.points).toBe(4.6);
  });

  it('should cap SCP penalty at the DNF score ()', () => {
    const seriesCompetitorCount = 6;
    const competitors = [
      createCompetitor('1', 600, 'OK'),  // 1st -> 1 point
      createCompetitor('2', 700, 'OK'),  // 2nd -> 2 points
      createCompetitor('3', 800, 'OK'),  // 3rd -> 3 points
      createCompetitor('4', 700, 'OK'),  // 4rd -> 4 points
      createCompetitor('5', 800, 'OK'),  // 5rd -> 5 points
      createCompetitor('6', 900, 'SCP'), // 6th -> 6 points
    ];
    // There are 6 starters. DNF score is 6 + 1 = 7 points.
    // Penalty is 0.2*dnf = 7*0.2 = 1.4
    // Total 7.4.
    // DNF score 6+1 = 7  So score should be capped to 7
    const results = scoreRaceHelper(mockRace, competitors, 'PY', 'long', seriesCompetitorCount);

    const r4 = results.find(r => r.sailNumber === '106')!;
    expect(r4.points).toBe(7);
  });

  describe('Data Consistency Checks', () => {
    it('should throw error for level rating race with inconsistent manual positions', () => {
      const competitors = [
        createCompetitor('1', 600, 'OK', { manualPosition: 1 }), // Finisher with position
        createCompetitor('2', 720, 'OK'),                         // Finisher MISSING position
        createCompetitor('3', null, 'DNF'),                      // Non-finisher, should be ignored
      ];
      const expectedError = 'Inconsistent ordering data: Manual positions are used, but finisher with sail number 102 is missing a position.';

      expect(() => scoreRaceHelper(mockRace, competitors, 'Level Rating', 'short', 3))
        .toThrow(new ScoreSmarterError(expectedError));
    });

    it('should throw error for level rating race with inconsistent finish times', () => {
      const competitors = [
        createCompetitor('1', 600, 'OK'),   // Finisher with time
        createCompetitor('2', null, 'OK'),  // Finisher MISSING time
        createCompetitor('3', null, 'DNS'), // Non-finisher, should be ignored
      ];
      const expectedError = 'Inconsistent ordering data: Finish times are used, but finisher with sail number 102 is missing a finish time.';

      expect(() => scoreRaceHelper(mockRace, competitors, 'Level Rating', 'short', 3))
        .toThrow(new ScoreSmarterError(expectedError));
    });

    it('should throw error for pursuit race with inconsistent manual positions', () => {
      const pursuitRace: Race = { ...mockRace, type: 'Pursuit' };
      const competitors = [
        createCompetitor('1', null, 'OK', { manualPosition: 1 }), // Finisher with position
        createCompetitor('2', null, 'OK'),                         // Finisher MISSING position
        createCompetitor('3', null, 'DSQ'),                        // Non-finisher, should be ignored
        createCompetitor('4', null, 'OCS'),                        // Non-finisher, should be ignored
      ];
      const expectedError = 'Inconsistent ordering data: Pursuit races require a manual position, but finisher with sail number 102 is missing a position.';

      expect(() => scoreRaceHelper(pursuitRace, competitors, 'Level Rating', 'short', 4))
        .toThrow(new ScoreSmarterError(expectedError));
    });

    it('should assign correct ranks for tied points (RRS A8.1) and no rank for non-finishers (RRS A4.2)', () => {
      const competitors = [
        createCompetitor('1', 600, 'OK'), // 1st, corrected 600 -> 1 point
        createCompetitor('2', 700, 'OK'), // 2nd, corrected 700 -> 2.5 points (tie)
        createCompetitor('3', 700, 'OK'), // 3rd, corrected 700 -> 2.5 points (tie)
        createCompetitor('4', 800, 'OK'), // 4th, corrected 800 -> 4 points
        createCompetitor('5', null, 'DNF'), // DNF -> 6 points, no race rank
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', 5);

      const r1 = results.find(r => r.sailNumber === '101')!;
      const r2 = results.find(r => r.sailNumber === '102')!;
      const r3 = results.find(r => r.sailNumber === '103')!;
      const r4 = results.find(r => r.sailNumber === '104')!;
      const r5 = results.find(r => r.sailNumber === '105')!;

      expect(r1.rank).toBe(1); // 1st place
      expect(r2.rank).toBe(2); // Tied for 2nd
      expect(r3.rank).toBe(2); // Tied for 2nd
      expect(r4.rank).toBe(4); // 4th place (RRS A8.1: rank 3 is consumed by the tie)
      // RRS A4.2: a non-finisher receives a score, not a finishing position.
      // DNF is rendered without a rank number; only its points are shown.
      expect(r5.rank).toBe(0);
      expect(r5.resultCode).toBe('DNF');
      expect(r5.points).toBe(6);
    });

  });

  it('should apply ZFP (Z-Flag Penalty) according to RRS 44.3(c)', () => {
    const seriesCompetitorCount = 10;
    const competitors = [
      createCompetitor('1', 600, 'OK'),  // 1st -> 1 point
      createCompetitor('2', 700, 'ZFP'), // 2nd -> 2 points + penalty
      createCompetitor('3', 800, 'OK'),  // 3rd -> 3 points
    ];
    // seriesCompetitorCount = 10
    // Penalty = 20% of 10 = 2.0
    // c2 finishes 2nd (2 pts). Penalty is 2. Total = 4 points.
    const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', seriesCompetitorCount);

    const r1 = results.find(r => r.sailNumber === '101')!;
    const r2 = results.find(r => r.sailNumber === '102')!;
    const r3 = results.find(r => r.sailNumber === '103')!;

    // RRS 44.3(c): a Scoring Penalty raises the penalised boat's points but
    // "the scores of other boats shall not be changed". The penalised boat
    // therefore keeps its original finishing rank; the boat behind keeps its
    // own finishing rank as well.
    expect(r1.points).toBe(1);
    expect(r1.rank).toBe(1);
    expect(r2.points).toBe(4);
    expect(r2.rank).toBe(2);
    expect(r3.points).toBe(3);
    expect(r3.rank).toBe(3);

    // The array order (used for the UI display) is by points, so the penalised
    // boat appears AFTER the 3rd-place finisher even though its rank is still 2.
    expect(results.map(r => r.sailNumber)).toEqual(['101', '103', '102']);
  });

  it('should round ZFP penalty to 1/10 of a point', () => {
    const seriesCompetitorCount = 11;
    const competitors = [
      createCompetitor('1', 600, 'OK'),  // 1st -> 1 point
      createCompetitor('2', 700, 'ZFP'), // 2nd -> 2 points + penalty
    ];
    // seriesCompetitorCount = 11
    // Penalty = 20% of 11 = 2.2
    // c2 finishes 2nd (2 pts). Penalty is 2.2. Total = 4.2 points.
    const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', seriesCompetitorCount);

    const r2 = results.find(r => r.sailNumber === '102')!;
    expect(r2.points).toBe(4.2);
  });

  it('should enforce minimum 2 place penalty for ZFP', () => {
    const seriesCompetitorCount = 4;
    const competitors = [
      createCompetitor('1', 600, 'OK'),  // 1st -> 1 point
      createCompetitor('2', 700, 'ZFP'), // 2nd -> 2 points + penalty
    ];
    // seriesCompetitorCount = 4
    // 20% of 4 = 0.8. Rounded = 1.
    // BUT minimum penalty is 2 places.
    // c2 finishes 2nd (2 pts). Penalty is 2. Total = 4 points.
    const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', seriesCompetitorCount);

    const r2 = results.find(r => r.sailNumber === '102')!;
    expect(r2.points).toBe(4);
  });

  it('copies boatName from series entry into race results', () => {
    const fixtures = [
      createCompetitor('1', 600, 'OK', {
        boatName: 'Flying Fish',
        boatClass: 'J/109',
        sailNumber: 'GBR1234',
      }),
    ];
    const results = buildRaceResults(
      competitorsOf(fixtures),
      entriesOf(fixtures),
      'YTC',
      'classSailNumberHelm',
    );
    expect(results[0].boatName).toBe('Flying Fish');
    expect(results[0].boatClass).toBe('J/109');
  });

  it('should support calculateRacePoints for re-scoring without re-calculating times', () => {
    const competitors = [
      createCompetitor('1', 600, 'OK'),
      createCompetitor('2', 700, 'SCP'),
    ];
    const results = buildRaceResults(competitorsOf(competitors), entriesOf(competitors), 'PY', 'classSailNumberHelm');

    // Manually set times to simulate they were already calculated
    results[0].elapsedTime = 600;
    results[0].correctedTime = 600;
    results[1].elapsedTime = 700;
    results[1].correctedTime = 700;

    // First scoring with 10 competitors
    calculateRacePoints(results, mockRace.type, 'PY', 'short', 11);
    // Penalty = 20% of 10 = 2. 2nd place (2 pts) + 2 = 4 pts.
    expect(results.find(r => r.sailNumber === '102')!.points).toBe(4);

    // Re-score with 20 competitors
    calculateRacePoints(results, mockRace.type, 'PY', 'short', 21);
    // Penalty = 20% of 20 = 4. 2nd place (2 pts) + 4 = 6 pts.
    expect(results.find(r => r.sailNumber === '102')!.points).toBe(6);

    // Verify times were NOT touched (they are 0 in buildRaceResults if not calculated, 
    // but we set them manually and they should stay)
    expect(results[0].elapsedTime).toBe(600);
  });

  describe('OOD and redress ranking', () => {
    it('OOD with no points yet sorts to the bottom with rank=0', () => {
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'OK'),
        createCompetitor('3', 800, 'OK'),
        createCompetitor('4', null, 'OOD'),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', 4);

      const r1 = results.find(r => r.sailNumber === '101')!;
      const r2 = results.find(r => r.sailNumber === '102')!;
      const r3 = results.find(r => r.sailNumber === '103')!;
      const ood = results.find(r => r.sailNumber === '104')!;

      expect(r1.rank).toBe(1);
      expect(r2.rank).toBe(2);
      expect(r3.rank).toBe(3);
      expect(ood.rank).toBe(0);
      expect(ood.resultCode).toBe('OOD');
      // The UI displays results in array order; OOD must render at the bottom.
      expect(results[results.length - 1].sailNumber).toBe('104');
    });

    it('OOD with writeback points stays at the bottom on re-score (the user-reported failure mode)', () => {
      // After the first publish iteration, applyClubOod writes the OOD's
      // race-1 points to a series average that happens to coincide with a
      // real finisher's points. The next iteration's calculateRacePoints
      // call must NOT relocate the OOD into a finisher's rank slot.
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'OK'),
        createCompetitor('3', 800, 'OK'),
        createCompetitor('4', null, 'OOD'),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', 4);
      const ood = results.find(r => r.sailNumber === '104')!;

      // Simulate the series-scoring writeback (scorer.ts step 4).
      ood.points = 2;

      // Re-score: this is what scoring-engine.ts does on every subsequent
      // race added to the series via score()'s step 2.5.
      calculateRacePoints(results, mockRace.type, 'PY', 'short', 5);

      const r1 = results.find(r => r.sailNumber === '101')!;
      const r2 = results.find(r => r.sailNumber === '102')!;
      const r3 = results.find(r => r.sailNumber === '103')!;
      const oodAfter = results.find(r => r.sailNumber === '104')!;

      // No rank slot consumed by the OOD even though its points coincide with r2's.
      expect(r1.rank).toBe(1);
      expect(r2.rank).toBe(2);
      expect(r3.rank).toBe(3);
      expect(oodAfter.rank).toBe(0);
      // Writeback points survive the re-score.
      expect(oodAfter.points).toBe(2);
      // OOD is still at the bottom of the array.
      expect(results[results.length - 1].sailNumber).toBe('104');
    });

    it('OOD with writeback points equal to a tying finisher does not bump anyone', () => {
      // 7 distinct finishers + a 2-way tie produces ranks 1..6, then 7,7 (rank 8 consumed).
      // OOD writeback = 7.5 (the tied points value); must still hold rank=0.
      const competitors = [
        createCompetitor('1', 100, 'OK'),
        createCompetitor('2', 200, 'OK'),
        createCompetitor('3', 300, 'OK'),
        createCompetitor('4', 400, 'OK'),
        createCompetitor('5', 500, 'OK'),
        createCompetitor('6', 600, 'OK'),
        createCompetitor('7', 700, 'OK'), // tied 7/8
        createCompetitor('8', 700, 'OK'), // tied 7/8 -> both get (7+8)/2 = 7.5 points
        createCompetitor('9', null, 'OOD'),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', 9);
      const ood = results.find(r => r.sailNumber === '109')!;
      ood.points = 7.5;

      calculateRacePoints(results, mockRace.type, 'PY', 'short', 10);

      const rankOf = (sn: string) => results.find(r => r.sailNumber === sn)!.rank;
      expect(rankOf('101')).toBe(1);
      expect(rankOf('102')).toBe(2);
      expect(rankOf('103')).toBe(3);
      expect(rankOf('104')).toBe(4);
      expect(rankOf('105')).toBe(5);
      expect(rankOf('106')).toBe(6);
      // RRS A8.1: tied finishers share the leading rank; the next rank is consumed.
      expect(rankOf('107')).toBe(7);
      expect(rankOf('108')).toBe(7);
      expect(rankOf('109')).toBe(0); // OOD: no rank, regardless of writeback points.
      expect(results[results.length - 1].sailNumber).toBe('109');
    });

    it('reproduces the user-reported race-1 layout (12 finishers, one tie at 8th, OOD with writeback)', () => {
      // Mirrors the bug-report tabular layout. After the fix the ranks should
      // land on 1, 2, 3, 4, 5, 6, 7, 8, 8, 10, 11, 12 with the OOD at the bottom.
      const competitors: CompetitorFixture[] = [];
      for (let i = 1; i <= 7; i++) {
        competitors.push(createCompetitor(String(i), i * 100, 'OK'));
      }
      // Two boats tie for 8th (matched corrected times).
      competitors.push(createCompetitor('8', 800, 'OK'));
      competitors.push(createCompetitor('9', 800, 'OK'));
      for (let i = 10; i <= 12; i++) {
        competitors.push(createCompetitor(String(i), i * 100, 'OK'));
      }
      competitors.push(createCompetitor('13', null, 'OOD'));

      const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', 13);
      const ood = results.find(r => r.sailNumber === '113')!;

      // Series scoring writes back an OOD average that coincides with rank 7's points.
      ood.points = 7;
      calculateRacePoints(results, mockRace.type, 'PY', 'short', 14);

      const rankOf = (sn: string) => results.find(r => r.sailNumber === sn)!.rank;
      const finisherRanks = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '112'].map(rankOf);
      expect(finisherRanks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8, 10, 11, 12]);
      expect(rankOf('113')).toBe(0);
      expect(results[results.length - 1].sailNumber).toBe('113');
    });

    it('multiple SCP boats interleaved with OK boats keep their finishing ranks (RRS 44.3(c))', () => {
      const seriesCount = 50;
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'SCP'),
        createCompetitor('3', 800, 'OK'),
        createCompetitor('4', 900, 'SCP'),
        createCompetitor('5', 1000, 'OK'),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', seriesCount);

      const r1 = results.find(r => r.sailNumber === '101')!;
      const r2 = results.find(r => r.sailNumber === '102')!;
      const r3 = results.find(r => r.sailNumber === '103')!;
      const r4 = results.find(r => r.sailNumber === '104')!;
      const r5 = results.find(r => r.sailNumber === '105')!;

      // RRS 44.3(c): a Scoring Penalty raises the boat's points but does not
      // change other boats' scores. All five keep their finishing ranks.
      expect([r1.rank, r2.rank, r3.rank, r4.rank, r5.rank]).toEqual([1, 2, 3, 4, 5]);

      // dncPoints = seriesCount + 1 = 51. Penalty = max(2, round((51-1)*0.2*10)/10) = 10.
      // Capped at dnfPoints (= dncPoints in short series) = 51.
      expect(r2.points).toBeCloseTo(2 + 10, 5);
      expect(r4.points).toBeCloseTo(4 + 10, 5);
    });

    it('RDG with a finish time keeps its finishing rank', () => {
      // RDG is given to a boat that finished but is then awarded redress points.
      // The per-race rank reflects where the boat finished; only points are
      // overwritten later by series scoring.
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'RDG'),
        createCompetitor('3', 800, 'OK'),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', 3);

      const r1 = results.find(r => r.sailNumber === '101')!;
      const rdg = results.find(r => r.sailNumber === '102')!;
      const r3 = results.find(r => r.sailNumber === '103')!;

      expect(r1.rank).toBe(1);
      expect(rdg.rank).toBe(2);
      expect(r3.rank).toBe(3);
    });

    it('RDG without a finish time falls to the bottom with rank=0', () => {
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'OK'),
        createCompetitor('3', 800, 'OK'),
        createCompetitor('4', null, 'RDG'),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', 4);

      const rdg = results.find(r => r.sailNumber === '104')!;
      expect(rdg.rank).toBe(0);
      expect(results[results.length - 1].sailNumber).toBe('104');
    });

    it('DNF and RET have rank=0 and stay at the bottom alongside finishers (RRS A4.2)', () => {
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'OK'), // tied 2/3
        createCompetitor('3', 700, 'OK'), // tied 2/3
        createCompetitor('4', null, 'DNF'),
        createCompetitor('5', null, 'RET'),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', 5);

      const ranks = ['101', '102', '103', '104', '105'].map(sn =>
        results.find(r => r.sailNumber === sn)!.rank,
      );
      expect(ranks).toEqual([1, 2, 2, 0, 0]);

      // Both non-finishers appear after every finisher in the array order.
      const lastTwo = results.slice(-2).map(r => r.sailNumber).sort();
      expect(lastTwo).toEqual(['104', '105']);
    });

    it('scoring twice in a row yields the same array order and ranks (idempotent)', () => {
      // A scrappy race with ties, an SCP, an OOD with a writeback value, and a DNF.
      // A second pass through calculateRacePoints must produce an identical
      // snapshot - this guards against any future regression that re-introduces
      // array-index-based rank derivation.
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'OK'),  // tied 2/3
        createCompetitor('3', 700, 'OK'),  // tied 2/3
        createCompetitor('4', 800, 'SCP'),
        createCompetitor('5', null, 'DNF'),
        createCompetitor('6', null, 'OOD'),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', 6);
      // Simulate a series-scoring writeback for the OOD.
      results.find(r => r.sailNumber === '106')!.points = 3;

      const snapshot = (rs: RaceResult[]) =>
        rs.map(r => [r.sailNumber, r.rank, r.points, r.resultCode]);

      calculateRacePoints(results, mockRace.type, 'PY', 'short', 7);
      const firstPass = snapshot(results);

      calculateRacePoints(results, mockRace.type, 'PY', 'short', 7);
      const secondPass = snapshot(results);

      expect(secondPass).toEqual(firstPass);
    });
  });

  describe('Stale manualPosition on non-finishers (RRS A4.2)', () => {
    // RRS A4.2 - "A boat that did not start, did not finish, retired after
    // finishing or was disqualified shall be scored points for the finishing
    // place ... but shall not be ranked above any boat that finished."
    // Combined with RRS A8.1 (ties), the invariant is: only finishers carry a
    // finishing position; rank = 0 means "no finishing place".

    it('Handicap: DNF with stale manualPosition gets rank 0 and sorts to bottom', () => {
      // Reproduces the leak: a competitor recorded a finishing position and
      // was later marked DNF; manualPosition lingers on RaceCompetitor.
      // buildRaceResults must gate the rank seed on resultCode.
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'OK'),
        createCompetitor('3', null, 'DNF', { manualPosition: 1 }),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'PY', 'short', 3);

      const r1 = results.find(r => r.sailNumber === '101')!;
      const r2 = results.find(r => r.sailNumber === '102')!;
      const dnf = results.find(r => r.sailNumber === '103')!;

      expect(r1.rank).toBe(1);
      expect(r2.rank).toBe(2);
      expect(dnf.rank).toBe(0);
      expect(dnf.resultCode).toBe('DNF');
      expect(results[results.length - 1].sailNumber).toBe('103');
    });

    it('Level Rating: DNF with stale manualPosition does not flip ordering to manual positions', () => {
      // determineOrdering chooses manual-positions vs elapsed-time by
      // inspecting finishers. With a stale rank on a non-finisher, the
      // post-scoring invariant `rank > 0 => finisher` is what keeps
      // sortByPoints and the results table honest.
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'OK'),
        createCompetitor('3', 800, 'OK'),
        createCompetitor('4', null, 'DNF', { manualPosition: 2 }),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'Level Rating', 'short', 4);

      const r1 = results.find(r => r.sailNumber === '101')!;
      const r2 = results.find(r => r.sailNumber === '102')!;
      const r3 = results.find(r => r.sailNumber === '103')!;
      const dnf = results.find(r => r.sailNumber === '104')!;

      expect(r1.rank).toBe(1);
      expect(r1.elapsedTime).toBe(600);
      expect(r2.rank).toBe(2);
      expect(r3.rank).toBe(3);
      expect(dnf.rank).toBe(0);
      expect(results[results.length - 1].sailNumber).toBe('104');
    });
  });

  describe('Level Rating parity with Handicap', () => {
    // Mirrors the existing handicap SCP / ZFP / static-code tests against
    // Level Rating to lock in parity across the two race types and the three
    // ordering modes (corrected time, elapsed time, manual positions).

    it('Level Rating (manual positions): SCP keeps finishing rank and adds penalty places (RRS 44.3(c))', () => {
      // RRS 44.3(c): "The race score for a boat that takes a Scoring Penalty
      // shall be the score she would have received without that penalty,
      // made worse by ... [N] places. The scores of other boats shall not be
      // changed; therefore, two boats may receive the same score."
      const competitors = [
        createCompetitor('1', null, 'OK', { manualPosition: 1 }),
        createCompetitor('2', null, 'SCP', { manualPosition: 2 }),
        createCompetitor('3', null, 'OK', { manualPosition: 3 }),
      ];
      // 100 boats entered. Penalty = max(2, round(100 * 0.2 * 10) / 10) = 20.
      const results = scoreRaceHelper(mockRace, competitors, 'Level Rating', 'short', 100);

      const r1 = results.find(r => r.sailNumber === '101')!;
      const r2 = results.find(r => r.sailNumber === '102')!;
      const r3 = results.find(r => r.sailNumber === '103')!;

      expect(r1.rank).toBe(1);
      expect(r1.points).toBe(1);
      expect(r2.rank).toBe(2);
      expect(r2.points).toBe(22);
      // RRS 44.3(c): other boats' scores are unchanged.
      expect(r3.rank).toBe(3);
      expect(r3.points).toBe(3);
    });

    it('Level Rating (elapsed time): SCP keeps finishing rank and adds penalty places (RRS 44.3(c))', () => {
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'SCP'),
        createCompetitor('3', 800, 'OK'),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'Level Rating', 'short', 100);

      const r1 = results.find(r => r.sailNumber === '101')!;
      const r2 = results.find(r => r.sailNumber === '102')!;
      const r3 = results.find(r => r.sailNumber === '103')!;

      expect(r1.rank).toBe(1);
      expect(r1.points).toBe(1);
      expect(r2.rank).toBe(2);
      expect(r2.points).toBe(22);
      expect(r3.rank).toBe(3);
      expect(r3.points).toBe(3);
    });

    it('Level Rating: ZFP penalty rounds to 1/10 of a point (RRS 44.3(c), project rounding rule)', () => {
      // Project rule deviates from the strict RRS "nearest whole number"
      // rounding and keeps 1/10 precision; see also the handicap counterpart.
      const seriesCompetitorCount = 11;
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'ZFP'),
      ];
      // Penalty = 20% of 11 = 2.2; c2 = 2 + 2.2 = 4.2.
      const results = scoreRaceHelper(mockRace, competitors, 'Level Rating', 'short', seriesCompetitorCount);

      const r2 = results.find(r => r.sailNumber === '102')!;
      expect(r2.points).toBe(4.2);
    });

    it('Level Rating: ZFP enforces minimum 2-place penalty (RRS 44.3(c))', () => {
      // 20% of 4 = 0.8, rounded to 1, but the rule sets a minimum of 2 places.
      const seriesCompetitorCount = 4;
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'ZFP'),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'Level Rating', 'short', seriesCompetitorCount);

      const r2 = results.find(r => r.sailNumber === '102')!;
      // 2nd place (2 pts) + min(2) places = 4 pts.
      expect(r2.points).toBe(4);
    });

    it('Level Rating: SCP penalty capped at the DNF score (RRS 44.3(c))', () => {
      // RRS 44.3(c): "the boat shall not be scored worse than Did Not Finish".
      const seriesCompetitorCount = 6;
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'OK'),
        createCompetitor('3', 800, 'OK'),
        createCompetitor('4', 850, 'OK'),
        createCompetitor('5', 900, 'OK'),
        createCompetitor('6', 1000, 'SCP'),
      ];
      // long series: dnfPoints = startAreaCount (6) + 1 = 7.
      // 6 (place) + 1.4 (penalty) = 7.4, capped at 7.
      const results = scoreRaceHelper(mockRace, competitors, 'Level Rating', 'long', seriesCompetitorCount);

      const r6 = results.find(r => r.sailNumber === '106')!;
      expect(r6.points).toBe(7);
    });

    it('Level Rating: DNF / OCS / DNS / DSQ static codes match handicap (RRS A4.2, A5.1)', () => {
      // RRS A4.2 / A5.1 (Low-Point Scoring): boats that did not start, did
      // not finish, retired, or were disqualified are scored
      // "the number of boats entered in the series + 1".
      const seriesCompetitorCount = 6;
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'OK'),
        createCompetitor('3', null, 'DNF'),
        createCompetitor('4', null, 'OCS'),
        createCompetitor('5', null, 'DNS'),
        createCompetitor('6', null, 'DSQ'),
      ];
      const penaltyPoints = seriesCompetitorCount + 1;
      const results = scoreRaceHelper(mockRace, competitors, 'Level Rating', 'short', seriesCompetitorCount);

      const r3 = results.find(r => r.sailNumber === '103')!;
      const r4 = results.find(r => r.sailNumber === '104')!;
      const r5 = results.find(r => r.sailNumber === '105')!;
      const r6 = results.find(r => r.sailNumber === '106')!;

      expect(r3.points).toBe(penaltyPoints);
      expect(r3.rank).toBe(0);
      expect(r4.points).toBe(penaltyPoints);
      expect(r4.rank).toBe(0);
      expect(r5.points).toBe(penaltyPoints);
      expect(r5.rank).toBe(0);
      expect(r6.points).toBe(penaltyPoints);
      expect(r6.rank).toBe(0);
    });

    it('Level Rating: RET non-finishers have rank=0 and stay at the bottom alongside DNF (RRS A4.2)', () => {
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'OK'),
        createCompetitor('3', 800, 'OK'),
        createCompetitor('4', null, 'DNF'),
        createCompetitor('5', null, 'RET'),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'Level Rating', 'short', 5);

      const ranks = ['101', '102', '103', '104', '105'].map(sn =>
        results.find(r => r.sailNumber === sn)!.rank,
      );
      expect(ranks).toEqual([1, 2, 3, 0, 0]);
      const lastTwo = results.slice(-2).map(r => r.sailNumber).sort();
      expect(lastTwo).toEqual(['104', '105']);
    });

    it('Level Rating: RDG without a finish time falls to the bottom with rank=0 (RRS A4.2)', () => {
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'OK'),
        createCompetitor('3', 800, 'OK'),
        createCompetitor('4', null, 'RDG'),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'Level Rating', 'short', 4);

      const rdg = results.find(r => r.sailNumber === '104')!;
      expect(rdg.rank).toBe(0);
      expect(results[results.length - 1].sailNumber).toBe('104');
    });

    it('Level Rating: RDG with a finish time keeps its finishing rank (RRS A8.1)', () => {
      // RDG points are written by the series scorer; the per-race rank still
      // reflects the boat's actual finishing position.
      const competitors = [
        createCompetitor('1', 600, 'OK'),
        createCompetitor('2', 700, 'RDG'),
        createCompetitor('3', 800, 'OK'),
      ];
      const results = scoreRaceHelper(mockRace, competitors, 'Level Rating', 'short', 3);

      const r1 = results.find(r => r.sailNumber === '101')!;
      const rdg = results.find(r => r.sailNumber === '102')!;
      const r3 = results.find(r => r.sailNumber === '103')!;

      expect(r1.rank).toBe(1);
      expect(rdg.rank).toBe(2);
      expect(r3.rank).toBe(3);
    });
  });
});
