import { Season } from 'app/race-calender/model/season';
import { BoatClass } from './boat-class';
import { ClubTagDefinition } from './club-tag';
import { Fleet } from 'app/club-tenant/model/fleet';
import { HandicapScheme } from '../../scoring/model/handicap-scheme';
import type { SuspectTimeThresholdOverrides } from 'app/results-input/services/suspect-time-rules';

export interface OODScoring {
   calculationCode: 'AvgAll' | 'AvgExcludingDiscards' | 'FixedScore';
   maxDuties: number;
}

export interface DncCalculation {
   basis: 'SeriesEntries' | 'MaxRaceCompetitors';
   offset: number;
   excludeNeverRaced: boolean;
}

export interface ScoringDefaults {
   discards: number[];
   dncCalculation: DncCalculation;
}

export interface Club {
   id: string;
   name: string;
   shortName?: string;
   contactEmail: string;
   contactName: string;
   /** Club venue latitude (WGS84) for Met Office forecasts */
   latitude?: number;
   /** Club venue longitude (WGS84) for Met Office forecasts */
   longitude?: number;
   fleets: Fleet[];
   classes: BoatClass[];
   seasons: Season[];
   /** Firebase Storage object path (e.g. clubs/{clubId}/club-logo.jpg), not an external URL. */
   logoUrl?: string;
   supportedHandicapSchemes: HandicapScheme[];
   laps?: boolean;
   oodScoring?: OODScoring;
   longSeriesDefaults: ScoringDefaults;
   shortSeriesDefaults: ScoringDefaults;
   suspectTimeThresholds?: SuspectTimeThresholdOverrides;
   /**
    * User-managed display metadata for the tag ids referenced by boats and
    * series entries. Always an array (default `[]`).
    */
   tagDefinitions: ClubTagDefinition[];
}