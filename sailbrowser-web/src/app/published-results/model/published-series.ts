import { ResultCode } from 'app/scoring/model/result-code';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import type { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';

export interface PublishedSeriesResult {
   /**
    * Stable identifier for the merged competitor (see `mergeKeyFor`). This is
    * the primary key for series rows. When the series scoring strategy
    * doesn't merge hulls, it equals `seriesEntryId`.
    */
   competitorKey: string;
   /**
    * The SeriesEntry id of the *first chronological race* this competitor
    * appears in. Display fields (helm, boatClass, sailNumber, handicap, PHB)
    * are seeded from that entry. Other races for the same merge group are
    * still scored against their own per-hull entries.
    */
   seriesEntryId: string;
   rank: number;
   helm: string;
   crew?: string;
   boatClass: string;
   sailNumber: number;
   club: string;
   handicap: number;
   personalHandicapBand?: PersonalHandicapBand;
   handicapScheme: HandicapScheme;
   totalPoints: number;
   netPoints: number;
   raceScores: {
      raceIndex: number;
      points: number;
      resultCode: ResultCode;
      isDiscard: boolean;
      notes?: string;
   }[];
   scoresForTiebreak: number[];
}

export interface PublishedSeries {
   id: string;
   name: string;
   fleetId: string;
   competitors: PublishedSeriesResult[];
}
