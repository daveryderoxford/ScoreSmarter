import type { SailNumber } from 'app/boats/model/sail-number';
import { RaceType } from '../../race-calender/model/race-type';
import type { ClubTagDefinition } from 'app/club-tenant/model/club-tag';
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
   /**
    * Snapshot of the club tag definitions referenced by any row in `results`
    * at publish time. Display layers resolve `RaceResult.tags` against this
    * snapshot so historical results render stably even if the club later
    * renames or deletes a tag definition. Default `[]`.
    */
   tagDefinitions: ClubTagDefinition[];
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
   sailNumber: SailNumber;
   /** Yacht name copied from the series entry when present. */
   boatName?: string;
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
   /** Tag ids copied from the contributing series entry. Default `[]`. */
   tags: string[];
}

/** Published race results use this sentinel when a competitor has no finishing rank. */
export const UNRANKED_RACE_RANK = 0;

export function hasRaceRank(rank: number): boolean {
   return rank !== UNRANKED_RACE_RANK;
}

export function isRankedRaceResult(result: Pick<RaceResult, 'rank'>): boolean {
   return hasRaceRank(result.rank);
}