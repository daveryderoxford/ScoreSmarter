/** A club's handicap for a class, e.g. `{ scheme: "PY", value: 1100 }`. */
export interface Handicap {
  scheme: string;
  value: number;
}

export type ClassKind = "rya" | "local";

/** Club class, as stored in `clubs/{clubId}.classes`. Mirrors the web `BoatClass`. */
export interface BoatClass {
  id: string;
  name: string;
  kind?: ClassKind;
  handicaps: Handicap[];
  isSinglehander?: boolean;
  catalogueId?: number;
  pyOverridden?: boolean;
  formerNames?: string[];
}

/** Catalogue entry at `system/public/reference/classCatalogue` (the fields used here). */
export interface CatalogClass {
  catalogueId: number;
  name: string;
  crew: number;
  rya?: { name: string; pn?: number | null };
}

export interface AddClubClassRequest {
  clubId: string;
  kind: ClassKind;
  /** RYA Class ID, for an RYA class. */
  catalogueId?: number;
  /** Name, for a local class. */
  name?: string;
  /** For a local class; an RYA class takes it from the catalogue. */
  isSinglehander?: boolean;
  /** Club handicaps. For an RYA class a PY differing from the RYA PN is an override. */
  handicaps?: Handicap[];
}

const MAX_NAME_LENGTH = 60;
const MAX_HANDICAPS = 10;

export const ryaClassId = (catalogueId: number) => `rya-${catalogueId}`;

export function localClassId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `local-${slug || "class"}`;
}

const normaliseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();
const nameKey = (name: string) => normaliseWhitespace(name).toLowerCase();

function ryaPn(entry: CatalogClass): number | undefined {
  const pn = entry.rya?.pn;
  return typeof pn === "number" && pn > 0 ? pn : undefined;
}

/** Request fields checked for type; a message describing the first problem, or the request. */
export function parseAddClubClassRequest(data: unknown): AddClubClassRequest | string {
  const d = (data ?? {}) as Record<string, unknown>;
  if (typeof d.clubId !== "string" || !d.clubId) return "Missing clubId.";
  if (d.kind !== "rya" && d.kind !== "local") return "kind must be \"rya\" or \"local\".";
  if (d.kind === "rya" && (typeof d.catalogueId !== "number" || !Number.isInteger(d.catalogueId) || d.catalogueId <= 0)) {
    return "An RYA class needs its RYA Class ID.";
  }
  if (d.kind === "local" && typeof d.name !== "string") return "A local class needs a name.";
  if (d.isSinglehander !== undefined && typeof d.isSinglehander !== "boolean") return "isSinglehander must be true or false.";

  const handicaps = d.handicaps ?? [];
  if (!Array.isArray(handicaps) || handicaps.length > MAX_HANDICAPS) return "handicaps must be a short list.";
  for (const h of handicaps as Record<string, unknown>[]) {
    if (typeof h?.scheme !== "string" || !h.scheme || typeof h.value !== "number" || !Number.isFinite(h.value) || h.value <= 0) {
      return "Each handicap needs a scheme and a positive value.";
    }
  }
  return {
    clubId: d.clubId,
    kind: d.kind,
    ...(d.kind === "rya" ? { catalogueId: d.catalogueId as number } : { name: d.name as string }),
    ...(d.isSinglehander !== undefined ? { isSinglehander: d.isSinglehander } : {}),
    handicaps: (handicaps as Handicap[]).map(h => ({ scheme: h.scheme, value: h.value })),
  };
}

/**
 * The class to add to a club with `existing` classes, or a message saying why it can't be
 * added. `catalogue` is the RYA list, used to build RYA classes and to stop RYA classes
 * being added as local ones.
 */
export function buildClubClass(
  request: AddClubClassRequest,
  existing: readonly BoatClass[],
  catalogue: readonly CatalogClass[],
): BoatClass | string {
  const handicaps = request.handicaps ?? [];
  const names = new Set(existing.map(c => nameKey(c.name)));

  if (request.kind === "rya") {
    const entry = catalogue.find(c => c.catalogueId === request.catalogueId && c.catalogueId > 0);
    if (!entry) return `RYA Class ID ${request.catalogueId} is not in the RYA list.`;
    const id = ryaClassId(entry.catalogueId);
    if (existing.some(c => c.id === id || c.catalogueId === entry.catalogueId)) {
      return `${entry.name} is already one of the club's classes.`;
    }
    if (names.has(nameKey(entry.name))) return `The club already has a class called ${entry.name}.`;

    const pn = ryaPn(entry);
    const suppliedPy = handicaps.find(h => h.scheme === "PY")?.value;
    const py = suppliedPy ?? pn;
    const others = handicaps.filter(h => h.scheme !== "PY");
    return {
      id,
      name: entry.name,
      kind: "rya",
      catalogueId: entry.catalogueId,
      isSinglehander: entry.crew === 1,
      handicaps: py !== undefined ? [{ scheme: "PY", value: py }, ...others] : others,
      pyOverridden: suppliedPy !== undefined && suppliedPy !== pn,
    };
  }

  const name = normaliseWhitespace(request.name ?? "");
  if (!name) return "Enter a class name.";
  if (name.length > MAX_NAME_LENGTH) return `Class names can be at most ${MAX_NAME_LENGTH} characters.`;
  if (names.has(nameKey(name))) return `The club already has a class called ${name}.`;
  const rya = catalogue.find(c => c.catalogueId > 0 && nameKey(c.name) === nameKey(name));
  if (rya) return `${rya.name} is in the RYA list; add it as an RYA class.`;

  const ids = new Set(existing.map(c => c.id));
  const base = localClassId(name);
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  return {
    id,
    name,
    kind: "local",
    isSinglehander: request.isSinglehander === true,
    handicaps,
  };
}
