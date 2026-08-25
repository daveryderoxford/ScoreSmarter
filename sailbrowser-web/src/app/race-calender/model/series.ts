import { ScoringConfiguration } from "app/scoring/model/scoring-configuration";
import { SeriesScoringScheme } from "app/scoring/model/scoring-algotirhm";
import { SeriesEntryMatchingStrategy } from "app/entry/model/entry-grouping";
import type { Division } from './division';

export interface Series {
   id: string;
   seasonId: string;
   name: string;
   startDate?: Date | null;
   endDate?: Date | null;
   archived: boolean;
   
   // Base scoring rules
   scoringAlgorithm: SeriesScoringScheme;
   /**
    * Controls how per-hull SeriesEntries are *merged* during series-level
    * scoring (see `mergeKeyFor`). Per-hull entries are always created at
    * sign-on regardless of this setting.
    */
   entryAlgorithm: SeriesEntryMatchingStrategy;
   /**
    * Milestone race numbers (1-based, non-decreasing): each entry adds one allowed discard once that many races have been sailed.
    * Scoring derives cumulative allowance with `generateDiscardArray` in `discard-profile`.
    */
   discards: number[];

   // Scoring configurations
   primaryScoringConfiguration: ScoringConfiguration;
   secondaryScoringConfigurations?: ScoringConfiguration[];
   /** Series catalog of divisions (classification and/or separate published series). */
   divisions?: Division[];
   dirty?: boolean;
}
