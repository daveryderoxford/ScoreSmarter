import { describe, expect, it } from 'vitest';
import { ALL_RACES, racesNeededFor } from './published-results-store';

describe('racesNeededFor', () => {
  const indexes = [1, 2, 3, 5, 6, 7]; // race 4 cancelled, so not published

  it('counts the newest races down to and including the wanted race', () => {
    expect(racesNeededFor(7, indexes)).toBe(1);
    expect(racesNeededFor(5, indexes)).toBe(3);
    expect(racesNeededFor(1, indexes)).toBe(6);
  });

  it('loads every race when the race number is not in the standings', () => {
    expect(racesNeededFor(4, indexes)).toBe(ALL_RACES);
    expect(racesNeededFor(1, [])).toBe(ALL_RACES);
  });
});
