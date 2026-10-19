import { describe, expect, it } from 'vitest';
import type { Race } from './race';
import { canMarkFinal, racesAwaitingReview } from './results-review';

const now = new Date(2026, 5, 10, 12, 0);
const past = new Date(2026, 5, 6, 10, 30);
const future = new Date(2026, 5, 13, 10, 30);

function race(id: string, extra: Partial<Race>): Race {
  return { id, scheduledStart: past, status: 'Completed', ...extra } as Race;
}

describe('racesAwaitingReview', () => {
  it('includes past in-progress and completed races that are still provisional', () => {
    const awaiting = racesAwaitingReview(
      [
        race('completed', {}),
        race('in-progress', { status: 'In progress', resultsState: 'provisional' }),
        race('final', { resultsState: 'final' }),
        race('no-results', { status: 'Future' }),
        race('cancelled', { status: 'Canceled' }),
        race('upcoming', { scheduledStart: future, status: 'In progress' }),
      ],
      now,
    );

    expect(awaiting.map(r => r.id)).toEqual(['completed', 'in-progress']);
  });
});

describe('canMarkFinal', () => {
  it('only allows final once the race is completed', () => {
    expect(canMarkFinal({ status: 'Completed' })).toBe(true);
    expect(canMarkFinal({ status: 'In progress' })).toBe(false);
    expect(canMarkFinal({ status: 'Future' })).toBe(false);
  });
});
