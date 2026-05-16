import { Handicap } from 'app/scoring/model/handicap';
import { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';

export interface SeriesEntry {
   id: string;
   seriesId: string;

   // Core Identity
   helm: string;
   crew?: string;
   club?: string;

   // Default Boat Details
   boatClass: string;
   sailNumber: number;
   handicaps: Handicap[];
   personalHandicapBand?: PersonalHandicapBand;

   /**
    * User-authored tag ids carried on this entry (e.g. 'gold', 'u16').
    * Always an array (default `[]`); display metadata is resolved against
    * `Club.tagDefinitions` and the published-results snapshots.
    */
   tags: string[];
}
