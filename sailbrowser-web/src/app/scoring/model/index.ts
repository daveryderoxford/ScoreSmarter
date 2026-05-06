export type { Race } from './race';
export type { RaceCompetitor } from './race-competitor';
export type { SeriesEntry } from './series-entry';
export type { Fleet } from './fleet';
export { isInFleet } from './fleet-membership';

export type { Handicap } from './handicap';
export type { HandicapScheme } from './handicap-scheme';
export { getHandicapValue, getScorableHandicapValue } from './handicap';

export type { RaceType } from './race-type';
export { doesRaceRequireHandicap, RACE_TYPES } from './race-type';

export type { MergeStrategy, CompetitorKey } from './merge-strategy';
export { mergeKeyFor } from './merge-strategy';

export type { ResultCode } from './result-code';
export { RESULT_CODES } from './result-code';

export type { DncCalculation, OODScoring, ScoringPolicy } from './scoring-policy';
export type { ScoringConfiguration } from './scoring-configuration';

export type { PublishedRace, RaceResult } from './scored-race';
export type { PublishedSeriesResult } from './series-result';
export type { ScoringDiagnostics } from './diagnostics';
