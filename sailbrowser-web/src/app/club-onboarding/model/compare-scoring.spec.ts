import { describe, expect, it } from 'vitest';
import { checkScoring } from './compare-scoring';
import type { SailwaveSeries } from './sailwave-series';
import { emptyReading, type SailingInstructionReading } from './si-proposal';

function reading(overrides: Partial<SailingInstructionReading> = {}): SailingInstructionReading {
  return { ...emptyReading(), ...overrides };
}

const shortSeries: SailwaveSeries = {
  id: 'short',
  title: 'Regatta',
  seriesName: 'Regatta',
  fleetLabel: null,
  sourceName: '',
  kind: 'series',
  caption: null,
  date: null,
  datePrecision: null,
  raceHeaders: ['R1', 'R2', 'R3', 'R4'],
  hasRatingColumn: false,
  competitors: [0, 1, 2].map(index => ({
    sailNumber: String(index),
    helm: `H${index}`,
    crew: '',
    club: '',
    boatClass: 'Solo',
    boatName: '',
    fleet: '',
    rating: null,
    races: [0, 1, 2, 3].map(race => ({
      blank: false,
      discarded: race === 3,
      points: race === 3 ? 4 : race + 1,
      code: null,
    })),
  })),
};

describe('checkScoring', () => {
  it('agrees when the discard count matches the instructions at the races sailed', () => {
    const check = checkScoring(reading({
      shortSeries: {
        discards: [4],
        dnc: null,
        discardQuote: 'One discard after four races.',
        dncQuote: null,
        unmapped: null,
      },
    }), [shortSeries]);
    expect(check.shortDiscards.status).toBe('match');
  });

  it('says later discards were not sailed when the series stopped early', () => {
    const check = checkScoring(reading({
      shortSeries: {
        discards: [4, 8],
        dnc: null,
        discardQuote: 'Two discards after eight races.',
        dncQuote: null,
        unmapped: null,
      },
    }), [shortSeries]);
    expect(check.shortDiscards.status).toBe('consistent');
    expect(check.shortDiscards.detail).toContain('Later discards');
  });

  it('disagrees when the results discarded a different number', () => {
    const check = checkScoring(reading({
      shortSeries: {
        discards: [3, 4],
        dnc: null,
        discardQuote: 'Discards at three and five.',
        dncQuote: null,
        unmapped: null,
      },
    }), [shortSeries]);
    expect(check.shortDiscards.status).toBe('disagree');
  });
});
