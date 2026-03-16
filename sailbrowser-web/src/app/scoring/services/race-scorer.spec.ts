import { RaceCompetitor, SeriesEntry } from 'app/results-input';
import { ResultCode } from '../model/result-code';
import { Race } from 'app/race-calender';
import { scoreRace } from './race-scorer';
import { SailbrowserError } from 'app/shared/utils/sailbrowser-error';

/** Helper to create RaceCompetitor objects for testing */
function createCompetitor(
  id: string,
  finishTimeOffset: number | null,
  resultCode: ResultCode,
  options: Partial<RaceCompetitor> = {}
): RaceCompetitor {
  const startTime = new Date('2024-01-01T10:00:00Z');
  const finishTime = finishTimeOffset !== null ? new Date(startTime.getTime() + finishTimeOffset * 1000) : undefined;

  return {
    id,
    raceId: 'race1',
    seriesId: 'series1',
    seriesEntryId: `entry${id}`,
    helm: `Helm ${id}`,
    sailNumber: 100 + parseInt(id, 10),
    boatClass: 'Test Class',
    handicap: 1000,
    startTime,
    finishTime,
    numLaps: 1,
    manualLaps: 0,
    lapTimes: [],
    resultCode,
    ...options,
  } as RaceCompetitor;
}

function generateSeriesEntries(competitors: RaceCompetitor[]): SeriesEntry[] {
  return competitors.map(c => ({
    id: c.seriesEntryId,
    seriesId: c.seriesId,
    helm: c.helm,
    crew: c.crew,
    boatClass: c.boatClass || 'Test Class',
    sailNumber: (c.sailNumber || 0).toString(),
    handicap: c.handicap || 1000,
  }));
}

describe('RaceScorer', () => {
  const mockRace: Race = {
    id: '1',
    seriesName: 'Series',
    index: 1,
    fleetId: 'fleet',
    seriesId: 'series',
    scheduledStart: new Date('2023-01-01T10:00:00Z'),
    raceOfDay: 1,
    type: 'Handicap',
    status: 'Completed',
    isDiscardable: true,
    isAverageLap: false,
    dirty: false,
  };

  it('should score a level rating race with 3 competitors', () => {
    const competitors = [
      createCompetitor('2', 720, 'OK'), // 2nd, 12 mins
      createCompetitor('1', 600, 'OK'), // 1st, 10 mins
      createCompetitor('3', 840, 'OK'), // 3rd, 14 mins
    ];
    const seriesEntries = generateSeriesEntries(competitors);

    const results = scoreRace(mockRace, competitors, seriesEntries, 'Level Rating', 'short', 3);

    const r1 = results.find(r => r.sailNumber === 101)!;
    const r2 = results.find(r => r.sailNumber === 102)!;
    const r3 = results.find(r => r.sailNumber === 103)!;

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
    const seriesEntries = generateSeriesEntries(competitors);

    const results = scoreRace(pursuitRace, competitors, seriesEntries, 'Level Rating', 'short', 3);

    const r1 = results.find(r => r.sailNumber === 101)!;
    const r2 = results.find(r => r.sailNumber === 102)!;
    const r3 = results.find(r => r.sailNumber === 103)!;

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
    const seriesEntries = generateSeriesEntries(competitors);

    const results = scoreRace(levelRace, competitors, seriesEntries, 'Level Rating', 'short', 4);

    const r1 = results.find(r => r.sailNumber === 101)!;
    const r2 = results.find(r => r.sailNumber === 102)!;
    const r3 = results.find(r => r.sailNumber === 103)!;
    const r4 = results.find(r => r.sailNumber === 104)!;

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
      createCompetitor('2', 840, 'OK', { handicap: 1200 }), // Corrected: 700. Ties for 2nd
      createCompetitor('3', 630, 'OK', { handicap: 900 }),  // Corrected: 700. Ties for 2nd
      createCompetitor('4', 700, 'OK'), // Corrected: 700. Ties for 2nd
      createCompetitor('5', 900, 'OK'), // 5th, corrected 900
    ];
    const seriesEntries = generateSeriesEntries(competitors);

    // c1 is 1st (1pt)
    // c2, c3, c4 tie for 2nd. They occupy places 2, 3, 4. Points = (2+3+4)/3 = 3
    // c5 is 5th (5pts)
    const results = scoreRace(mockRace, competitors, seriesEntries, 'PY', 'short', 5);

    const r1 = results.find(r => r.sailNumber === 101)!;
    const r2 = results.find(r => r.sailNumber === 102)!;
    const r3 = results.find(r => r.sailNumber === 103)!;
    const r4 = results.find(r => r.sailNumber === 104)!;
    const r5 = results.find(r => r.sailNumber === 105)!;

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
    const seriesEntries = generateSeriesEntries(competitors);

    // Positions 1, 2, 3 are tied. Points = (1+2+3)/3 = 2
    // Position 4 gets 4 points.
    // Position 5 gets 5 points.
    const results = scoreRace(mockRace, competitors, seriesEntries, 'PY', 'short', 5);

    const r1 = results.find(r => r.sailNumber === 101)!;
    const r2 = results.find(r => r.sailNumber === 102)!;
    const r3 = results.find(r => r.sailNumber === 103)!;
    const r4 = results.find(r => r.sailNumber === 104)!;
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
    const seriesEntries = generateSeriesEntries(competitors);

    // For short series, all non-finishers (except DNC) get seriesCompetitorCount + 1
    const penaltyPoints = seriesCompetitorCount + 1; // 7 points
    const nonStarterPoints = penaltyPoints;

    const results = scoreRace(mockRace, competitors, seriesEntries, 'PY', 'short', seriesCompetitorCount);

    const r1 = results.find(r => r.sailNumber === 101)!;
    const r2 = results.find(r => r.sailNumber === 102)!;
    const r3 = results.find(r => r.sailNumber === 103)!;
    const r4 = results.find(r => r.sailNumber === 104)!;
    const r5 = results.find(r => r.sailNumber === 105)!;
    const r6 = results.find(r => r.sailNumber === 106)!;

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
    const seriesEntries = generateSeriesEntries(competitors);

    // 'NOT FINISHED' is not a starter.
    // Starters = 1 (only competitor '1')
    const starterPoints = 1 + 1; // 2
    const nonStarterPoints = seriesCompetitorCount + 1; // 4

    const results = scoreRace(mockRace, competitors, seriesEntries, 'PY', 'short', seriesCompetitorCount);

    const r1 = results.find(r => r.sailNumber === 101)!;
    const r2 = results.find(r => r.sailNumber === 102)!;
    const r3 = results.find(r => r.sailNumber === 103)!;

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
    const seriesEntries = generateSeriesEntries(competitors);

    // SCP for short series 
    // c2 finishes 2nd, gets 2 points.
    // SCP penalty is 20% of dnf score = (100+1)*0.2 = 20.2
    // Final order by points: c1 (1), c2 (102), c3 (3)
    const results = scoreRace(mockRace, competitors, seriesEntries, 'PY', 'short', 100);

    const r1 = results.find(r => r.sailNumber === 101)!;
    const r2 = results.find(r => r.sailNumber === 102)!;
    const r3 = results.find(r => r.sailNumber === 103)!;

    expect(r1.points).toBe(1);
    expect(r2.points).toBe(22.2); // (101 * 0.2)+2 = 22.2
    expect(results.find(r => r.sailNumber === 102)!.rank).toBe(3);
    expect(r3.points).toBe(3);
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
    const seriesEntries = generateSeriesEntries(competitors);

    // There are 6 starters. DNF score is 6 + 1 = 7 points.
    // Penalty is 0.2*dnf = 7*0.2 = 1.4
    // Total 7.4.
    // DNF score 6+1 = 7  So score should be capped to 7
    const results = scoreRace(mockRace, competitors, seriesEntries, 'PY', 'long', seriesCompetitorCount);

    const r4 = results.find(r => r.sailNumber === 106)!;
    expect(r4.points).toBe(7);
  });

  describe('Data Consistency Checks', () => {
    it('should throw error for level rating race with inconsistent manual positions', () => {
      const competitors = [
        createCompetitor('1', 600, 'OK', { manualPosition: 1 }), // Finisher with position
        createCompetitor('2', 720, 'OK'),                         // Finisher MISSING position
        createCompetitor('3', null, 'DNF'),                      // Non-finisher, should be ignored
      ];
      const seriesEntries = generateSeriesEntries(competitors);

      const expectedError = 'Inconsistent ordering data: Manual positions are used, but finisher with sail number 102 is missing a position.';

      expect(() => scoreRace(mockRace, competitors, seriesEntries, 'Level Rating', 'short', 3))
        .toThrow(new SailbrowserError(expectedError));
    });

    it('should throw error for level rating race with inconsistent finish times', () => {
      const competitors = [
        createCompetitor('1', 600, 'OK'),   // Finisher with time
        createCompetitor('2', null, 'OK'),  // Finisher MISSING time
        createCompetitor('3', null, 'DNS'), // Non-finisher, should be ignored
      ];
      const seriesEntries = generateSeriesEntries(competitors);

      const expectedError = 'Inconsistent ordering data: Finish times are used, but finisher with sail number 102 is missing a finish time.';

      expect(() => scoreRace(mockRace, competitors, seriesEntries, 'Level Rating', 'short', 3))
        .toThrow(new SailbrowserError(expectedError));
    });

    it('should throw error for pursuit race with inconsistent manual positions', () => {
      const pursuitRace: Race = { ...mockRace, type: 'Pursuit' };
      const competitors = [
        createCompetitor('1', null, 'OK', { manualPosition: 1 }), // Finisher with position
        createCompetitor('2', null, 'OK'),                         // Finisher MISSING position
        createCompetitor('3', null, 'DSQ'),                        // Non-finisher, should be ignored
        createCompetitor('4', null, 'OCS'),                        // Non-finisher, should be ignored
      ];
      const seriesEntries = generateSeriesEntries(competitors);

      const expectedError = 'Inconsistent ordering data: Pursuit races require a manual position, but finisher with sail number 102 is missing a position.';

      expect(() => scoreRace(pursuitRace, competitors, seriesEntries, 'Level Rating', 'short', 4))
        .toThrow(new SailbrowserError(expectedError));
    });

    it('should assign correct ranks for tied points', () => {
      const competitors = [
        createCompetitor('1', 600, 'OK'), // 1st, corrected 600 -> 1 point
        createCompetitor('2', 700, 'OK'), // 2nd, corrected 700 -> 2.5 points (tie)
        createCompetitor('3', 700, 'OK'), // 3rd, corrected 700 -> 2.5 points (tie)
        createCompetitor('4', 800, 'OK'), // 4th, corrected 800 -> 4 points
        createCompetitor('5', null, 'DNF'), // 5th, DNF -> 6 points
      ];
      const seriesEntries = generateSeriesEntries(competitors);

      const results = scoreRace(mockRace, competitors, seriesEntries, 'PY', 'short', 5);

      const r1 = results.find(r => r.sailNumber === 101)!;
      const r2 = results.find(r => r.sailNumber === 102)!;
      const r3 = results.find(r => r.sailNumber === 103)!;
      const r4 = results.find(r => r.sailNumber === 104)!;
      const r5 = results.find(r => r.sailNumber === 105)!;

      expect(r1.rank).toBe(1); // 1st place
      expect(r2.rank).toBe(2); // Tied for 2nd
      expect(r3.rank).toBe(2); // Tied for 2nd
      expect(r4.rank).toBe(4); // 4th place (rank 3 is skipped due to the tie)
      expect(r5.rank).toBe(5); // 5th place
    });

  });
});
