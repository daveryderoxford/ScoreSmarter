import { Race, Series } from 'app/race-calender';
import { RaceCompetitor, SeriesEntry } from 'app/results-input';
import { score } from './scorer';
import { PublishedRace } from 'app/published-results/model/published-race';
import { ScoringConfig } from './series-scorer';

/** Helper to create a mock Race */
function createMockRace(id: string, index: number): Race {
  return {
    id,
    index,
    seriesId: 'series1',
    seriesName: 'Test Series',
    fleetId: 'fleet1',
    scheduledStart: new Date(),
    raceOfDay: 1,
    type: 'Handicap',
    isDiscardable: true,
    status: 'Completed',
    isAverageLap: false,
    dirty: false,
  };
}

/** Helper to create a mock Series */
function createMockSeries(): Series {
  return {
    id: 'series1',
    seasonId: 'Season',
    archived: false,
    name: 'Test Series',
    fleetId: 'fleet1',
    scoringScheme: {
      handicapScheme: 'PY',
      initialDiscardAfter: 3,
      subsequentDiscardsEveryN: 2,
      entryAlgorithm: 'classSailNumber',
      scheme: 'long'
    },
  };
}

/** Helper to create mock RaceCompetitors */
function createMockCompetitors(raceId: string, competitors: Partial<RaceCompetitor>[]): RaceCompetitor[] {
  return competitors.map(c => {
    return new RaceCompetitor({
      id: 'testid',
      raceId,
      seriesEntryId: `entry-${c.sailNumber}`,
      boatClass: 'TestClass',
      sailNumber: c.sailNumber,
      helm: c.helm,
      crew: '',
      handicap: 1000,
      manualFinishTime: c.finishTime,
      startTime: new Date(),
      resultCode: 'OK',
      ...c,
    });
  });
}

function generateMockSeriesEntries(competitors: RaceCompetitor[], existingRaces: PublishedRace[]): SeriesEntry[] {
  const keysFromCurrentRace = getAllCompetitorKeys(competitors);
  const keysFromExistingRaces = getAllCompetitorKeysFromPublished(existingRaces);
  const allSeriesCompetitorKeys = new Set([...keysFromCurrentRace, ...keysFromExistingRaces]);
  
  return Array.from(allSeriesCompetitorKeys).map(key => {
    const [helm, sailNumber, boatClass] = key.split('-');
    return {
      id: `entry-${sailNumber}`,
      seriesId: 'series1',
      helm,
      boatClass,
      sailNumber,
      handicap: 1000,
    };
  });
}

describe('score (Orchestrator)', () => {
  const config: ScoringConfig = { seriesType: 'short', discards: 1 };
  const series = createMockSeries();

  it('should score the first race and handle DNC points correctly when a new competitor joins later', () => {
    // === Race 1: Two competitors ===
    const race1 = createMockRace('race1', 0);
    const competitors1 = createMockCompetitors('race1', [
      { helm: 'Helm 1', sailNumber: 101, finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) }, // 1st
      { helm: 'Helm 2', sailNumber: 102, finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) }, // 2nd
    ]);

    let scoredRaces: PublishedRace[] = [];
    let seriesResults;

    // Score Race 1
    let seriesEntries = generateMockSeriesEntries(competitors1, scoredRaces);
    ({ scoredRaces, seriesResults } = score(series, race1, competitors1, scoredRaces, seriesEntries, config));

    let race1Result = scoredRaces.find(r => r.id === 'race1')!;
    expect(race1Result.results.find(r => r.sailNumber === 101)?.points).toBe(1);
    expect(race1Result.results.find(r => r.sailNumber === 102)?.points).toBe(2);
    expect(seriesResults.length).toBe(2); // 2 competitors in series so far

    // === Race 2: A third competitor joins ===
    const race2 = createMockRace('race2', 1);
    const competitors2 = createMockCompetitors('race2', [
      { helm: 'Helm 1', sailNumber: 101, finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) }, // 1st
      { helm: 'Helm 3', sailNumber: 103, finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) }, // 2nd
      // Helm 2 is DNC in this race
    ]);

    // Score Race 2, passing in the results from the first run
    seriesEntries = generateMockSeriesEntries(competitors2, scoredRaces);
    ({ scoredRaces, seriesResults } = score(series, race2, competitors2, scoredRaces, seriesEntries, config));

    // Now there are 3 competitors in the series. DNC = 3 + 1 = 4 points.
    const dncPoints = 3 + 1;

    // Check Race 2 results (Helm 2 is DNC)
    const helm2SeriesResult = seriesResults.find(r => r.sailNumber === 102)!;
    const helm2Race2Score = helm2SeriesResult.raceScores.find(rs => rs.raceIndex === 1)!;
    expect(helm2Race2Score.resultCode).toBe('DNC');
    expect(helm2Race2Score.points).toBe(dncPoints);

    // Check Race 1 results again (Helm 3 was DNC and should have been re-scored)
    const helm3SeriesResult = seriesResults.find(r => r.sailNumber === 103)!;
    const helm3Race1Score = helm3SeriesResult.raceScores.find(rs => rs.raceIndex === 0)!;
    expect(helm3Race1Score.resultCode).toBe('DNC');
    expect(helm3Race1Score.points).toBe(dncPoints);
  });

  it('should re-calculate SCP points when the number of series competitors changes', () => {
    // === Race 1: Two competitors, one with SCP ===
    const race1 = createMockRace('race1', 0);
    const competitors1 = createMockCompetitors('race1', [
      { helm: 'Helm 1', sailNumber: 101, finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) }, // 1st
      { helm: 'Helm 2', sailNumber: 102, finishTime: new Date(new Date().getTime() + 11 * 60 * 1000), resultCode: 'SCP' }, // 2nd + penalty
    ]);

    // Score Race 1
    let seriesEntries = generateMockSeriesEntries(competitors1, []);
    let { scoredRaces } = score(series, race1, competitors1, [], seriesEntries, config);

    // With 2 competitors, DNF points = 2 + 1 = 3. Penalty = 20% of 3 = 0.6.
    // Helm 2 gets 2 points for position + 0.6 penalty = 2.6
    let race1Result = scoredRaces.find(r => r.id === 'race1')!;
    expect(race1Result.results.find(r => r.sailNumber === 102)?.points).toBe(2.6);

    // === Race 2: A third competitor joins ===
    const race2 = createMockRace('race2', 1);
    const competitors2 = createMockCompetitors('race2', [
      { helm: 'Helm 3', sailNumber: 103, finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) },
    ]);

    // Score Race 2
    seriesEntries = generateMockSeriesEntries(competitors2, scoredRaces);
    ({ scoredRaces } = score(series, race2, competitors2, scoredRaces, seriesEntries, config));

    // With 3 competitors, DNF points = 3 + 1 = 4. Penalty = 20% of 4 = 0.8.
    // Helm 2's score in Race 1 should be re-scored to 2 points + 0.8 penalty = 2.8
    race1Result = scoredRaces.find(r => r.id === 'race1')!;
    expect(race1Result.results.find(r => r.sailNumber === 102)?.points).toBe(2.8);
  });

  it('should update race results with points calculated from series averages (e.g., RDGA)', () => {
    // === Race 1: Helm 101 gets 2 points ===
    const race1 = createMockRace('race1', 0);
    const competitors1 = createMockCompetitors('race1', [
      { helm: 'Helm 1', sailNumber: 101, finishTime: new Date(new Date().getTime() + 11 * 60 * 1000) }, // 2nd -> 2 points
      { helm: 'Helm 2', sailNumber: 102, finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) }, // 1st -> 1 point
    ]);
    let seriesEntries = generateMockSeriesEntries(competitors1, []);
    let { scoredRaces } = score(series, race1, competitors1, [], seriesEntries, config);

    // === Race 2: Helm 101 gets RDGA ===
    const race2 = createMockRace('race2', 1);
    const competitors2 = createMockCompetitors('race2', [
      // RDGA is a finisher code, so it needs a finish time to pass the initial race scoring,
      // even though the points will be overwritten by the series average later.
      { helm: 'Helm 1', sailNumber: 101, resultCode: 'RDGA', finishTime: new Date() }, // Should get avg of race 1 = 2 points
      { helm: 'Helm 2', sailNumber: 102, finishTime: new Date(new Date().getTime() + 10 * 60 * 1000) },
    ]);

    // Score race 2, passing in the results from race 1
    seriesEntries = generateMockSeriesEntries(competitors2, scoredRaces);
    ({ scoredRaces } = score(series, race2, competitors2, scoredRaces, seriesEntries, config));

    // The RDGA points are calculated in the series scoring pass.
    // This test verifies that the points in the individual race result are updated.
    const race2Result = scoredRaces.find(r => r.id === 'race2')!;
    const helm101Race2Result = race2Result.results.find(res => res.sailNumber === 101)!;
    expect(helm101Race2Result.points).toBe(2);
  });
});
