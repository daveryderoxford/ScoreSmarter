import type { Fleet } from 'app/club-tenant/model/fleet';
import type { RaceStart } from 'app/race-calender/model/race-start';
import { isInFleet } from 'app/scoring/services/fleet-scoring';
import type { SeriesEntry } from '../model/series-entry';

const priority: Record<Fleet['type'], number> = {
  Tag: 0,
  BoatClass: 1,
  HandicapRange: 2,
  All: 3,
};

export function resolveStartTimeForEntry(
  entry: SeriesEntry,
  starts: RaceStart[] | undefined,
  fleetsById: Map<string, Fleet>,
  fallbackStart: Date | undefined,
): Date | undefined {
  if (!starts || starts.length === 0) return fallbackStart;

  const matches = starts
    .map((start, index) => ({ start, index, fleet: start.fleetId ? fleetsById.get(start.fleetId) : undefined }))
    .filter(x => x.fleet != null && isInFleet(entry, x.fleet));

  if (matches.length > 0) {
    matches.sort((a, b) => {
      const pa = priority[a.fleet!.type];
      const pb = priority[b.fleet!.type];
      return pa - pb || a.index - b.index;
    });
    if (matches.length > 1 && matches[0].fleet!.type === matches[1].fleet!.type) {
      console.warn(
        `RaceStartResolver: entry ${entry.id} matches multiple ${matches[0].fleet!.type} starts; using first row order.`,
      );
    }
    return new Date(matches[0].start.timeOfDay);
  }

  const noFleet = starts.find(s => !s.fleetId);
  if (noFleet) return new Date(noFleet.timeOfDay);

  return fallbackStart;
}

