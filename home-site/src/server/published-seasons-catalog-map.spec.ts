import {describe, expect, it} from 'vitest';
import {
  buildSeriesResultsUrl,
  isValidClubId,
  mapPublishedSeason,
  mapSeriesInfo,
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
      recentRaceCount6d: 2,
      lastPublishedRaceStart: '2026-04-13T10:00:00.000Z',
      resultsUrl: 'https://ibrsc.ro.scoresmarter.app/results/viewer/abc123',
    });
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
});
