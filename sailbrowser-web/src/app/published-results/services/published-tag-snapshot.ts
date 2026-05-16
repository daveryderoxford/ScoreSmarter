import type { ClubTagDefinition } from 'app/club-tenant/model/club-tag';
import { normalizeTagIds } from './resolved-tag';

/**
 * Builds the immutable `tagDefinitions` snapshot stored on a
 * `PublishedRace` or `PublishedSeries` document.
 *
 * The snapshot is the subset of `clubDefinitions` whose `id` is actually
 * referenced by any row in the document at publish time. Persisting only
 * referenced definitions:
 *
 *  - keeps document size proportional to its content (a club with 50 tags
 *    doesn't bloat every results doc),
 *  - guarantees historical results render stably even if the club later
 *    renames or deletes a tag definition.
 *
 * Pure function over `published-results` / `club-tenant` types so it can be
 * called from `ScoringEngine` without dragging in any UI dependencies. The
 * scoring layer never imports this helper - it operates on tag ids only.
 */
export function buildTagDefinitionSnapshot(
  referencedIds: Iterable<string>,
  clubDefinitions: readonly ClubTagDefinition[],
): ClubTagDefinition[] {
  const wanted = new Set(normalizeTagIds([...referencedIds], clubDefinitions));
  if (wanted.size === 0) return [];
  return clubDefinitions.filter(def => wanted.has(def.id));
}

/** Unions published tag snapshots (e.g. per-race + series) for read-time resolution. */
export function mergeTagDefinitionSnapshots(
  ...lists: readonly (readonly ClubTagDefinition[])[]
): ClubTagDefinition[] {
  const byId = new Map<string, ClubTagDefinition>();
  for (const list of lists) {
    for (const def of list) {
      if (!byId.has(def.id)) {
        byId.set(def.id, def);
      }
    }
  }
  return [...byId.values()];
}
