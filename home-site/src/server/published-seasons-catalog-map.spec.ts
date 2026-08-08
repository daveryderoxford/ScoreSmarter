import {describe, expect, it} from 'vitest';
import {
  applyCatalogFilters,
  buildSeriesResultsUrl,
  isPrimaryCatalogSeries,
  isValidClubId,
  mapPublishedSeason,
  mapSeriesInfo,
  parseBooleanQuery,
  toIsoString,
} from './published-seasons-catalog-map';

describe('published-seasons-catalog-map', () => {
  it('buildSeriesResultsUrl builds canonical viewer URL', () => {
    expect(buildSeriesResultsUrl('ibrsc', 'seriesAbc')).toBe(
      'https://ibrsc.ro.scoresmarter.app/results/viewer/seriesAbc',
    );
  });

  it('isValidClubId accepts and rejects ids', () => {
    expect(isValidClubId('ibrsc')).toBe(true);
    expect(isValidClubId('')).toBe(false);
    expect(isValidClubId('bad id')).toBe(false);
  });

  it('parseBooleanQuery accepts true/1/yes case-insensitively', () => {
    expect(parseBooleanQuery('true')).toBe(true);
    expect(parseBooleanQuery('TRUE')).toBe(true);
    expect(parseBooleanQuery('1')).toBe(true);
    expect(parseBooleanQuery('yes')).toBe(true);
    expect(parseBooleanQuery('Yes')).toBe(true);
    expect(parseBooleanQuery('false')).toBe(false);
    expect(parseBooleanQuery('0')).toBe(false);
    expect(parseBooleanQuery('')).toBe(false);
    expect(parseBooleanQuery(undefined)).toBe(false);
    expect(parseBooleanQuery(['true'])).toBe(false);
  });

  it('toIsoString converts Date and Timestamp-like values', () => {
    expect(toIsoString(new Date('2026-04-13T10:00:00.000Z'))).toBe('2026-04-13T10:00:00.000Z');
    expect(toIsoString({toDate: () => new Date('2026-03-01T00:00:00.000Z')})).toBe(
      '2026-03-01T00:00:00.000Z',
    );
    expect(toIsoString('not-a-date')).toBeUndefined();
  });

  it('mapSeriesInfo maps fields and appends resultsUrl', () => {
    expect(
      mapSeriesInfo(
        {
          id: 'abc123',
          baseSeriesId: 'base1',
          name: 'Spring Series',
          fleetId: 'fleet1',
          startDate: new Date('2026-03-01T00:00:00.000Z'),
          endDate: new Date('2026-06-01T00:00:00.000Z'),
          raceCount: 12,
          recentRaceCount6d: 2,
          lastPublishedRaceStart: new Date('2026-04-13T10:00:00.000Z'),
        },
        'ibrsc',
      ),
    ).toEqual({
      id: 'abc123',
      baseSeriesId: 'base1',
      name: 'Spring Series',
      fleetId: 'fleet1',
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-06-01T00:00:00.000Z',
      raceCount: 12,
      lastPublishedRaceStart: '2026-04-13T10:00:00.000Z',
      resultsUrl: 'https://ibrsc.ro.scoresmarter.app/results/viewer/abc123',
    });
  });

  it('mapSeriesInfo omits baseSeriesId when equal to id', () => {
    const mapped = mapSeriesInfo(
      {
        id: 'primary1',
        baseSeriesId: 'primary1',
        name: 'Primary',
        fleetId: 'f1',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        raceCount: 1,
      },
      'ibrsc',
    );
    expect(mapped).not.toBeNull();
    expect(mapped!.baseSeriesId).toBeUndefined();
    expect(isPrimaryCatalogSeries(mapped!)).toBe(true);
  });

  it('mapSeriesInfo does not emit recentRaceCount6d', () => {
    const mapped = mapSeriesInfo(
      {
        id: 'abc',
        name: 'S',
        fleetId: 'f1',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        raceCount: 3,
        recentRaceCount6d: 2,
      },
      'ibrsc',
    );
    expect(mapped).not.toBeNull();
    expect(mapped).not.toHaveProperty('recentRaceCount6d');
  });

  it('mapPublishedSeason skips invalid series entries', () => {
    const season = mapPublishedSeason(
      '2026',
      {
        name: '2026 Season',
        series: [
          {
            id: 'ok',
            name: 'OK',
            fleetId: 'f1',
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T00:00:00.000Z'),
            raceCount: 1,
          },
          {id: 'broken'},
          null,
        ],
      },
      'ibrsc',
    );
    expect(season.series).toHaveLength(1);
    expect(season.series[0].id).toBe('ok');
  });

  it('applyCatalogFilters excludes secondary series by default', () => {
    const catalog = {
      clubId: 'ibrsc',
      seasons: [
        {
          id: '2026',
          name: '2026',
          series: [
            {
              id: 'primary',
              name: 'Primary',
              fleetId: 'f1',
              startDate: '2026-01-01T00:00:00.000Z',
              endDate: '2026-12-31T00:00:00.000Z',
              raceCount: 1,
              resultsUrl: 'https://ibrsc.ro.scoresmarter.app/results/viewer/primary',
            },
            {
              id: 'secondary',
              baseSeriesId: 'primary',
              name: 'Secondary',
              fleetId: 'f1',
              startDate: '2026-01-01T00:00:00.000Z',
              endDate: '2026-12-31T00:00:00.000Z',
              raceCount: 1,
              resultsUrl: 'https://ibrsc.ro.scoresmarter.app/results/viewer/secondary',
            },
          ],
        },
      ],
    };

    const filtered = applyCatalogFilters(catalog, {includeSecondarySeries: false});
    expect(filtered).not.toHaveProperty('error');
    if ('error' in filtered) {
      return;
    }
    expect(filtered.seasons[0].series).toHaveLength(1);
    expect(filtered.seasons[0].series[0].id).toBe('primary');
  });

  it('applyCatalogFilters includes secondary series when requested', () => {
    const catalog = {
      clubId: 'ibrsc',
      seasons: [
        {
          id: '2026',
          name: '2026',
          series: [
            {
              id: 'primary',
              name: 'Primary',
              fleetId: 'f1',
              startDate: '2026-01-01T00:00:00.000Z',
              endDate: '2026-12-31T00:00:00.000Z',
              raceCount: 1,
              resultsUrl: 'https://ibrsc.ro.scoresmarter.app/results/viewer/primary',
            },
            {
              id: 'secondary',
              baseSeriesId: 'primary',
              name: 'Secondary',
              fleetId: 'f1',
              startDate: '2026-01-01T00:00:00.000Z',
              endDate: '2026-12-31T00:00:00.000Z',
              raceCount: 1,
              resultsUrl: 'https://ibrsc.ro.scoresmarter.app/results/viewer/secondary',
            },
          ],
        },
      ],
    };

    const filtered = applyCatalogFilters(catalog, {includeSecondarySeries: true});
    expect(filtered).not.toHaveProperty('error');
    if ('error' in filtered) {
      return;
    }
    expect(filtered.seasons[0].series).toHaveLength(2);
  });

  it('applyCatalogFilters returns season_not_found for unknown season', () => {
    const catalog = {
      clubId: 'ibrsc',
      seasons: [{id: '2026', name: '2026', series: []}],
    };
    expect(
      applyCatalogFilters(catalog, {
        includeSecondarySeries: false,
        seasonId: '2099',
      }),
    ).toEqual({error: 'season_not_found'});
  });

  it('applyCatalogFilters keeps a single matching season', () => {
    const catalog = {
      clubId: 'ibrsc',
      seasons: [
        {id: '2025', name: '2025', series: []},
        {id: '2026', name: '2026', series: []},
      ],
    };
    const filtered = applyCatalogFilters(catalog, {
      includeSecondarySeries: false,
      seasonId: '2026',
    });
    expect(filtered).toEqual({
      clubId: 'ibrsc',
      seasons: [{id: '2026', name: '2026', series: []}],
    });
  });
});
