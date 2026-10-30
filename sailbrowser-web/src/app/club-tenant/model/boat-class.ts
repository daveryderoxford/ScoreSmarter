import { Handicap } from 'app/scoring/model/handicap';

/**
 * `rya`: a class from the RYA list in the class catalogue; its id, name and default PY
 * come from the catalogue and the name can't be changed. `local`: a club-only class.
 */
export type ClassKind = 'rya' | 'local';

export interface BoatClass {
   /** `rya-<RYA Class ID>` or `local-<slug>`; older classes may still use their original name. */
   id: string;
   name: string;
   /** Missing on classes saved before kinds existed; use `classKind()`. */
   kind?: ClassKind;
   handicaps: Handicap[];
   isSinglehander?: boolean;
   /** RYA Class ID (RYA classes). Older classes may hold a negative non-RYA catalogue id. */
   catalogueId?: number;
   /** RYA class whose PY was set by the club; applying an updated RYA list leaves it alone. */
   pyOverridden?: boolean;
   /** Names the class had before being renamed; results published earlier still use them. */
   formerNames?: string[];
}

export function isSinglehanderClass(className: string, classes: readonly BoatClass[]): boolean {
   return classes.find(c => c.name === className)?.isSinglehander === true;
}
