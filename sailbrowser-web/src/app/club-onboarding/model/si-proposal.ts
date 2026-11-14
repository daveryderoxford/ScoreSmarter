import type { SailingInstructionReading, SeriesScoringProposal } from '@shared/sailing-instructions';

export type { DncProposal, OodProposal, SailingInstructionReading, SeriesScoringProposal } from '@shared/sailing-instructions';

export function emptySeriesProposal(): SeriesScoringProposal {
  return { discards: null, dnc: null, discardQuote: null, dncQuote: null, unmapped: null };
}

export function emptyReading(): SailingInstructionReading {
  return {
    shortSeries: emptySeriesProposal(),
    longSeries: emptySeriesProposal(),
    ood: { calculationCode: null, maxDuties: null, quote: null, unmapped: null },
    longSeriesNote: null,
  };
}
