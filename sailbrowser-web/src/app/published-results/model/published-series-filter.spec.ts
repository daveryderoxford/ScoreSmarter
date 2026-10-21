import { describe, expect, it } from 'vitest';
import type { Series } from 'app/race-calender/model/series';
import type { SeriesInfo } from './published-season';
import { calendarHandicapScheme, filterPublishedSeries, isSecondarySeries } from './published-series-filter';

function info(id: string, extra: Partial<SeriesInfo> = {}): SeriesInfo {
  return {
    id,
    baseSeriesId: id.split('_')[0],
    name: id,
    fleetId: 'f',
    startDate: new Date(),
    endDate: new Date(),
    raceCount: 1,
    ...extra,
  };
}

const series = {
  id: 'sat',
  primaryScoringConfiguration: { id: 'p', handicapScheme: 'PY' },
  secondaryScoringConfigurations: [{ id: 'lr', handicapScheme: 'Level Rating' }],
} as unknown as Series;

describe('published series filter', () => {
  it('treats secondary scoring and division series as secondary', () => {
    expect(isSecondarySeries(info('sat'))).toBe(false);
    expect(isSecondarySeries(info('sat_lr'))).toBe(true);
    expect(isSecondarySeries(info('sat_div_a'))).toBe(true);
    expect(isSecondarySeries(info('sat_lr', { baseSeriesId: undefined }))).toBe(true);
  });

  it('finds the scheme of the configuration a published series was scored with', () => {
    expect(calendarHandicapScheme(info('sat'), series)).toBe('PY');
    expect(calendarHandicapScheme(info('sat_lr'), series)).toBe('Level Rating');
    expect(calendarHandicapScheme(info('sat_div_a'), series)).toBe('PY');
    expect(calendarHandicapScheme(info('sat_gone'), series)).toBeUndefined();
  });

  it('excludes secondary and Level Rating series when asked', () => {
    const all = [
      info('sat', { handicapScheme: 'PY' }),
      info('sat_lr', { handicapScheme: 'Level Rating' }),
      info('oneDesign', { handicapScheme: 'Level Rating' }),
      info('oldLr'),
      info('unknown'),
    ];
    const schemes = new Map([['oldLr', 'Level Rating' as const]]);

    const ids = (filter: Parameters<typeof filterPublishedSeries>[1]) =>
      filterPublishedSeries(all, filter, schemes).map(s => s.id);

    expect(ids({})).toEqual(['sat', 'sat_lr', 'oneDesign', 'oldLr', 'unknown']);
    expect(ids({ excludeSecondary: true })).toEqual(['sat', 'oneDesign', 'oldLr', 'unknown']);
    expect(ids({ excludeSecondary: true, excludeLevelRating: true })).toEqual(['sat', 'unknown']);
  });
});
