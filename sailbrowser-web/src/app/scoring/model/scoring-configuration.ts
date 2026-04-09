import { HandicapScheme } from './handicap-scheme';
import { Fleet, getFleetName } from 'app/club-tenant/model/fleet';

export type ScoringConfiguration = LevelRatingConfiguration | HandicapConfiguration;

export interface BaseScoringConfiguration {
   id: string;
   name: string;
   fleet: Fleet;
}

export interface LevelRatingConfiguration extends BaseScoringConfiguration {
   type: 'LevelRating';
   handicapScheme: 'Level Rating';
}

export interface HandicapConfiguration extends BaseScoringConfiguration {
   type: 'Handicap';
   handicapScheme: Exclude<HandicapScheme, 'Level Rating'>;
}

export function getConfigName(fleet: Fleet, hcapScheme: HandicapScheme) {
   switch (fleet.type) {
      case 'BoatClass':
         return getFleetName(fleet);
      case 'Tag':
         return getFleetName(fleet);
      case 'GeneralHandicap':
      case 'HandicapRange':
         return hcapScheme;
   }

}


