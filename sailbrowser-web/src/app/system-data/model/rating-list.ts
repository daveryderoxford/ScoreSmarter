import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';

/**
 * A published list of class ratings for one handicap scheme, e.g. the RYA PY list for
 * 2027. A series uses the list in force on its start date, so series already running keep
 * the ratings they started with.
 */
export interface RatingList {
  id: string;
  scheme: HandicapScheme;
  /** E.g. "RYA". */
  issuer: string;
  /** E.g. "PN 2027". */
  name: string;
  effectiveFrom: Date;
  /** Rating by class catalogue id. */
  ratings: Record<string, number>;
}

/** Collection `system/public/ratingLists`. */
export const RATING_LISTS_PATH = ['system', 'public', 'ratingLists'] as const;

/** The list for `scheme` in force on `date`: the latest with `effectiveFrom` on or before it. */
export function ratingListFor(
  lists: readonly RatingList[],
  scheme: HandicapScheme,
  date: Date,
): RatingList | undefined {
  let found: RatingList | undefined;
  for (const list of lists) {
    if (list.scheme !== scheme || list.effectiveFrom.getTime() > date.getTime()) continue;
    if (!found || list.effectiveFrom.getTime() > found.effectiveFrom.getTime()) found = list;
  }
  return found;
}

/** The first list for `scheme` taking effect after `date`, if one is already published. */
export function nextRatingList(
  lists: readonly RatingList[],
  scheme: HandicapScheme,
  date: Date,
): RatingList | undefined {
  let found: RatingList | undefined;
  for (const list of lists) {
    if (list.scheme !== scheme || list.effectiveFrom.getTime() <= date.getTime()) continue;
    if (!found || list.effectiveFrom.getTime() < found.effectiveFrom.getTime()) found = list;
  }
  return found;
}

export function listRating(list: RatingList | undefined, catalogueId: number | undefined): number | undefined {
  if (!list || catalogueId === undefined) return undefined;
  const rating = list.ratings[String(catalogueId)];
  return typeof rating === 'number' && rating > 0 ? rating : undefined;
}

/** The date that decides which lists a series uses: its first race, or today before it has races. */
export function seriesRatingDate(series: { startDate?: Date | null }, today = new Date()): Date {
  return series.startDate ?? today;
}
