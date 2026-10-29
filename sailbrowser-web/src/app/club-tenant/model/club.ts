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

/**
 * Where a new club is in setting itself up (set by the onboarding functions). Clubs
 * created before onboarding have no status and are established.
 */
export type OnboardingStatus = 'awaiting-admin' | 'setting-up' | 'complete';

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
   /** Version of the RYA PY list last applied to the club's RYA classes, e.g. "Oct 26". */
   ryaPyListVersion?: string;
   seasons: Season[];
   /** Firebase Storage object path (e.g. clubs/{clubId}/club-logo.jpg). */
   logoUrl?: string;
   /** Public club website; shown in navigation and sidenav. */
   websiteUrl?: string;
   /** RYA club affiliation ID, required for PY returns. */
   ryaAffiliationId?: string;
   supportedHandicapSchemes: HandicapScheme[];
   laps?: boolean;
   oodScoring?: OODScoring;
   longSeriesDefaults: ScoringDefaults;
   shortSeriesDefaults: ScoringDefaults;
   suspectTimeThresholds?: SuspectTimeThresholdOverrides;
   onboardingStatus?: OnboardingStatus;
   onboardingStartedAt?: Date;
   adminJoinedAt?: Date;
}