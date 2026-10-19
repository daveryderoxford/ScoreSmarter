import { describe, expect, it } from 'vitest';
import type { RaceStatus } from './race-status';
import { seriesStatus } from './series-status';

const races = (...statuses: RaceStatus[]) => statuses.map(status => ({ status }));

describe('seriesStatus', () => {
  it('is Future with no races or only future races', () => {
    expect(seriesStatus([])).toBe('Future');
    expect(seriesStatus(races('Future', 'Future'))).toBe('Future');
    expect(seriesStatus(races('Canceled', 'Future'))).toBe('Future');
  });

  it('is In progress once a race has results and others remain', () => {
    expect(seriesStatus(races('Completed', 'Future'))).toBe('In progress');
    expect(seriesStatus(races('In progress'))).toBe('In progress');
    expect(seriesStatus(races('Completed', 'In progress'))).toBe('In progress');
  });

  it('is Completed when no race is future or in progress', () => {
    expect(seriesStatus(races('Completed', 'Completed'))).toBe('Completed');
    expect(seriesStatus(races('Completed', 'Canceled'))).toBe('Completed');
    expect(seriesStatus(races('Canceled'))).toBe('Completed');
  });
});
