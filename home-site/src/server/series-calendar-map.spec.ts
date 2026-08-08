import {describe, expect, it} from 'vitest';
import {
  buildSeriesCalendar,
  compareCalendarRaces,
  extractFleetId,
  mapCalendarRace,
  mapCalendarSeries,
  mapClubSeasons,
  mapScoringAlgorithm,
} from './series-calendar-map';
import {parseBooleanQuery} from './published-seasons-catalog-map';

function primaryConfig(fleetId: string) {
  return {
    primaryScoringConfiguration: {
      id: 'overall',
      name: 'PY',
      type: 'Handicap',
      fleet: {id: fleetId, type: 'GeneralHandicap'},
      handicapScheme: 'PY',
    },
  };
}

describe('series-calendar-map', () => {
  it('parseBooleanQuery accepts includeRaces-style true/1/yes', () => {
    expect(parseBooleanQuery('true')).toBe(true);
    expect(parseBooleanQuery('TRUE')).toBe(true);
    expect(parseBooleanQuery('1')).toBe(true);
    expect(parseBooleanQuery('yes')).toBe(true);
    expect(parseBooleanQuery('false')).toBe(false);
    expect(parseBooleanQuery(undefined)).toBe(false);
  });

  it('accepts includeRaces and include-races query aliases (default false)', () => {
    // Same coalesce as /api/series-calendar (and seasonId/season on published-seasons).
    const parseIncludeRaces = (query: Record<string, unknown>) =>
      parseBooleanQuery(query['includeRaces'] ?? query['include-races']);

    expect(parseIncludeRaces({})).toBe(false);
    expect(parseIncludeRaces({includeRaces: 'true'})).toBe(true);
    expect(parseIncludeRaces({'include-races': '1'})).toBe(true);
    expect(parseIncludeRaces({'include-races': 'yes'})).toBe(true);
    expect(parseIncludeRaces({includeRaces: 'false'})).toBe(false);
    // CamelCase wins when both are present (same ?? order as the route).
    expect(parseIncludeRaces({includeRaces: 'false', 'include-races': 'true'})).toBe(
      false,
    );
  });

  it('mapScoringAlgorithm maps scoringAlgorithm long/short', () => {
    expect(mapScoringAlgorithm('long')).toBe('long');
    expect(mapScoringAlgorithm('short')).toBe('short');
    expect(mapScoringAlgorithm('other')).toBeUndefined();
    expect(mapScoringAlgorithm(undefined)).toBeUndefined();
  });

  it('extractFleetId reads primary scoring configuration fleet id', () => {
    expect(extractFleetId(primaryConfig('fleet-1'))).toBe('fleet-1');
    expect(extractFleetId({})).toBeUndefined();
    expect(extractFleetId({primaryScoringConfiguration: {fleet: {}}})).toBeUndefined();
  });

  it('mapCalendarSeries maps fields, seriesId, scoringAlgorithm, and resultsUrl', () => {
    expect(
      mapCalendarSeries(
        's1',
        {
          name: 'Spring',
          startDate: new Date('2026-03-01T10:00:00.000Z'),
          endDate: new Date('2026-06-01T10:00:00.000Z'),
          scoringAlgorithm: 'long',
          ...primaryConfig('f1'),
        },
        'ibrsc',
        {includeRaces: false},
      ),
    ).toEqual({
      seriesId: 's1',
      name: 'Spring',
      fleetId: 'f1',
      startDate: '2026-03-01T10:00:00.000Z',
      endDate: '2026-06-01T10:00:00.000Z',
      scoringAlgorithm: 'long',
      resultsUrl: 'https://ibrsc.ro.scoresmarter.app/results/viewer/s1',
    });
  });

  it('mapCalendarSeries includes races only when requested', () => {
    const raw = {
      name: 'Spring',
      startDate: new Date('2026-03-01T10:00:00.000Z'),
      endDate: new Date('2026-06-01T10:00:00.000Z'),
      scoringAlgorithm: 'short',
      ...primaryConfig('f1'),
    };
    const without = mapCalendarSeries('s1', raw, 'ibrsc', {includeRaces: false});
    expect(without).not.toBeNull();
    expect(without).not.toHaveProperty('races');

    const withRaces = mapCalendarSeries('s1', raw, 'ibrsc', {
      includeRaces: true,
      races: [{index: 1, scheduledStart: '2026-03-01T10:00:00.000Z', raceOfDay: 1}],
    });
    expect(withRaces?.races).toHaveLength(1);
  });

  it('mapCalendarSeries returns null when required fields missing', () => {
    expect(
      mapCalendarSeries(
        's1',
        {name: 'X', scoringAlgorithm: 'short'},
        'ibrsc',
        {includeRaces: false},
      ),
    ).toBeNull();
  });

  it('mapCalendarRace maps schedule fields', () => {
    expect(
      mapCalendarRace({
        index: 2,
        raceOfDay: 1,
        scheduledStart: new Date('2026-04-13T10:00:00.000Z'),
      }),
    ).toEqual({
      index: 2,
      raceOfDay: 1,
      scheduledStart: '2026-04-13T10:00:00.000Z',
    });
    expect(mapCalendarRace({index: 1})).toBeNull();
  });

  it('compareCalendarRaces sorts by start then raceOfDay', () => {
    const a = {index: 1, scheduledStart: '2026-04-01T10:00:00.000Z', raceOfDay: 2};
    const b = {index: 2, scheduledStart: '2026-04-01T10:00:00.000Z', raceOfDay: 1};
    const c = {index: 3, scheduledStart: '2026-04-02T10:00:00.000Z', raceOfDay: 1};
    expect([a, c, b].sort(compareCalendarRaces)).toEqual([b, a, c]);
  });

  it('mapClubSeasons maps embedded club seasons', () => {
    expect(
      mapClubSeasons([
        {id: '2026', name: '2026 Season'},
        {id: '2025'},
        null,
        {name: 'no-id'},
      ]),
    ).toEqual([
      {id: '2026', name: '2026 Season'},
      {id: '2025', name: '2025'},
    ]);
  });

  it('buildSeriesCalendar groups series by season and filters seasonId', () => {
    const seasons = [
      {id: '2025', name: '2025'},
      {id: '2026', name: '2026'},
    ];
    const seriesDocs = [
      {
        id: 'spring',
        data: {
          seasonId: '2026',
          name: 'Spring',
          archived: false,
          startDate: new Date('2026-03-01T10:00:00.000Z'),
          endDate: new Date('2026-06-01T10:00:00.000Z'),
          scoringAlgorithm: 'short',
          ...primaryConfig('f1'),
        },
      },
      {
        id: 'archived',
        data: {
          seasonId: '2026',
          name: 'Old',
          archived: true,
          startDate: new Date('2026-01-01T10:00:00.000Z'),
          endDate: new Date('2026-02-01T10:00:00.000Z'),
          scoringAlgorithm: 'long',
          ...primaryConfig('f1'),
        },
      },
      {
        id: 'winter',
        data: {
          seasonId: '2025',
          name: 'Winter',
          archived: false,
          startDate: new Date('2025-11-01T10:00:00.000Z'),
          endDate: new Date('2025-12-01T10:00:00.000Z'),
          scoringAlgorithm: 'long',
          ...primaryConfig('f2'),
        },
      },
    ];

    const all = buildSeriesCalendar('ibrsc', seasons, seriesDocs, [], {
      includeRaces: false,
    });
    expect(all).not.toHaveProperty('error');
    if ('error' in all) {
      return;
    }
    expect(all.seasons).toHaveLength(2);
    expect(all.seasons[0].series.map((s) => s.seriesId)).toEqual(['winter']);
    expect(all.seasons[1].series.map((s) => s.seriesId)).toEqual(['spring']);
    expect(all.seasons[1].series[0]).not.toHaveProperty('races');

    const filtered = buildSeriesCalendar('ibrsc', seasons, seriesDocs, [], {
      includeRaces: false,
      seasonId: '2026',
    });
    expect(filtered).toEqual({
      clubId: 'ibrsc',
      seasons: [
        {
          id: '2026',
          name: '2026',
          series: [
            {
              seriesId: 'spring',
              name: 'Spring',
              fleetId: 'f1',
              startDate: '2026-03-01T10:00:00.000Z',
              endDate: '2026-06-01T10:00:00.000Z',
              scoringAlgorithm: 'short',
              resultsUrl: 'https://ibrsc.ro.scoresmarter.app/results/viewer/spring',
            },
          ],
        },
      ],
    });
  });

  it('buildSeriesCalendar returns season_not_found for unknown season', () => {
    expect(
      buildSeriesCalendar('ibrsc', [{id: '2026', name: '2026'}], [], [], {
        includeRaces: false,
        seasonId: '2099',
      }),
    ).toEqual({error: 'season_not_found'});
  });

  it('buildSeriesCalendar attaches races and skips archived races', () => {
    const seasons = [{id: '2026', name: '2026'}];
    const seriesDocs = [
      {
        id: 'spring',
        data: {
          seasonId: '2026',
          name: 'Spring',
          archived: false,
          startDate: new Date('2026-03-01T10:00:00.000Z'),
          endDate: new Date('2026-06-01T10:00:00.000Z'),
          scoringAlgorithm: 'short',
          ...primaryConfig('f1'),
        },
      },
    ];
    const raceDocs = [
      {
        id: 'r2',
        data: {
          seriesId: 'spring',
          index: 2,
          raceOfDay: 1,
          status: 'Future',
          scheduledStart: new Date('2026-03-08T10:00:00.000Z'),
        },
      },
      {
        id: 'r1',
        data: {
          seriesId: 'spring',
          index: 1,
          raceOfDay: 1,
          status: 'Future',
          scheduledStart: new Date('2026-03-01T10:00:00.000Z'),
        },
      },
      {
        id: 'r-arch',
        data: {
          seriesId: 'spring',
          index: 99,
          raceOfDay: 1,
          status: 'Archived',
          scheduledStart: new Date('2026-02-01T10:00:00.000Z'),
        },
      },
    ];

    const result = buildSeriesCalendar('ibrsc', seasons, seriesDocs, raceDocs, {
      includeRaces: true,
    });
    expect(result).not.toHaveProperty('error');
    if ('error' in result) {
      return;
    }
    expect(result.seasons[0].series[0].races).toEqual([
      {index: 1, scheduledStart: '2026-03-01T10:00:00.000Z', raceOfDay: 1},
      {index: 2, scheduledStart: '2026-03-08T10:00:00.000Z', raceOfDay: 1},
    ]);
  });

  it('buildSeriesCalendar uses series document dates even when race docs are present', () => {
    const seasons = [{id: '2026', name: '2026'}];
    const seriesDocs = [
      {
        id: 'spring',
        data: {
          seasonId: '2026',
          name: 'Spring',
          archived: false,
          startDate: new Date('2025-01-01T00:00:00.000Z'),
          endDate: new Date('2025-12-31T00:00:00.000Z'),
          scoringAlgorithm: 'short',
          ...primaryConfig('f1'),
        },
      },
    ];
    const raceDocs = [
      {
        id: 'r1',
        data: {
          seriesId: 'spring',
          index: 1,
          raceOfDay: 1,
          status: 'Future',
          scheduledStart: new Date('2026-03-01T10:00:00.000Z'),
        },
      },
      {
        id: 'r2',
        data: {
          seriesId: 'spring',
          index: 2,
          raceOfDay: 1,
          status: 'Future',
          scheduledStart: new Date('2026-04-01T10:00:00.000Z'),
        },
      },
    ];

    const result = buildSeriesCalendar('ibrsc', seasons, seriesDocs, raceDocs, {
      includeRaces: false,
    });
    expect(result).not.toHaveProperty('error');
    if ('error' in result) {
      return;
    }
    expect(result.seasons[0].series).toEqual([
      {
        seriesId: 'spring',
        name: 'Spring',
        fleetId: 'f1',
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-12-31T00:00:00.000Z',
        scoringAlgorithm: 'short',
        resultsUrl: 'https://ibrsc.ro.scoresmarter.app/results/viewer/spring',
      },
    ]);
    expect(result.seasons[0].series[0]).not.toHaveProperty('races');
  });
});
