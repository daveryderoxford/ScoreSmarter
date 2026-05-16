import { CLUB_TAG_COLORS, type ClubTagDefinition } from 'app/club-tenant/model/club-tag';

/**
 * A tag id resolved against a `ClubTagDefinition[]` snapshot, in a shape
 * that result-table templates can render directly.
 *
 * `unresolved` is `true` when no definition matched - the renderer is
 * expected to use default styling and show the raw `id` instead of a
 * fancy chip.
 */
export interface ResolvedTag {
  id: string;
  /** Display label; falls back to `id` for unresolved tags. */
  label: string;
  /** Hex colour, or `undefined` for default styling. */
  color?: string;
  unresolved: boolean;
}

function labelKey(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Finds a club tag definition for a raw stored id.
 * Matches exact id, then case-insensitive id, then unique label (legacy fleets
 * sometimes stored display labels such as `Youth` instead of `youth`).
 */
export function findTagDefinition(
  rawId: string,
  definitions: readonly ClubTagDefinition[],
): ClubTagDefinition | undefined {
  if (!rawId) return undefined;

  const exact = definitions.find(d => d.id === rawId);
  if (exact) return exact;

  const lower = rawId.toLowerCase();
  const byId = definitions.find(d => d.id.toLowerCase() === lower);
  if (byId) return byId;

  const key = labelKey(rawId);
  const byLabel = definitions.filter(d => labelKey(d.label) === key);
  return byLabel.length === 1 ? byLabel[0] : undefined;
}

/**
 * Maps stored tag ids to canonical definition ids, deduplicating aliases
 * (e.g. `Youth` + `youth` → `youth`) while preserving first-seen order.
 * Unrecognised ids are kept as-is so callers can still surface them.
 */
export function normalizeTagIds(
  ids: readonly string[],
  definitions: readonly ClubTagDefinition[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of ids) {
    if (!raw) continue;
    const def = findTagDefinition(raw, definitions);
    const canonical = def?.id ?? raw;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

function toResolvedTag(id: string, def: ClubTagDefinition | undefined): ResolvedTag {
  if (!def || !def.label || def.label.trim().length === 0) {
    return {
      id,
      label: id,
      unresolved: true,
    };
  }
  return {
    id: def.id,
    label: def.label,
    color: def.color ? CLUB_TAG_COLORS[def.color] : undefined,
    unresolved: false,
  };
}

/**
 * Resolves `ids` against `definitions`, preserving the input order.
 * Aliases are canonicalized and deduplicated before rendering.
 * Definitions with blank labels are treated as intentionally hidden and
 * surfaced as `unresolved` so callers fall back to default styling.
 *
 * Pure function; no logging, no Angular imports - safe to use from
 * Storybook stories and unit tests as well as live result-table
 * components.
 */
export function resolveTags(
  ids: readonly string[],
  definitions: readonly ClubTagDefinition[],
): ResolvedTag[] {
  const canonicalIds = normalizeTagIds(ids, definitions);
  if (canonicalIds.length === 0) return [];

  const defsById = new Map<string, ClubTagDefinition>();
  for (const def of definitions) defsById.set(def.id, def);

  return canonicalIds.map(id => toResolvedTag(id, defsById.get(id)));
}
