import { Season } from 'app/race-calender/model/season';
import { BoatClass } from './boat-class';
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
   fleets: Fleet[];
   classes: BoatClass[];
   seasons: Season[];
   logoUrl?: string;
   supportedHandicapSchemes: HandicapScheme[];
   laps?: boolean;
   oodScoring?: OODScoring;
   longSeriesDefaults: ScoringDefaults;
   shortSeriesDefaults: ScoringDefaults;
   suspectTimeThresholds?: SuspectTimeThresholdOverrides;
}