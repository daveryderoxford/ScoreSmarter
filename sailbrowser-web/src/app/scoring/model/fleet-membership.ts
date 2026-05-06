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
      return !!entry.tags && entry.tags.includes(fleet.value);
  }
}
