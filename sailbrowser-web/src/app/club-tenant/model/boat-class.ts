import { Handicap } from 'app/scoring/model/handicap';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';

/**
 * `rya`: a class from the RYA list in the class catalogue; its id and name come from the
 * catalogue and can't be changed, and its ratings come from the published rating lists
 * unless overridden. `local`: a club-only class.
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
   /** Schemes whose rating the club sets for this RYA class instead of using the published rating list. */
   overriddenSchemes?: HandicapScheme[];
   /** Superseded by `overriddenSchemes`; still read on classes saved before it. */
   pyOverridden?: boolean;
   /** Names the class had before being renamed; results published earlier still use them. */
   formerNames?: string[];
}

export function isSinglehanderClass(className: string, classes: readonly BoatClass[]): boolean {
   return classes.find(c => c.name === className)?.isSinglehander === true;
}
