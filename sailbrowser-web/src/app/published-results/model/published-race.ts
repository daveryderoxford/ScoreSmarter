import { RaceType } from '../../race-calender/model/race-type';
import type { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import { ResultCode } from 'app/scoring/model/result-code';

/** Immutable race results object, stored in the `published_races` collection. */
export interface PublishedRace {
   id: string;
   seriesName: string;
   index: number;
   seriesId: string;
   raceOfDay: number;
   scheduledStart: Date;
   type: RaceType;
   isDiscardable: boolean;
   isAverageLap: boolean;
   results: RaceResult[];
}

export interface RaceResult {
   /**
    * Per-hull SeriesEntry id this row belongs to. Always unique per hull.
    */
   seriesEntryId: string;
   /**
    * Series-aggregation grouping key. Multiple per-hull rows with the same
    * `competitorKey` collapse into a single competitor in the series scoring
    * pass (e.g. when scoring by helm). For non-merging strategies this equals
    * `seriesEntryId`. See `mergeKeyFor`.
    */
   competitorKey: string;
   rank: number;
   club?: string;
   boatClass: string;
   sailNumber: number;
   helm: string;
   crew?: string;
   handicap: number;
   /** Present when the series uses Personal handicap; shown in results UI. */
   personalHandicapBand?: PersonalHandicapBand;
   laps: number;
   startTime: Date;
   finishTime: Date;
   elapsedTime: number;
   correctedTime: number;
   points: number;
   resultCode: ResultCode;
}