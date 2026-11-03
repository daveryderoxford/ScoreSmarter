import { describe, expect, it } from 'vitest';
import { Race } from './race';
import { racesOnSameDay } from './races-on-same-day';

function race(id: string, start: string, raceOfDay = 1): Race {
  return { id, scheduledStart: new Date(start), raceOfDay, index: 1, seriesName: id } as Race;
}

describe('racesOnSameDay', () => {
  it('returns only the races on the same calendar day, in start order', () => {
    const races = [
      race('pm', '2026-06-10T14:00:00', 2),
      race('other-day', '2026-06-11T11:00:00'),
      race('am', '2026-06-10T11:00:00', 1),
    ];

    expect(racesOnSameDay(races[0]!, races).map(r => r.id)).toEqual(['am', 'pm']);
  });

  it('returns nothing when no race shares the day', () => {
    expect(racesOnSameDay(race('x', '2026-06-12T11:00:00'), [race('a', '2026-06-10T11:00:00')])).toEqual([]);
  });
});
