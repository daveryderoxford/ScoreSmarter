import { SeriesEntry } from '../model/series-entry';
import type { SeriesEntryMatchingStrategy } from 'app/entry/model/entry-grouping';

/**
 * Per-hull identity tuple used to enforce the "one SeriesEntry per
 * (boatClass, sailNumber, helm)" invariant. Pulled out of the create/edit
 * services so every write path uses the same case-insensitive comparison
 * rules and there is exactly one place to change if the invariant evolves.
 */
export interface PerHullIdentity {
  boatClass: string;
  sailNumber: number;
  helm: string;
}

const norm = (s: string | undefined): string => (s ?? '').trim().toLowerCase();

export function entriesMatchIdentity(a: PerHullIdentity, b: PerHullIdentity): boolean {
  return (
    norm(a.boatClass) === norm(b.boatClass) &&
    a.sailNumber === b.sailNumber &&
    norm(a.helm) === norm(b.helm)
  );
}

/**
 * Returns the first entry in `entries` whose normalised per-hull identity
 * matches `identity`, optionally ignoring an entry with id `excludeId`. The
 * `excludeId` escape hatch is used when validating an in-place rename so
 * the entry being edited doesn't match itself.
 */
export function findCollidingEntry(
  entries: SeriesEntry[],
  identity: PerHullIdentity,
  excludeId?: string,
): SeriesEntry | undefined {
  return entries.find(e => e.id !== excludeId && entriesMatchIdentity(e, identity));
}

/**
 * Returns ALL entries that share `identity`. Callers should normally see at
 * most one match; more than one indicates a corrupt dataset that violates
 * the per-hull invariant and must be resolved before further writes.
 */
export function findAllMatchingEntries(
  entries: SeriesEntry[],
  identity: PerHullIdentity,
): SeriesEntry[] {
  return entries.filter(e => entriesMatchIdentity(e, identity));
}

export function describeIdentity(identity: PerHullIdentity): string {
  return `${identity.helm} / ${identity.boatClass} #${identity.sailNumber}`;
}

/**
 * Why a proposed entry conflicts with an existing one in the same race:
 *  - `sameEntry`              — exact (class+sail+helm) match. Always a conflict
 *                                regardless of strategy: the same hull is being
 *                                signed on twice.
 *  - `sameHullDifferentHelm`  — strategy `classSailNumber` only. Two helms on
 *                                the same physical boat in one race.
 *  - `sameHelmDifferentHull`  — strategy `helm` only. The same sailor signed
 *                                onto two boats in one race (impossible on
 *                                the water and breaks merged-helm scoring).
 */
export type EntryConflictReason =
  | 'sameEntry'
  | 'sameHullDifferentHelm'
  | 'sameHelmDifferentHull';

const sameHull = (a: PerHullIdentity, b: PerHullIdentity): boolean =>
  norm(a.boatClass) === norm(b.boatClass) && a.sailNumber === b.sailNumber;

const sameHelm = (a: PerHullIdentity, b: PerHullIdentity): boolean =>
  norm(a.helm) === norm(b.helm);

/**
 * Detects whether `existing` and `incoming` would clash inside the same race
 * given the series' merging strategy. Returns `null` when the two entries can
 * happily coexist in one race. The same-identity case always wins so callers
 * can rely on the most specific reason being reported.
 */
export function detectInRaceConflict(
  existing: PerHullIdentity,
  incoming: PerHullIdentity,
  strategy: SeriesEntryMatchingStrategy,
): EntryConflictReason | null {
  if (entriesMatchIdentity(existing, incoming)) {
    return 'sameEntry';
  }
  switch (strategy) {
    case 'classSailNumberHelm':
    case 'regatta':
      return null;
    case 'classSailNumber':
      return sameHull(existing, incoming) ? 'sameHullDifferentHelm' : null;
    case 'helm':
      return sameHelm(existing, incoming) ? 'sameHelmDifferentHull' : null;
  }
}
