import type { Handicap } from 'app/scoring/model/handicap';

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
}
