import type { Fleet } from 'app/club-tenant/model/fleet';
import { entryDivisionIds } from 'app/race-calendar/model/division';
import type { RaceStart } from 'app/race-calendar/model/race-start';
import { isInFleet } from 'app/scoring/app-bridge/fleet';
import type { SeriesEntry } from '../model/series-entry';

/**
 * Start time for one entry.
 * The first named start in the list that the entry matches wins, whether the
 * overlap is two fleets, two divisions, or a fleet and a division.
 * A start with neither fleet nor division is the fallback for everyone else.
 */
export function resolveStartTimeForEntry(
  entry: SeriesEntry,
  starts: RaceStart[] | undefined,
  fleetsById: Map<string, Fleet>,
  fallbackStart: Date | undefined,
): Date | undefined {
  if (!starts || starts.length === 0) return fallbackStart;

  const matches = starts.filter(start => startMatchesEntry(entry, start, fleetsById));

  if (matches.length > 0) {
    if (matches.length > 1) {
      console.warn(
        `RaceStartResolver: entry ${entry.id} matches ${matches.length} starts; using the first in list order.`,
      );
    }
    return new Date(matches[0].timeOfDay);
  }

  const defaultStart = starts.find(start => !start.fleetId && !start.divisionId);
  if (defaultStart) return new Date(defaultStart.timeOfDay);

  return fallbackStart;
}

function startMatchesEntry(
  entry: SeriesEntry,
  start: RaceStart,
  fleetsById: Map<string, Fleet>,
): boolean {
  if (start.fleetId) {
    const fleet = fleetsById.get(start.fleetId);
    return fleet != null && isInFleet(entry, fleet);
  }
  if (start.divisionId) {
    return entryDivisionIds(entry).includes(start.divisionId);
  }
  return false;
}
