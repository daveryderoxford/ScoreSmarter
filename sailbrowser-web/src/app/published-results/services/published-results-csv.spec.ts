import { describe, expect, it } from 'vitest';
import type { PublishedRace, RaceResult } from '../model/published-race';
import type { PublishedSeries } from '../model/published-series';
import {
  buildPublishedResultsCsv,
  formatDurationSeconds,
  PUBLISHED_RESULTS_CSV_COLUMNS,
} from './published-results-csv';

function result(partial: Partial<RaceResult> & Pick<RaceResult, 'helm'>): RaceResult {
  return {
    seriesEntryId: 'e1',
    competitorKey: 'e1',
    rank: 1,
    boatClass: 'ILCA 7',
    sailNumber: '1234',
    club: 'IBRSC',
    handicap: 1100,
    laps: 2,
    startTime: new Date('2026-06-10T11:00:00'),
    finishTime: new Date('2026-06-10T11:45:30'),
    elapsedTime: 2730,
    correctedTime: 2481,
    points: 1,
    resultCode: 'OK',
    divisions: [],
    ...partial,
  };
}

function race(index: number, results: RaceResult[]): PublishedRace {
  return {
    id: `r${index}`,
    seriesName: 'Summer',
    index,
    seriesId: 's1',
    raceOfDay: 1,
    scheduledStart: new Date('2026-06-10T11:00:00'),
    type: 'Handicap',
    isDiscardable: true,
    isAverageLap: false,
    results,
    divisionDefinitions: [],
  };
}

function series(id: string, name: string): PublishedSeries {
  return {
    id,
    name,
    fleetId: 'gh',
    competitors: [],
    divisionDefinitions: [],
  };
}

describe('formatDurationSeconds', () => {
  it('formats like the duration pipe', () => {
    expect(formatDurationSeconds(2730)).toBe('45:30');
    expect(formatDurationSeconds(3661)).toBe('01:01:01');
    expect(formatDurationSeconds(0)).toBe('');
  });
});

describe('buildPublishedResultsCsv', () => {
  it('returns only the header when there are no race rows', () => {
    const csv = buildPublishedResultsCsv([
      { seasonName: '2025-26', series: series('s1', 'Summer'), races: [] },
    ]);
    expect(csv).toBe(PUBLISHED_RESULTS_CSV_COLUMNS.join(','));
  });

  it('includes the expected columns and one row per boat per race', () => {
    const csv = buildPublishedResultsCsv([
      {
        seasonName: '2025-26',
        series: series('s1', 'Summer'),
        races: [
          race(1, [result({ helm: 'Alex' }), result({ helm: 'Blake', rank: 2, points: 2 })]),
          race(2, [result({ helm: 'Alex', rank: 1, points: 1 })]),
        ],
      },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(PUBLISHED_RESULTS_CSV_COLUMNS.join(','));
    expect(lines[0]).toContain(',Race,');
    expect(lines[0]).not.toMatch(/race of day/i);
    expect(lines[0]).not.toContain('Race index');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain('2025-26');
    expect(lines[1]).toContain('Summer');
    expect(lines[1]).toContain('Alex');
    expect(lines[1]).toContain('45:30');
    expect(lines[1]).toContain('11:00:00');
    expect(lines[1]).toContain('11:45:30');
  });

  it('writes the series race number, not race-of-day', () => {
    const r = race(12, [result({ helm: 'Alex' })]);
    r.raceOfDay = 2;
    const csv = buildPublishedResultsCsv([
      { seasonName: '2025-26', series: series('s1', 'Summer'), races: [r] },
    ]);
    const data = csv.split('\n')[1]!;
    expect(data).toContain(',12,');
    expect(data.startsWith('2025-26,Summer,12,')).toBe(true);
  });

  it('escapes commas in helm names', () => {
    const csv = buildPublishedResultsCsv([
      {
        seasonName: '2025-26',
        series: series('s1', 'Summer'),
        races: [race(1, [result({ helm: 'Smith, Alex' })])],
      },
    ]);
    expect(csv.split('\n')[1]).toContain('"Smith, Alex"');
  });

  it('orders by season, series, race index, then rank', () => {
    const csv = buildPublishedResultsCsv([
      {
        seasonName: 'B',
        series: series('s2', 'Winter'),
        races: [race(1, [result({ helm: 'Late' })])],
      },
      {
        seasonName: 'A',
        series: series('s1', 'Summer'),
        races: [
          race(2, [result({ helm: 'Second race' })]),
          race(1, [
            result({ helm: 'Second', rank: 2, points: 2 }),
            result({ helm: 'First', rank: 1, points: 1 }),
          ]),
        ],
      },
    ]);
    const lines = csv.split('\n').slice(1);
    expect(lines[0]!.startsWith('A,Summer,1,')).toBe(true);
    expect(lines[0]).toContain('First');
    expect(lines[1]).toContain('Second');
    expect(lines[2]!.startsWith('A,Summer,2,')).toBe(true);
    expect(lines[3]!.startsWith('B,Winter,1,')).toBe(true);
  });

  it('leaves rank empty when unranked', () => {
    const csv = buildPublishedResultsCsv([
      {
        seasonName: '2025-26',
        series: series('s1', 'Summer'),
        races: [race(1, [result({ helm: 'No show', rank: 0, resultCode: 'DNC', elapsedTime: 0, correctedTime: 0 })])],
      },
    ]);
    // Rank column empty between Race type and Helm
    expect(csv.split('\n')[1]).toContain(',Handicap,,No show,');
  });
});
