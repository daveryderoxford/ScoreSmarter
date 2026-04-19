import { ScoringConfiguration } from "app/scoring/model/scoring-configuration";
import { SeriesScoringScheme } from "app/scoring/model/scoring-algotirhm";
import { SeriesEntryMatchingStrategy } from "app/entry/model/entry-grouping";

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
   initialDiscardAfter: number;
   subsequentDiscardsEveryN: number;

   // Scoring configurations
   primaryScoringConfiguration: ScoringConfiguration;
   secondaryScoringConfigurations?: ScoringConfiguration[];
   dirty?: boolean;
}
