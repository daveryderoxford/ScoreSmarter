import { describe, expect, it } from 'vitest';
import { Race } from 'app/race-calender/model/race';
import { publishedCancelledRaces } from './scoring-engine';

function race(id: string, index: number, start: string, status: Race['status'], extra: Partial<Race> = {}): Race {
  return { id, index, scheduledStart: new Date(start), status, ...extra } as Race;
}

describe('publishedCancelledRaces', () => {
  it('lists cancelled races in start order by series race number and date', () => {
    const races = [
      race('late', 5, '2026-06-17T11:00:00', 'Canceled', { cancellationReason: 'No wind' }),
      race('sailed', 3, '2026-06-12T11:00:00', 'Published'),
      race('early', 2, '2026-06-10T11:00:00', 'Canceled'),
    ];

    expect(publishedCancelledRaces(races)).toEqual([
      { raceId: 'early', index: 2, scheduledStart: new Date('2026-06-10T11:00:00') },
      { raceId: 'late', index: 5, scheduledStart: new Date('2026-06-17T11:00:00') },
    ]);
  });
});
