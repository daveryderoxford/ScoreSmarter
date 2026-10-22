import { describe, expect, it } from 'vitest';
import { Race } from 'app/race-calender/model/race';
import type { Series } from 'app/race-calender/model/series';
import type { ScoringConfiguration } from 'app/scoring/model/scoring-configuration';
import { publishedCancelledRaces, publishedSeriesResultsState, publishedSeriesTargets } from './scoring-engine';

describe('publishedSeriesTargets', () => {
  it('publishes each scoring configuration, then separately scored divisions under the primary', () => {
    const primary = { id: 'p', name: 'Handicap' } as ScoringConfiguration;
    const secondary = { id: 'py', name: 'PY' } as ScoringConfiguration;
    const series = {
      id: 'sat',
      name: 'Saturday',
      primaryScoringConfiguration: primary,
      secondaryScoringConfigurations: [secondary],
      divisions: [
        { id: 'jun', name: 'Juniors', scoreAs: 'separateSeries' },
        { id: 'tag', name: 'Tagged', scoreAs: 'classification' },
      ],
    } as unknown as Series;

    expect(publishedSeriesTargets(series, [primary, secondary])).toEqual([
      { config: primary, publishedSeriesId: 'sat', publishedSeriesName: 'Saturday', membership: { kind: 'fleet' } },
      { config: secondary, publishedSeriesId: 'sat_py', publishedSeriesName: 'Saturday - PY', membership: { kind: 'fleet' } },
      {
        config: primary,
        publishedSeriesId: 'sat_div_jun',
        publishedSeriesName: 'Saturday - Juniors',
        membership: { kind: 'division', divisionId: 'jun' },
      },
    ]);
  });
});

function race(id: string, index: number, start: string, status: Race['status'], extra: Partial<Race> = {}): Race {
  return { id, index, scheduledStart: new Date(start), status, ...extra } as Race;
}

describe('publishedCancelledRaces', () => {
  it('lists cancelled races in start order by series race number and date', () => {
    const races = [
      race('late', 5, '2026-06-17T11:00:00', 'Canceled', { cancellationReason: 'No wind' }),
      race('sailed', 3, '2026-06-12T11:00:00', 'Completed'),
      race('early', 2, '2026-06-10T11:00:00', 'Canceled'),
    ];

    expect(publishedCancelledRaces(races)).toEqual([
      { raceId: 'early', index: 2, scheduledStart: new Date('2026-06-10T11:00:00') },
      { raceId: 'late', index: 5, scheduledStart: new Date('2026-06-17T11:00:00') },
    ]);
  });
});

describe('publishedSeriesResultsState', () => {
  const final = (id: string) => race(id, 1, '2026-06-10T11:00:00', 'Completed', { resultsState: 'final' });

  it('is final only when every published race is final', () => {
    expect(publishedSeriesResultsState([final('a'), final('b')])).toBe('final');
  });

  it('is provisional when any race is provisional or has no results state yet', () => {
    expect(publishedSeriesResultsState([final('a'), race('b', 2, '2026-06-12T11:00:00', 'Completed')])).toBe('provisional');
    expect(
      publishedSeriesResultsState([race('c', 3, '2026-06-13T11:00:00', 'In progress', { resultsState: 'provisional' })]),
    ).toBe('provisional');
  });

  it('is provisional for a series with no published races', () => {
    expect(publishedSeriesResultsState([])).toBe('provisional');
  });
});
