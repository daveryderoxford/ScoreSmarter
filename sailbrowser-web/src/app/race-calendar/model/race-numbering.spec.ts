import { describe, expect, it } from 'vitest';
import type { Race } from './race';
import { raceNumbering } from './race-numbering';

function race(id: string, scheduledStart: Date): Race {
  return { id, scheduledStart, index: 0, raceOfDay: 0 } as Race;
}

describe('raceNumbering', () => {
  it('numbers races in order and restarts race-of-day each day', () => {
    const numbering = raceNumbering([
      race('a', new Date(2026, 5, 6, 10, 30)),
      race('b', new Date(2026, 5, 6, 14, 0)),
      race('c', new Date(2026, 5, 13, 10, 30)),
    ]);

    expect(Object.fromEntries(numbering)).toEqual({
      a: { index: 1, raceOfDay: 1 },
      b: { index: 2, raceOfDay: 2 },
      c: { index: 3, raceOfDay: 1 },
    });
  });

  it('follows the given order when a start time moves a race later in the day', () => {
    const numbering = raceNumbering([
      race('second', new Date(2026, 5, 6, 11, 0)),
      race('first-moved-later', new Date(2026, 5, 6, 15, 0)),
    ]);

    expect(numbering.get('second')).toEqual({ index: 1, raceOfDay: 1 });
    expect(numbering.get('first-moved-later')).toEqual({ index: 2, raceOfDay: 2 });
  });
});
