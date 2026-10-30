import { describe, expect, it } from 'vitest';
import type { PublishedSeason, SeriesInfo } from '../model/published-season';
import { withSeriesMetadata } from './published-series-metadata';

const info = (id: string, baseSeriesId: string, displayGroup?: string): SeriesInfo => ({
  id, baseSeriesId, name: id, fleetId: 'f', startDate: new Date('2026-04-01'), endDate: new Date('2026-05-01'), raceCount: 1,
  ...(displayGroup ? { displayGroup } : {}),
});

const season: PublishedSeason = {
  id: '2026',
  name: '2026',
  series: [info('s1', 's1'), info('s1_cfg2', 's1'), info('s1_div_gold', 's1'), info('s2', 's2', 'Cups')],
};

describe('withSeriesMetadata', () => {
  it("sets the display group on all of a series' published series and no others", () => {
    const updated = withSeriesMetadata(season, { id: 's1', seasonId: '2026', displayGroup: 'Opens' })!;
    expect(updated.series.map(s => [s.id, s.displayGroup])).toEqual([
      ['s1', 'Opens'], ['s1_cfg2', 'Opens'], ['s1_div_gold', 'Opens'], ['s2', 'Cups'],
    ]);
  });

  it('removes a cleared display group', () => {
    const updated = withSeriesMetadata(season, { id: 's2', seasonId: '2026' })!;
    expect(updated.series[3]).not.toHaveProperty('displayGroup');
  });

  it('returns undefined when nothing changes', () => {
    expect(withSeriesMetadata(season, { id: 's2', seasonId: '2026', displayGroup: 'Cups' })).toBeUndefined();
    expect(withSeriesMetadata(season, { id: 'other', seasonId: '2026', displayGroup: 'Opens' })).toBeUndefined();
  });
});
