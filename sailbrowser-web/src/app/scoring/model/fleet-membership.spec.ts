import { describe, expect, it } from 'vitest';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { isInFleet } from './fleet-membership';

function entry(): SeriesEntry {
  return {
    id: 'e1',
    seriesId: 's1',
    helm: 'Helm',
    boatClass: 'Laser',
    sailNumber: '100',
    handicaps: [{ scheme: 'PY', value: 1100 }],
    divisions: [],
  };
}

describe('isInFleet', () => {
  it('includes every entry in GeneralHandicap', () => {
    expect(isInFleet(entry(), { type: 'GeneralHandicap', id: 'g', name: 'General Handicap' })).toBe(true);
  });

  it('matches BoatClass by class name', () => {
    expect(isInFleet(entry(), { type: 'BoatClass', id: 'laser', boatClassId: 'Laser' })).toBe(true);
    expect(isInFleet(entry(), { type: 'BoatClass', id: 'ilca', boatClassId: 'ILCA 7' })).toBe(false);
  });
});
