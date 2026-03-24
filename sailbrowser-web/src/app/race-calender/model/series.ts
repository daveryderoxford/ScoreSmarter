import { ScoringConfiguration } from "app/scoring/model/scoring-configuration";
import { SeriesScoringScheme } from "app/scoring/model/scoring-algotirhm";

export interface Series {
   id: string;
   seasonId: string;
   name: string;
   startDate?: Date | null;
   endDate?: Date | null;
   archived: boolean;
   
   // Base scoring rules
   scoringAlgorithm: SeriesScoringScheme;
   entryAlgorithm: string;
   initialDiscardAfter: number;
   subsequentDiscardsEveryN: number;

   // Scoring configurations
   primaryScoringConfiguration: ScoringConfiguration;
   secondaryScoringConfigurations?: ScoringConfiguration[];
   dirty?: boolean;
}
