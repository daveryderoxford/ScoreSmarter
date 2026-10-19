/**
 * Global class catalogue entry. `catalogueId` is the RYA Class ID when positive; a
 * negative id is a class the RYA does not list, allocated by a sys-admin.
 */
export interface CatalogClass {
  catalogueId: number;
  /** Clean ScoreSmarter name, used when a club adds the class. */
  name: string;
  crew: number;
  /** RYA rig code, e.g. `S` (sloop) or `U` (una). */
  rig?: string;
  /** RYA spinnaker code: `0` none, `A` asymmetric, `C` conventional. */
  spinnaker?: string;
  /** Present exactly when `catalogueId > 0`. */
  rya?: RyaClassDetails;
  /** Other names clubs use for the class; used only to suggest a link. */
  aliases?: string[];
}

export interface RyaClassDetails {
  name: string;
  /** RYA Portsmouth Number for the current list. */
  pn?: number;
  notes?: string;
}

/** Firestore document at `system/public/reference/classCatalogue`. */
export interface ClassCatalogue {
  classes: CatalogClass[];
  /** Free text describing the imported RYA list, e.g. "PN list 2026 v2". */
  ryaListVersion?: string;
  updatedAt?: Date;
}

export const CLASS_CATALOGUE_PATH = ['system', 'public', 'reference', 'classCatalogue'] as const;

export function isRyaClass(entry: Pick<CatalogClass, 'catalogueId'>): boolean {
  return entry.catalogueId > 0;
}

/** Case, spacing and punctuation insensitive key for matching class names. */
export function normaliseClassName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

/** Next id for a non-RYA class: one below the lowest existing negative id, so ids are never reused. */
export function nextNegativeCatalogueId(classes: readonly CatalogClass[]): number {
  const lowest = classes.reduce((min, c) => Math.min(min, c.catalogueId), 0);
  return lowest - 1;
}

/** Catalogue entry whose name, RYA name or alias matches `className`, to suggest a link. */
export function suggestCatalogClass(
  className: string,
  classes: readonly CatalogClass[],
): CatalogClass | undefined {
  const key = normaliseClassName(className);
  if (!key) return undefined;
  const names = (c: CatalogClass) => [c.name, c.rya?.name ?? '', ...(c.aliases ?? [])];
  return classes.find(c => names(c).some(n => normaliseClassName(n) === key));
}

/** Values a club class takes when added from a catalogue entry. */
export interface CatalogClassPrefill {
  catalogueId: number;
  name: string;
  isSinglehander: boolean;
  /** RYA PN, to pre-fill the PY handicap when the club uses PY. */
  pyHandicap?: number;
}

export function catalogClassPrefill(entry: CatalogClass): CatalogClassPrefill {
  return {
    catalogueId: entry.catalogueId,
    name: entry.name,
    isSinglehander: entry.crew === 1,
    ...(entry.rya?.pn ? { pyHandicap: entry.rya.pn } : {}),
  };
}

/** Label for pickers, e.g. "ILCA 7 (RYA 191)" or "Local Dory (non-RYA)". */
export function catalogClassLabel(entry: CatalogClass): string {
  return isRyaClass(entry) ? `${entry.name} (RYA ${entry.catalogueId})` : `${entry.name} (non-RYA)`;
}
