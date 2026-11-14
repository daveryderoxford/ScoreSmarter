export type DncBasis = 'SeriesEntries' | 'MaxRaceCompetitors';

export interface DncProposal {
  basis: DncBasis;
  offset: number;
  excludeNeverRaced: boolean;
}

export interface SeriesScoringProposal {
  discards: number[] | null;
  dnc: DncProposal | null;
  discardQuote: string | null;
  dncQuote: string | null;
  unmapped: string | null;
}

export type OodCalculationCode = 'AvgAll' | 'AvgExcludingDiscards' | 'FixedScore';

export interface OodProposal {
  calculationCode: OodCalculationCode | null;
  maxDuties: number | null;
  quote: string | null;
  unmapped: string | null;
}

/** Gemini reading of a club's sailing instructions. Null fields were not stated. */
export interface SailingInstructionReading {
  shortSeries: SeriesScoringProposal;
  longSeries: SeriesScoringProposal;
  ood: OodProposal;
  longSeriesNote: string | null;
}
