import type { SeriesEntry } from './series-entry';
import type { Fleet } from './fleet';
import { getHandicapValue } from './handicap';

/** Fleet-membership predicate used by scoring and app workflows. */
export function isInFleet(entry: SeriesEntry, fleet: Fleet): boolean {
  switch (fleet.type) {
    case 'GeneralHandicap':
      return true;
    case 'BoatClass':
      return entry.boatClass === fleet.boatClassId;
    case 'HandicapRange': {
      const value = getHandicapValue(entry.handicaps, fleet.scheme);
      return value != null && value >= fleet.min && value <= fleet.max;
    }
    case 'Tag':
      return entryHasTagFleetValue(entry, fleet.value);
  }
}

/**
 * Whether a series entry carries a tag that satisfies a Tag fleet.
 * `fleetValue` must be the club tag definition `id`; legacy fleets may have
 * stored the display label instead — we match ids case-insensitively.
 */
export function entryHasTagFleetValue(entry: SeriesEntry, fleetValue: string): boolean {
  if (!entry.tags?.length || !fleetValue) return false;
  const target = fleetValue.toLowerCase();
  return entry.tags.some(tag => tag.toLowerCase() === target);
}
