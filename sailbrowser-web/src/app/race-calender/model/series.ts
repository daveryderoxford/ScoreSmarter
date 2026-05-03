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
   /**
    * Discard allowance after each race sailed: index `k` applies after `k + 1` races (`raceCount === k + 1` in scoring).
    * Populated on read via {@link hydrateSeriesFromFirestore}; never rely on Firestore-only legacy fields in app code.
    */
   discards: number[];

   // Scoring configurations
   primaryScoringConfiguration: ScoringConfiguration;
   secondaryScoringConfigurations?: ScoringConfiguration[];
   dirty?: boolean;
}
