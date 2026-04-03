import { Handicap } from 'app/scoring/model/handicap';

export interface BoatClass {
   id: string;
   name: string;
   handicaps: Handicap[];
}