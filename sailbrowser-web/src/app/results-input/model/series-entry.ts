import type { SailNumber } from 'app/boats/model/sail-number';
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
   sailNumber: SailNumber;
   /** Yacht or named boat; display-only, not part of per-hull identity. */
   boatName?: string;
   handicaps: Handicap[];
   personalHandicapBand?: PersonalHandicapBand;

   /**
    * User-authored tag ids carried on this entry (e.g. 'gold', 'u16').
    * Always an array (default `[]`); display metadata is resolved against
    * `Club.tagDefinitions` and the published-results snapshots.
    */
   tags: string[];
}
