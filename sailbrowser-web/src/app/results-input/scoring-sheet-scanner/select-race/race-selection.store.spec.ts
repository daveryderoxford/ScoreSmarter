import { describe, expect, it } from 'vitest';
import type { Race } from 'app/race-calender/model/race';
import { scanRaceSelection } from './race-selection.store';

const races: Pick<Race, 'id' | 'type'>[] = [
  { id: 'h1', type: 'Handicap' },
  { id: 'h2', type: 'Handicap' },
  { id: 'p1', type: 'Pursuit' },
  { id: 'lr1', type: 'Level Rating' },
  { id: 'lr2', type: 'Level Rating' },
];

describe('scanRaceSelection', () => {
  it('selects only the handicap or pursuit race just added', () => {
    expect(scanRaceSelection([], ['h1'], races)).toEqual(['h1']);
    expect(scanRaceSelection(['h1'], ['h1', 'h2'], races)).toEqual(['h2']);
    expect(scanRaceSelection(['h1'], ['h1', 'p1'], races)).toEqual(['p1']);
    expect(scanRaceSelection(['lr1', 'lr2'], ['lr1', 'lr2', 'h1'], races)).toEqual(['h1']);
  });

  it('accumulates Level Rating races and drops other types', () => {
    expect(scanRaceSelection(['lr1'], ['lr1', 'lr2'], races)).toEqual(['lr1', 'lr2']);
    expect(scanRaceSelection(['h1'], ['h1', 'lr1'], races)).toEqual(['lr1']);
  });

  it('keeps the rest when races are removed', () => {
    expect(scanRaceSelection(['lr1', 'lr2'], ['lr2'], races)).toEqual(['lr2']);
    expect(scanRaceSelection(['h1'], [], races)).toEqual([]);
  });

  it('keeps an initial Level Rating selection and ignores duplicates', () => {
    expect(scanRaceSelection([], ['lr1', 'lr2', 'lr1'], races)).toEqual(['lr1', 'lr2']);
  });
});
