import { SeriesEntry } from 'app/results-input/model/series-entry';
import { Fleet } from 'app/club-tenant/model/fleet';
import { getHandicapValue } from 'app/scoring/model/handicap';

/**
 * Fleet membership for HandicapRange uses `HandicapRangeFleet.scheme` to pick which
 * handicap value from `entry.handicaps` is compared to min/max.
 * (Scoring pass eligibility / “has rating for this algorithm” is separate: use
 * `HandicapConfiguration.handicapScheme` in the scoring engine.)
 */
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
