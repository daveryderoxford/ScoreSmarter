import type { Race } from 'app/race-calender/model/race';
import type { Division } from 'app/race-calender/model/division';
import { entryDivisionIds } from 'app/race-calender/model/division';
import type { Series } from 'app/race-calender/model/series';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import {
  entriesMatchIdentity,
  type PerHullIdentity,
} from 'app/results-input/services/series-entry-identity';

/** First non-empty series division catalog among the given races. */
export function divisionCatalogForRaces(
  races: readonly { seriesId: string }[],
  allSeries: readonly Pick<Series, 'id' | 'divisions'>[],
): Division[] {
  const seriesById = new Map(allSeries.map(s => [s.id, s]));
  for (const race of races) {
    const series = seriesById.get(race.seriesId);
    if (series?.divisions?.length) return series.divisions;
  }
  return [];
}

/**
 * Prefills division ids from an existing per-hull series entry for the
 * first matching series among `races`. Returns `[]` when none match.
 */
export async function prefillDivisionsFromExistingEntry(
  identity: PerHullIdentity,
  races: readonly Race[],
  getSeriesEntries: (seriesId: string) => Promise<readonly SeriesEntry[]>,
): Promise<string[]> {
  const seriesIds = [...new Set(races.map(r => r.seriesId))];
  for (const seriesId of seriesIds) {
    const entries = await getSeriesEntries(seriesId);
    const match = entries.find(e => entriesMatchIdentity(e, identity));
    if (match) return entryDivisionIds(match);
  }
  return [];
}
