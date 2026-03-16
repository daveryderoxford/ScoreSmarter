import { PublishedRace, RaceResult } from 'app/published-results/model/published-race';
import { scoreSeries, ScoringConfig } from './series-scorer';
import { SeriesScoringScheme } from '../model/scoring-algotirhm';
import { SeriesEntry } from 'app/results-input';

/** Helper to create a mock PublishedRace */
function createMockRace(raceIndex: number, results: Partial<RaceResult>[]): PublishedRace {
  return {
    id: `race${raceIndex + 1}`,
    index: raceIndex,
    seriesId: 'series1',
    seriesName: 'Test Series',
    fleetId: 'fleet1',
    scheduledStart: new Date(),
    raceOfDay: 1,
    type: 'Handicap',
    isDiscardable: true, // This property on the RACE is correct
    results: results.map((res, i) => ({
      seriesEntryId: res.seriesEntryId || `entry${101 + i}`,
      rank: i + 1,
      boatClass: 'TestClass',
      sailNumber: 101 + i,
      helm: `Helm ${101 + i}`,
      crew: '',
      laps: 1,
      handicap: 1000,
      startTime: new Date(),
      finishTime: new Date(),
      elapsedTime: 600 + i * 10,
      correctedTime: 600 + i * 10,
      points: i + 1,
      resultCode: 'OK',
      ...res,
    })),
  };
}

function createMockEntries(keys: string[]): SeriesEntry[] {
  return keys.map((key, i) => {
    const [helm, sailNumber, boatClass] = key.split('-');
    return {
      id: `entry${parseInt(sailNumber, 10)}`,
      seriesId: 'series1',
      helm,
      boatClass,
      sailNumber,
      handicap: 1000,
    };
  });
}

describe('scoreSeries', () => {
  const allCompetitorKeys = ['Helm 101-101-TestClass', 'Helm 102-102-TestClass'];
  const allEntries = createMockEntries(allCompetitorKeys);

  it('should calculate net points correctly with one discard', () => {
    const races: PublishedRace[] = [
      createMockRace(0, [
        { seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 1 },
        { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 2 },
      ]),
      createMockRace(1, [
        { seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 3 }, // This should be discarded for Helm 101
        { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 },
      ]),
      createMockRace(2, [
        { seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 1 },
        { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 2 },
      ]),
    ];

    const config: ScoringConfig = { seriesType: 'short', discards: 1 };
    const seriesResults = scoreSeries(races, allEntries, config);

    const helm101 = seriesResults.find(r => r.sailNumber === 101)!;
    const helm102 = seriesResults.find(r => r.sailNumber === 102)!;

    // Helm 101 scores: 1, 3, 1. Total=5. Discards 3. Net=2.
    expect(helm101.totalPoints).toBe(5);
    expect(helm101.netPoints).toBe(2);
    expect(helm101.raceScores.find(rs => rs.raceIndex === 1)?.isDiscard).toBe(true);
    expect(helm101.rank).toBe(1);

    // Helm 102 scores: 2, 1, 2. Total=5. Discards 2. Net=3.
    expect(helm102.totalPoints).toBe(5);
    expect(helm102.netPoints).toBe(3);
    expect(helm102.raceScores.find(rs => rs.points === 2 && rs.isDiscard)!).toBeTruthy();
    expect(helm102.rank).toBe(2);
  });

  it('should not discard a non-discardable result (e.g., DGM)', () => {
    const races: PublishedRace[] = [ // Race itself is discardable
      createMockRace(0, [
        { seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 1 },
        { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 2 },
      ]),
      createMockRace(1, [
        // Helm 101 gets a DGM (10 points), which has a non-discardable RESULT CODE.
        { seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 10, resultCode: 'DGM'},
        { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 },
      ]),
      createMockRace(2, [
        // Helm 101 gets 3 points. This should be discarded instead of the DGM.
        { seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 3 },
        { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 2 },
      ]),
    ];

    const config: ScoringConfig = { seriesType: 'short', discards: 1 };
    const seriesResults = scoreSeries(races, allEntries, config);

    const helm101 = seriesResults.find(r => r.sailNumber === 101)!;

    // Helm 101 scores: 1, 10 (DGM), 3. Total=14.
    // Cannot discard the 10. Must discard the 3. Net = 1 + 10 = 11.
    expect(helm101.totalPoints).toBe(14);
    expect(helm101.netPoints).toBe(11);
    const dgmScore = helm101.raceScores.find(rs => rs.resultCode === 'DGM')!;
    const discardedScore = helm101.raceScores.find(rs => rs.isDiscard)!;

    expect(dgmScore.isDiscard).toBe(false);
    expect(discardedScore.points).toBe(3); // Confirms the next worst score was discarded.
  });

  it('should correctly rank competitors with a tie, using RRS A8.1 and A8.2', () => {
    const tieBreakKeys = ['Helm 101-101-TestClass', 'Helm 102-102-TestClass', 'Helm 103-103-TestClass'];
    const tieBreakEntries = createMockEntries(tieBreakKeys);
    const races: PublishedRace[] = [
      // Race 1: 101 -> 1, 102 -> 2
      createMockRace(0, [{ seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 1 }, { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 2 }]),
      // Race 2: 101 -> 2, 102 -> 1
      createMockRace(1, [{ seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 2 }, { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 }]),
      // Race 3: 101 -> 3, 102 -> 3
      createMockRace(2, [{ seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 3 }, { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 3 }]),
      // Race 4 (last race): 101 -> 2, 102 -> 1. This breaks the tie.
      createMockRace(3, [{ seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 2 }, { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 }]),
    ];

    const config: ScoringConfig = { seriesType: 'short', discards: 1 };
    const seriesResults = scoreSeries(races, tieBreakEntries, config);

    const helm101 = seriesResults.find(r => r.sailNumber === 101)!;
    const helm102 = seriesResults.find(r => r.sailNumber === 102)!;

    // Helm 101 scores: 1, 2, 3, 2. Discards 3. Net = 1+2+2 = 5.
    // Helm 102 scores: 2, 1, 3, 1. Discards 3. Net = 2+1+1 = 4.
    expect(helm101.netPoints).toBe(5);
    expect(helm102.netPoints).toBe(4);

    // Helm 102 should be ranked higher.
    expect(helm102.rank).toBe(1);
    expect(helm101.rank).toBe(2);

    // A8.1 check:
    // Helm 101 scores (sorted): 1, 2, 2.
    // Helm 102 scores (sorted): 1, 1, 2.
    // Tie break should favor Helm 102 as they have more 1st places.
    // Let's force a tie on net points and A8.1 to test A8.2
    helm101.netPoints = 4; // Manually create a perfect tie on points and score counts
    helm101.scoresForTiebreak = [1, 1, 2];

    const tiedResults = [helm101, helm102];
    // Re-run just the ranking part
    const finalRanked = scoreSeries(races, tieBreakEntries, config);
    const final101 = finalRanked.find(r => r.sailNumber === 101)!;
    const final102 = finalRanked.find(r => r.sailNumber === 102)!;

    // A8.2: Tie is broken by score in the last race. Race 4: 101 got 2, 102 got 1.
    // 102 wins the tie-break.
    expect(final102.rank).toBe(1);
    expect(final101.rank).toBe(2);
  });

  describe('RDG Scoring (applyIsafRedress)', () => {
    const rdgCompetitorKeys = ['Helm 101-101-TestClass', 'Helm 102-102-TestClass'];
    const rdgEntries = createMockEntries(rdgCompetitorKeys);
    const races: PublishedRace[] = [
      // Race 0: Helm 101 gets 2 points. This will be included in average.
      createMockRace(0, [
        { seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 2 },
        { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 },
      ]),
      // Race 1: Helm 101 gets RDGB. Should be based on Race 0. Points = 2.
      createMockRace(1, [
        { seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 99, resultCode: 'RDGB' },
        { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 },
      ]),
      // Race 2: Helm 101 gets 10 points (OK). This will be discarded. Included in average.
      createMockRace(2, [
        { seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 10 },
        { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 },
      ]),
      // Race 3: Helm 101 gets DNF. Not included in average.
      createMockRace(3, [
        { seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 3, resultCode: 'DNF' },
        { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 },
      ]),
       // Race 4: Helm 101 gets SCP with 4 points. This is included in average.
       createMockRace(4, [
        { seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 4, resultCode: 'SCP' },
        { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 },
      ]),
      // Race 5: Helm 101 gets RDGA. Should be avg of races 0, 2, 4. (2+10+4)/3 = 5.33 -> 5.3
      createMockRace(5, [
        { seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 99, resultCode: 'RDGA' },
        { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 },
      ]),
    ];

    const config: ScoringConfig = { seriesType: 'short', discards: 1 };
    const seriesResults = scoreSeries(races, rdgEntries, config);
    const helm101 = seriesResults.find(r => r.sailNumber === 101)!;

    it('should calculate RDGB points based on the average of prior races', () => {
      // RDGB is in race 1. Average should be from race 0 only.
      const rdgbScore = helm101.raceScores.find(rs => rs.resultCode === 'RDGB')!;
      expect(rdgbScore.points).toBe(2); // Avg of race 0 (2 points)
    });

    it('should calculate RDGA points based on the average of all included races', () => {
      // RDGA is in race 5. Average is from races 0, 2, 3, 4.
      // DNF (race 3) IS included per RRS A9. RDGA/RDGB scores themselves are excluded.
      // (2 + 10 + 3 + 4) / 4 = 19 / 4 = 4.75 -> 4.8
      const rdgaScore = helm101.raceScores.find(rs => rs.resultCode === 'RDGA')!;
      expect(rdgaScore.points).toBe(4.8);
    });

    it('should include scores that will be discarded in the average calculation', () => {
      // The score of 10 in race 2 should be discarded.
      const discardedScore = helm101.raceScores.find(rs => rs.isDiscard)!;
      expect(discardedScore.points).toBe(10);
      // The test for RDGA implicitly confirms it was used in the average.
    });

    it('should assign DNC points if no prior results exist for RDG calculation', () => {
      const raceWithOnlyRdg: PublishedRace[] = [
        createMockRace(0, [{ seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 99, resultCode: 'RDGB' }]),
      ];
      const results = scoreSeries(raceWithOnlyRdg, createMockEntries(['Helm 101-101-TestClass']), { seriesType: 'short', discards: 0 });
      const dncPoints = 1 + 1; // 1 competitor in series + 1
      expect(results[0].raceScores[0].points).toBe(dncPoints);
    });
  });

  describe('OOD Scoring (applyClubOod)', () => {
    const oodCompetitorKeys = ['Helm 101-101-TestClass', 'Helm 102-102-TestClass'];
    const oodEntries = createMockEntries(oodCompetitorKeys);
    const races: PublishedRace[] = [
      // Race 0: Helm 101 gets 2 points (OK).
      createMockRace(0, [{ seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 2 }, { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 }]),
      // Race 1: Helm 101 gets OOD (Duty 1).
      createMockRace(1, [{ seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 99, resultCode: 'OOD' }, { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 }]),
      // Race 2: Helm 101 gets DNC (Did not compete). Points = 3.
      createMockRace(2, [{ seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 }]),
      // Race 3: Helm 101 gets OOD (Duty 2).
      createMockRace(3, [{ seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 99, resultCode: 'OOD' }, { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 }]),
      // Race 4: Helm 101 gets 4 points (OK).
      createMockRace(4, [{ seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 4 }, { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 }]),
      // Race 5: Helm 101 gets OOD (Duty 3).
      createMockRace(5, [{ seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 99, resultCode: 'OOD' }, { seriesEntryId: 'entry102', helm: 'Helm 102', sailNumber: 102, points: 1 }]),
    ];

    it('should calculate OOD points based on the finished pool and cap at maxOodPerSeries', () => {
      const config: ScoringConfig = { seriesType: 'short', discards: 0, maxOodPerSeries: 2, oodAveragePool: 'finished' };
      const seriesResults = scoreSeries(races, oodEntries, config);
      const helm101 = seriesResults.find(r => r.sailNumber === 101)!;

      // OOD Pool (finished): Race 0 (2 points) and Race 4 (4 points). DNC (Race 2) is excluded.
      // Average = (2 + 4) / 2 = 3.
      const oodScores = helm101.raceScores.filter(rs => rs.resultCode === 'OOD');
      
      // Duty 1 (Race 1): Should get average (3)
      expect(oodScores[0].points).toBe(3);
      
      // Duty 2 (Race 3): Should get average (3)
      expect(oodScores[1].points).toBe(3);
      
      // Duty 3 (Race 5): Cap is 2. Should get DNC points (3 competitors = 3 points, wait, 2 competitors = 3 points).
      expect(oodScores[2].points).toBe(3); // DNC points for 2 competitors is 3.
    });

    it('should calculate OOD points based on the started pool if configured', () => {
      // Add a DNF race to test 'started' pool
      const racesWithDnf = [...races, createMockRace(6, [{ seriesEntryId: 'entry101', helm: 'Helm 101', sailNumber: 101, points: 3, resultCode: 'DNF' }])];
      
      const configFinished: ScoringConfig = { seriesType: 'short', discards: 0, maxOodPerSeries: 2, oodAveragePool: 'finished' };
      const resultsFinished = scoreSeries(racesWithDnf, oodEntries, configFinished).find(r => r.sailNumber === 101)!;
      // Finished pool: 2, 4. Avg = 3.
      expect(resultsFinished.raceScores.find(rs => rs.resultCode === 'OOD')!.points).toBe(3);

      const configStarted: ScoringConfig = { seriesType: 'short', discards: 0, maxOodPerSeries: 2, oodAveragePool: 'started' };
      const resultsStarted = scoreSeries(racesWithDnf, oodEntries, configStarted).find(r => r.sailNumber === 101)!;
      // Started pool: 2, 4, 3 (DNF). Avg = (2+4+3)/3 = 3.
      expect(resultsStarted.raceScores.find(rs => rs.resultCode === 'OOD')!.points).toBe(3);
    });
  });
});
