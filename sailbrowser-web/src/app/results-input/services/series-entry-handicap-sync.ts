import type { BoatClass } from 'app/club-tenant/model/boat-class';
import type { RatingList } from 'app/club-tenant/model/rating-list';
import { resolveHandicapsForSeries } from 'app/entry/services/entry-helpers';
import type { Series } from 'app/race-calender/model/series';
import type { Handicap } from 'app/scoring/model/handicap';
import type { SeriesEntry } from '../model/series-entry';

export interface SeriesEntryHandicapSyncUpdate {
  entry: SeriesEntry;
  handicaps: Handicap[];
}

export interface SeriesEntryHandicapSyncPlan {
  updated: SeriesEntryHandicapSyncUpdate[];
  unchanged: number;
  skippedUnknownClass: number;
  unknownClassNames: string[];
}

export function handicapsEqual(a: Handicap[] | undefined, b: Handicap[] | undefined): boolean {
  const ax = [...(a ?? [])].sort((x, y) => x.scheme.localeCompare(y.scheme));
  const bx = [...(b ?? [])].sort((x, y) => x.scheme.localeCompare(y.scheme));
  if (ax.length !== bx.length) return false;
  for (let i = 0; i < ax.length; i++) {
    if (ax[i].scheme !== bx[i].scheme || ax[i].value !== bx[i].value) return false;
  }
  return true;
}

/**
 * Recomputes handicaps from the class ratings for the series (no entry overrides), so
 * ratings come from the lists in force when the series started.
 * Returns `null` when `entry.boatClass` is not in the club catalog.
 */
export function recomputeEntryHandicapsFromClass(
  series: Series,
  entry: SeriesEntry,
  clubClasses: BoatClass[],
  ratingLists: readonly RatingList[],
): Handicap[] | null {
  const classMatch = clubClasses.some(c => c.name === entry.boatClass);
  if (!classMatch) return null;

  return resolveHandicapsForSeries(
    series,
    {
      boatClassName: entry.boatClass,
      personalHandicapBand: entry.personalHandicapBand,
      personalHandicapUnknown: !entry.personalHandicapBand,
    },
    clubClasses,
    ratingLists,
  );
}

export function planSeriesEntryHandicapSync(
  series: Series,
  entries: SeriesEntry[],
  clubClasses: BoatClass[],
  ratingLists: readonly RatingList[],
): SeriesEntryHandicapSyncPlan {
  const updated: SeriesEntryHandicapSyncUpdate[] = [];
  let unchanged = 0;
  let skippedUnknownClass = 0;
  const unknownClassNames = new Set<string>();

  for (const entry of entries) {
    const recomputed = recomputeEntryHandicapsFromClass(series, entry, clubClasses, ratingLists);
    if (recomputed === null) {
      skippedUnknownClass++;
      unknownClassNames.add(entry.boatClass);
      continue;
    }
    if (handicapsEqual(entry.handicaps, recomputed)) {
      unchanged++;
      continue;
    }
    updated.push({ entry, handicaps: recomputed });
  }

  return {
    updated,
    unchanged,
    skippedUnknownClass,
    unknownClassNames: [...unknownClassNames].sort((a, b) => a.localeCompare(b)),
  };
}
