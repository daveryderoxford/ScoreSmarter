import { describe, expect, it } from 'vitest';
import type { Race } from 'app/race-calendar/model/race';
import type { Season } from 'app/race-calendar/model/season';
import type { Series } from 'app/race-calendar/model/series';
import { currentSeasonEvents, eventRacingStarted, eventsBySeason, type OpenEvent, seriesForEvent } from './open-event';

const event = (id: string, seasonId: string, day: number): OpenEvent => ({
  id, seasonId, name: id, startDate: new Date(2026, 5, day), endDate: new Date(2026, 5, day + 1),
});

const seasons: Season[] = [
  { id: '2025', name: '2025', status: 'archived' },
  { id: '2026', name: '2026', status: 'current' },
];

describe('open events', () => {
  it('lists current-season events by start date', () => {
    const events = [event('late', '2026', 20), event('old', '2025', 1), event('early', '2026', 3)];
    expect(currentSeasonEvents(events, seasons).map(e => e.id)).toEqual(['early', 'late']);
  });

  it('groups events by season and leaves out empty seasons', () => {
    const groups = eventsBySeason([event('a', '2026', 1)], seasons);
    expect(groups.map(g => [g.season.id, g.events.map(e => e.id)])).toEqual([['2026', ['a']]]);
  });

  it('finds the series linked to an event', () => {
    const series = [
      { id: 's2', name: 'Open B', eventId: 'e1' },
      { id: 's1', name: 'Open A', eventId: 'e1' },
      { id: 's3', name: 'Club', eventId: undefined },
    ] as Series[];
    expect(seriesForEvent('e1', series).map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('counts racing as started once any event race has a result, not when cancelled', () => {
    const races = [
      { id: 'r1', seriesId: 's1', status: 'Canceled' },
      { id: 'r2', seriesId: 'other', status: 'Completed' },
      { id: 'r3', seriesId: 's2', status: 'Future' },
    ] as Race[];
    expect(eventRacingStarted(['s1', 's2'], races)).toBe(false);
    expect(eventRacingStarted(['s1', 's2'], [...races, { id: 'r4', seriesId: 's2', status: 'In progress' } as Race])).toBe(true);
  });
});
