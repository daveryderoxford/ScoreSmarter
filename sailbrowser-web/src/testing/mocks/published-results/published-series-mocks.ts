import { PublishedSeries } from 'app/published-results/model/published-series';

// Consistent with first 2024 season
export const PUBLIC_SERIES_MOCK : PublishedSeries = {
   id: 's1',
   name: 'Spring Series', 
   fleetId: 'laser',
   competitors: [
      {
         seriesEntryId: 'entry-1',
         rank: 1,
         helm: 'John Doe',
         boatClass: 'Laser',
         sailNumber: 12345,
         club: 'SBSC',
         handicap: 1000,
         handicapScheme: 'PY',
         totalPoints: 5,
         netPoints: 3,
         raceScores: [
            { raceIndex: 1, points: 1, resultCode: 'OK', isDiscard: false },
            { raceIndex: 2, points: 2, resultCode: 'OK', isDiscard: false },
            { raceIndex: 3, points: 33, resultCode: 'DSQ', isDiscard: true },
            { raceIndex: 4, points: 5, resultCode: 'OK', isDiscard: true },
            { raceIndex: 5, points: 33, resultCode: 'OCS', isDiscard: true },
            { raceIndex: 6, points: 2, resultCode: 'OK', isDiscard: true },
         ],
         scoresForTiebreak: [],
      },
      {
         seriesEntryId: 'entry-2',
         rank: 2,
         helm: 'Jane Smith',
         crew: 'Jim Crew',
         boatClass: 'RS200',
         sailNumber: 987,
         club: 'SBSC',
         handicap: 950,
         handicapScheme: 'PY',
         totalPoints: 7,
         netPoints: 4,
         raceScores: [
            { raceIndex: 1, points: 3, resultCode: 'OK', isDiscard: true },
            { raceIndex: 2, points: 1, resultCode: 'OK', isDiscard: false },
            { raceIndex: 3, points: 3, resultCode: 'OK', isDiscard: false },
            { raceIndex: 4, points: 3, resultCode: 'OK', isDiscard: false },
            { raceIndex: 5, points: 3, resultCode: 'OK', isDiscard: false },
            { raceIndex: 6, points: 3, resultCode: 'OK', isDiscard: false },
         ],
         scoresForTiebreak: [],
      },
   ],
};

// A factory for more flexibility
export const createPublishedSeries = (overrides?: Partial<PublishedSeries>): PublishedSeries => ({
   ...PUBLIC_SERIES_MOCK,
   ...overrides
});
