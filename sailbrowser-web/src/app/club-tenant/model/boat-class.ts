import { Handicap } from 'app/scoring/model/handicap';

export interface BoatClass {
   id: string;
   name: string;
   handicaps: Handicap[];
   isSinglehander?: boolean;
}

export function isSinglehanderClass(className: string, classes: readonly BoatClass[]): boolean {
   return classes.find(c => c.name === className)?.isSinglehander === true;
}