import { describe, expect, it } from 'vitest';
import type { OrderEntryRowState } from './manual-results.service';
import {
  buildTieGroupsFromPlaced,
  clearTieRankOverrideChain,
  mergePlacedAndNonPlacedSegments,
  normalizeRowStateFromOrderedTieGroups,
  segmentProcessedPlacedAndNonPlaced,
} from './manual-results.service';

function row(
  resultCode: OrderEntryRowState['resultCode'],
  rankOverride: number | null = null
): OrderEntryRowState {
  return { resultCode, manualFinishTime: null, rankOverride };
}

describe('segmentProcessedPlacedAndNonPlaced', () => {
  it('splits finishers before penalties in queue order', () => {
    const processedIds = ['a', 'b', 'c'];
    const rowState = new Map<string, OrderEntryRowState>([
      ['a', row('OK')],
      ['b', row('DNS')],
      ['c', row('OK')],
    ]);
    const { placed, nonPlaced } = segmentProcessedPlacedAndNonPlaced(processedIds, rowState);
    expect(placed).toEqual(['a', 'c']);
    expect(nonPlaced).toEqual(['b']);
  });
});

describe('buildTieGroupsFromPlaced', () => {
  it('groups consecutive same-rank finishers', () => {
    const placed = ['x', 'y', 'z'];
    const rowState = new Map<string, OrderEntryRowState>([
      ['x', row('OK', 1)],
      ['y', row('OK', 1)],
      ['z', row('OK', 2)],
    ]);
    const groups = buildTieGroupsFromPlaced(placed, rowState);
    expect(groups.map(g => g.ids)).toEqual([['x', 'y'], ['z']]);
  });
});

describe('clearTieRankOverrideChain', () => {
  it('clears rankOverride on target and following rows that still had overrides', () => {
    const processedIds = ['a', 'b', 'c', 'd'];
    const rowState = new Map<string, OrderEntryRowState>([
      ['a', row('OK', 1)],
      ['b', row('OK', 2)],
      ['c', row('OK', 3)],
      ['d', row('OK', null)],
    ]);
    const next = clearTieRankOverrideChain(processedIds, 'b', rowState);
    expect(next.get('a')?.rankOverride).toBe(1);
    expect(next.get('b')?.rankOverride).toBeNull();
    expect(next.get('c')?.rankOverride).toBeNull();
    expect(next.get('d')?.rankOverride).toBeNull();
  });

  it('does not clear suffix rows without rankOverride', () => {
    const processedIds = ['a', 'b', 'c'];
    const rowState = new Map<string, OrderEntryRowState>([
      ['a', row('OK', 1)],
      ['b', row('OK', 2)],
      ['c', row('OK', null)],
    ]);
    const next = clearTieRankOverrideChain(processedIds, 'b', rowState);
    expect(next.get('c')?.rankOverride).toBeNull();
  });
});

describe('normalizeRowStateFromOrderedTieGroups', () => {
  it('assigns shared rankOverride for ties', () => {
    const rowState = new Map<string, OrderEntryRowState>([
      ['a', row('OK', 99)],
      ['b', row('OK', 99)],
    ]);
    const next = normalizeRowStateFromOrderedTieGroups([{ ids: ['a', 'b'] }], rowState);
    expect(next.get('a')?.rankOverride).toBe(1);
    expect(next.get('b')?.rankOverride).toBe(1);
  });

  it('clears rankOverride for single-boat groups', () => {
    const rowState = new Map<string, OrderEntryRowState>([['a', row('OK', 1)]]);
    const next = normalizeRowStateFromOrderedTieGroups([{ ids: ['a'] }], rowState);
    expect(next.get('a')?.rankOverride).toBeNull();
  });
});

describe('mergePlacedAndNonPlacedSegments', () => {
  it('concatenates placed then non-placed', () => {
    expect(mergePlacedAndNonPlacedSegments(['a'], ['b'])).toEqual(['a', 'b']);
  });
});
