import { describe, expect, it } from 'vitest';
import { observeDiscards, observeDnc, observeOod, racesSailed } from './infer-scoring';
import type { SailwaveCompetitor, SailwaveRaceCell, SailwaveSeries } from './sailwave-series';

function cell(points: number | null, code: string | null = null, discarded = false): SailwaveRaceCell {
  if (points == null && code == null) return { blank: true, discarded: false, points: null, code: null };
  return { blank: false, discarded, points, code };
}

function competitor(helm: string, races: SailwaveRaceCell[], sailNumber = helm): SailwaveCompetitor {
  return {
    sailNumber,
    helm,
    crew: '',
    club: '',
    boatClass: 'Solo',
    boatName: '',
    fleet: '',
    rating: null,
    races,
  };
}

function series(id: string, competitors: SailwaveCompetitor[], raceCount = competitors[0]?.races.length ?? 0): SailwaveSeries {
  return {
    id,
    title: id,
    seriesName: id,
    fleetLabel: null,
    sourceName: '',
    kind: 'series',
    caption: null,
    date: null,
    datePrecision: null,
    raceHeaders: Array.from({ length: raceCount }, (_, index) => `R${index + 1}`),
    competitors,
    hasRatingColumn: false,
  };
}

describe('infer scoring from Sailwave cells', () => {
  it('counts a race as sailed when it is not blank and not DNC', () => {
    expect(racesSailed([cell(1), cell(4, 'DNC'), cell(null)])).toBe(1);
  });

  it('uses the fleet mode of parenthesised scores as the discard count', () => {
    const observed = observeDiscards([series('spring', [
      competitor('Ann', [cell(1), cell(2, null, true), cell(3)]),
      competitor('Bea', [cell(2), cell(1), cell(4, null, true)]),
      competitor('Cara', [cell(3), cell(4), cell(1)]),
    ])]);
    expect(observed[0]).toMatchObject({ raceCount: 3, discardCount: 1, kind: 'short' });
  });

  it('takes races sailed and discards from the Sailwave caption, not the empty future columns', () => {
    const boats = [
      competitor('Ann', [cell(1), cell(2, null, true), cell(null), cell(null)]),
      competitor('Bea', [cell(2), cell(1), cell(null), cell(null)]),
    ];
    const withCaption = {
      ...series('autumn', boats, 4),
      caption: { sailed: 2, discards: 0, toCount: 2, entries: 2, ratingSystem: '', scoringSystem: '' },
    };
    expect(observeDiscards([withCaption])[0]).toMatchObject({ raceCount: 2, discardCount: 0 });
    expect(observeDiscards([series('autumn', boats, 4)])[0]).toMatchObject({ raceCount: 2, discardCount: 1 });
  });

  it('does not read scoring rules from single race tables', () => {
    const race = { ...series('race', [competitor('Ann', [cell(1)]), competitor('Bea', [cell(3, 'DNC')])]), kind: 'race' as const };
    expect(observeDiscards([race])).toEqual([]);
    expect(observeDnc([race])).toEqual([]);
  });

  it('matches a constant DNC score to series entries + 1', () => {
    const boats = [0, 1, 2, 3, 4].map(index => competitor(`H${index}`, [
      index < 3 ? cell(index + 1) : cell(6, 'DNC'),
      index < 2 ? cell(index + 1) : cell(6, 'DNC'),
    ]));
    const [observed] = observeDnc([series('short', boats)]);
    expect(observed.status).toBe('matched');
    expect(observed.calculation).toEqual({ basis: 'SeriesEntries', offset: 1, excludeNeverRaced: false });
  });

  it('reports DNC points that follow the starters in each race', () => {
    const boats = [0, 1, 2, 3].map(index => competitor(`H${index}`, [
      index === 3 ? cell(4, 'DNC') : cell(index + 1),
      index >= 2 ? cell(3, 'DNC') : cell(index + 1),
    ]));
    const [observed] = observeDnc([series('pursuit', boats)]);
    expect(observed.status).toBe('per-race');
  });

  it('reads an OOD score that matches the average of the other races and caps further duties', () => {
    const observed = observeOod([series('duty', [
      competitor('Ann', [cell(1), cell(3), cell(2, 'OOD'), cell(4, 'OOD')]),
      competitor('Bea', [cell(4, 'DNC'), cell(1), cell(2), cell(3)]),
    ])]);
    expect(observed.calculationCode).toBe('AvgAll');
    expect(observed.maxDuties).toBe(1);
  });
});
