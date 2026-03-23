import { HandicapScheme } from './handicap-scheme';
import { Fleet } from 'app/club-tenant/model/fleet';

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
