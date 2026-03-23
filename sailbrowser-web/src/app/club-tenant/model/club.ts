import { Season } from 'app/race-calender/model/season';
import { BoatClass } from './boat-class';
import { Fleet } from 'app/club-tenant/model/fleet';
import { HandicapScheme } from '../../scoring/model/handicap-scheme';

export interface Club {
   id: string;
   name: string;
   shortName?: string;
   contactEmail: string;
   contactName: string;
   fleets: Fleet[];
   classes: BoatClass[];
   seasons: Season[];
   logoUrl?: string;
   supportedHandicapSchemes: HandicapScheme[];
}