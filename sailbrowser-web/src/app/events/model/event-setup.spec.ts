import { describe, expect, it } from 'vitest';
import type { Fleet } from 'app/club-tenant/model/fleet';
import { eventRaceStarts, eventSeriesFor, raceTypeForFleet, scoringConfigurationForFleet } from './event-setup';

const ilca: Fleet = { type: 'BoatClass', id: 'ilca7', boatClassId: 'ILCA 7' };
const handicap: Fleet = { type: 'GeneralHandicap', id: 'general-handicap', name: 'General Handicap' };

describe('event setup', () => {
  it('scores a class fleet as level rating and a handicap fleet with the club scheme', () => {
    expect(scoringConfigurationForFleet(ilca, ['PY'])).toMatchObject({ type: 'LevelRating', handicapScheme: 'Level Rating' });
    expect(scoringConfigurationForFleet(handicap, ['Level Rating', 'PY'])).toMatchObject({ type: 'Handicap', handicapScheme: 'PY' });
    expect(raceTypeForFleet(ilca)).toBe('Level Rating');
    expect(raceTypeForFleet(handicap)).toBe('Handicap');
  });

  it('creates a short series named after the event and fleet, linked to the event', () => {
    const series = eventSeriesFor({ id: 'e1', name: 'ILCA Open', seasonId: '2026' }, ilca, {
      shortSeriesDefaults: { discards: [4] },
      supportedHandicapSchemes: ['PY'],
    });
    expect(series).toMatchObject({
      name: 'ILCA Open ILCA 7',
      eventId: 'e1',
      displayGroup: 'ILCA Open',
      seasonId: '2026',
      scoringAlgorithm: 'short',
      discards: [4],
    });
  });

  it('schedules the given races on every day of the event', () => {
    const starts = eventRaceStarts(new Date(2026, 5, 6), new Date(2026, 5, 7), 10 * 3600, 3);
    expect(starts).toHaveLength(6);
    expect(starts[0]).toEqual(new Date(2026, 5, 6, 10, 0));
    expect(starts[5]).toEqual(new Date(2026, 5, 7, 10, 0));
  });
});
