import { PublishedRace, RaceResult } from 'app/published-results/model/published-race';
import { ResultCode } from 'app/scoring/model/result-code';

// Helper to generate a single race result
function createRawRaceResult(index: number, baseStartTime: Date): RaceResult {
  const helmNames = [
    'John Doe', 'Jane Smith', 'Peter Pan', 'Fred Bloggs', 'Alice Wonderland',
    'Bob The Builder', 'Charlie Chaplin', 'Diana Prince', 'Eve Harrington',
    'Frank Sinatra', 'Grace Kelly', 'Harry Potter', 'Ivy League', 'Jack Sparrow',
    'Karen Carpenter'
  ];
  const boatClasses = [
    'Laser', 'RS200', 'Aero 9', 'Optimist', 'Topper', 'Finn', '470',
    'Nacra 17', 'J/70', 'Melges 24', 'Dragon', 'Star', 'Soling', 'Etchells', 'J/24'
  ];
  const clubNames = ['SBSC', 'RYC', 'WSC', 'CSC', 'BSC'];

  const helm = helmNames[index % helmNames.length];
  const boatClass = boatClasses[index % boatClasses.length];
  const sailNumber = 10000 + index * 10 + Math.floor(Math.random() * 10);
  const club = clubNames[index % clubNames.length];
  const crew = index % 3 === 0 ? `Crew ${index}` : undefined; // Some have crew

  const handicap = Math.floor(Math.random() * (1200 - 900 + 1)) + 900; // 900 to 1200
  // Generate finish times that are between 30 and 60 minutes after start
  const finishOffsetSeconds = Math.floor(Math.random() * (3600 - 1800 + 1)) + 1800; // 1800s (30min) to 3600s (60min)
  const finishTime = new Date(baseStartTime.getTime() + finishOffsetSeconds * 1000);

  const elapsedTime = (finishTime.getTime() - baseStartTime.getTime()) / 1000; // in seconds
  const correctedTime = (elapsedTime * handicap) / 1000;

  return {
    seriesEntryId: `entry-${index}`,
    rank: 0,   // Placeholder, will be set after sorting
    club,
    boatClass,
    sailNumber,
    helm,
    crew,
    handicap,
    laps: 1,
    startTime: baseStartTime,
    finishTime,
    elapsedTime,
    correctedTime,
    points: 0, // Placeholder, will be set after sorting
    resultCode: 'OK' as ResultCode,
  };
}

const baseRaceStartTime = new Date('2024-05-01T12:00:00Z');
let rawRaceResults: RaceResult[] = [];

for (let i = 0; i < 15; i++) {
  rawRaceResults.push(createRawRaceResult(i, baseRaceStartTime));
}

// Sort by correctedTime
rawRaceResults.sort((a, b) => a.correctedTime - b.correctedTime);

// Assign rank and points based on sorted order
const race1Results: RaceResult[] = rawRaceResults.map((result, index) => ({
  ...result,
  rank: index + 1,
  points: index + 1, // 1st gets 1 point, 2nd gets 2, etc.
}));

export const PUBLISHED_RACES_MOCKS: PublishedRace[] = [
  { id: 'r1', seriesId: 'test-series', seriesName: 'Test Series', type: 'Handicap', isDiscardable: true, isAverageLap: false,  index: 1, scheduledStart: new Date('2024-05-01'), raceOfDay: 1, results: race1Results },
  { id: 'r2', seriesId: 'test-series', seriesName: 'Test Series', type: 'Handicap', isDiscardable: true, isAverageLap: false,  index: 2, scheduledStart: new Date('2024-05-01'), raceOfDay: 2, results: [] },
  { id: 'r3', seriesId: 'test-series', seriesName: 'Test Series', type: 'Handicap', isDiscardable: true, isAverageLap: false,  index: 3, scheduledStart: new Date('2024-05-08'), raceOfDay: 1, results: [] },
  { id: 'r4', seriesId: 'test-series', seriesName: 'Test Series', type: 'Handicap', isDiscardable: true, isAverageLap: false,  index: 4, scheduledStart: new Date('2024-05-15'), raceOfDay: 1, results: [] },
  { id: 'r5', seriesId: 'test-series', seriesName: 'Test Series', type: 'Handicap', isDiscardable: true, isAverageLap: false,  index: 5, scheduledStart: new Date('2024-05-22'), raceOfDay: 1, results: [] },
  { id: 'r6', seriesId: 'test-series', seriesName: 'Test Series', type: 'Handicap', isDiscardable: true, isAverageLap: false,  index: 6, scheduledStart: new Date('2024-05-30'), raceOfDay: 1, results: [] },
];

// A factory for more flexibility
export const createPublishedSeason = (overrides?: Partial<PublishedRace>): PublishedRace => ({
  ...PUBLISHED_RACES_MOCKS[0],
  ...overrides
});
