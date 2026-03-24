export type { SeriesEntryMatchingStrategy as SeriesEntryGrouping } from '../entry/model/entry-grouping';
export { SERIES_ENTRY_GROUPING, seriesEntryMatchingStrategys as seriesEntryGroupingDetails } from '../entry/model/entry-grouping';

export type { HandicapScheme as HandicapSystem } from './model/handicap-scheme';
export { HANDICAP_SCHEMES as HANDICAP_SYSTEMS } from './model/handicap-scheme';

export type { ResultCode, ResultCodeDefinition } from './model/result-code';
export { RESULT_CODES, ResultCodeGroup, RESULT_CODE_DEFINITIONS, getResultCodeDefinition } from './model/result-code';

export type { SeriesScoringScheme } from './model/scoring-algotirhm';
export { SERIES_SCORING_SCHEMES, seriesScoringSchemeDetails } from './model/scoring-algotirhm';

export type { ScoringConfiguration } from './model/scoring-configuration';

// Services
export { score } from './services/scorer';

