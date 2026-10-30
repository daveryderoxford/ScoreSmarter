import { describe, expect, it } from 'vitest';
import type { Series } from 'app/race-calender/model/series';
import type { HandicapConfiguration } from 'app/scoring/model/scoring-configuration';
import { publishedSeriesInfo } from './scoring-engine';

const config: HandicapConfiguration = {
  id: 'cfg-py',
  name: 'PY',
  fleet: { type: 'GeneralHandicap', id: 'f-general', name: 'General Handicap' },
  type: 'Handicap',
  handicapScheme: 'PY',
};

const series = (overrides: Partial<Series> = {}) =>
  ({ id: 's1', seasonId: '2026', name: 'Spring', startDate: new Date('2026-04-01'), endDate: new Date('2026-05-01'), ...overrides }) as Series;

describe('publishedSeriesInfo', () => {
  it('copies the display group into the season summary entry', () => {
    const info = publishedSeriesInfo(series({ displayGroup: 'Opens' }), 's1_cfg', 'Spring - PY', config, {
      raceCount: 4,
      recentRaceCount6d: 1,
    });
    expect(info).toMatchObject({ id: 's1_cfg', baseSeriesId: 's1', name: 'Spring - PY', displayGroup: 'Opens', raceCount: 4 });
  });

  it('omits the display group when the series has none', () => {
    const info = publishedSeriesInfo(series(), 's1', 'Spring', config, { raceCount: 0, recentRaceCount6d: 0 });
    expect(info).not.toHaveProperty('displayGroup');
    expect(info).not.toHaveProperty('lastPublishedRaceStart');
  });
});
