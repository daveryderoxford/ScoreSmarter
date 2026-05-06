import type { DncCalculation, OODScoring } from 'app/club-tenant/model/club';
import type { ScoringConfiguration } from './scoring-configuration';
import type { SeriesScoringScheme } from './scoring-algotirhm';

export type { DncCalculation, OODScoring };

export interface ScoringPolicy {
  seriesType: SeriesScoringScheme;
  config: ScoringConfiguration;
  dnc: DncCalculation;
  ood?: OODScoring;
  discards: number;
  excludeNeverRaced?: boolean;
}
