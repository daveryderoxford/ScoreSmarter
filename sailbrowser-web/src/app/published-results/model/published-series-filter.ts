import type { Series } from 'app/race-calender/model/series';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import type { SeriesInfo } from './published-season';

export interface PublishedSeriesFilter {
  /** Hide secondary scoring and separately scored division series. */
  excludeSecondary?: boolean;
  /** Hide series scored with Level Rating. */
  excludeLevelRating?: boolean;
}

/** Calendar series a published series was scored from (secondary ids are `{id}_{configId}` or `{id}_div_{divisionId}`). */
export function calendarSeriesId(info: SeriesInfo): string {
  if (info.baseSeriesId) return info.baseSeriesId;
  const separator = info.id.indexOf('_');
  return separator < 0 ? info.id : info.id.slice(0, separator);
}

export function isSecondarySeries(info: SeriesInfo): boolean {
  return info.id !== calendarSeriesId(info);
}

/** Handicap scheme of the scoring configuration a published series was scored with, from its calendar series. */
export function calendarHandicapScheme(info: SeriesInfo, series: Series): HandicapScheme | undefined {
  const suffix = info.id.slice(calendarSeriesId(info).length);
  if (suffix === '' || suffix.startsWith('_div_')) return series.primaryScoringConfiguration.handicapScheme;
  const configId = suffix.slice(1);
  return series.secondaryScoringConfigurations?.find(c => c.id === configId)?.handicapScheme;
}

/**
 * Series that pass the filter. `schemes` (by published series id) covers series published
 * before `SeriesInfo.handicapScheme` was recorded; a series with no known scheme is kept.
 */
export function filterPublishedSeries(
  series: readonly SeriesInfo[],
  filter: PublishedSeriesFilter,
  schemes: ReadonlyMap<string, HandicapScheme> = new Map(),
): SeriesInfo[] {
  return series.filter(info => {
    if (filter.excludeSecondary && isSecondarySeries(info)) return false;
    if (filter.excludeLevelRating && (info.handicapScheme ?? schemes.get(info.id)) === 'Level Rating') return false;
    return true;
  });
}
