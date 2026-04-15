import type { Handicap } from 'app/scoring/model/handicap';
import type { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';

export interface Boat {
  id: string;
  sailNumber: number;
  boatClass: string;
  name: string;
  helm: string;
  crew: string;
  isClub: boolean;
  /** Boat-level handicaps (e.g. IRC, Personal) when the club supports them */
  handicaps?: Handicap[];
  /** Personal handicap band used to derive Personal handicap from PY */
  personalHandicapBand?: PersonalHandicapBand;
}
