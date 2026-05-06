import type { Fleet } from 'app/club-tenant/model/fleet';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { isInFleet as isInFleetRule } from 'app/scoring/model/fleet-membership';

/** App bridge for non-scoring callers that need fleet membership checks. */
export function isInFleet(entry: SeriesEntry, fleet: Fleet): boolean {
  return isInFleetRule(entry, fleet);
}
