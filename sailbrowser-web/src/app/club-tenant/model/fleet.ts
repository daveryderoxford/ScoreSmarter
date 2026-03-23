import { HandicapScheme } from 'app/scoring/model/handicap-scheme';

export interface AllFleet {
   type: 'All';
   id: string;
   name: 'All competitors';
}

export interface BoatClassFleet {
   type: 'BoatClass';
   id: string;
   boatClassId: string;
}

export interface HandicapRangeFleet {
   type: 'HandicapRange';
   id: string;
   name: string;
   scheme: HandicapScheme;
   min: number;
   max: number;
}

export interface TagFleet {
   type: 'Tag';
   id: string;
   name: string; // e.g. "Novice"
   value: string; // The tag string to match, e.g. "Novice"
}

export type Fleet = AllFleet | BoatClassFleet | HandicapRangeFleet | TagFleet;

export function getFleetName(fleet: Fleet): string {
   switch (fleet.type) {
      case 'All':
         return 'All competitors';
      case 'BoatClass':
         return fleet.boatClassId;
      case 'HandicapRange':
         return fleet.name;
      case 'Tag':
         return fleet.name;
   }
}
