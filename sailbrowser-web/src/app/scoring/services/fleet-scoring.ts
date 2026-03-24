import { SeriesEntry } from 'app/results-input/model/series-entry';
import { Fleet } from 'app/club-tenant/model/fleet';

export function isInFleet(entry: SeriesEntry, fleet: Fleet): boolean {
   switch (fleet.type) {
      case 'All':
         return true;
      case 'BoatClass':
         return entry.boatClass === fleet.boatClassId;
      case 'HandicapRange':
         // Assuming entry.handicap is the handicap for the fleet's scheme
         return entry.handicap >= fleet.min && entry.handicap <= fleet.max;
      case 'Tag':
         return !!entry.tags && entry.tags.includes(fleet.value);
   }
}
