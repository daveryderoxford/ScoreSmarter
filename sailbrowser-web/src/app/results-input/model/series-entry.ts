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
   fleetId?: string;

   // For subset scoring
   tags?: string[];
}
