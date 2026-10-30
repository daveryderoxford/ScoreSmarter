import { parseCsv } from 'app/shared/utils/csv';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';
import type { CatalogClass } from './catalog-class';

/** One row of the RYA class configuration / PN list. */
export interface RyaClassRow {
  ryaClassId: number;
  name: string;
  crew: number;
  rig?: string;
  spinnaker?: string;
  pn?: number;
  notes?: string;
}

export interface RyaClassListParse {
  rows: RyaClassRow[];
  errors: string[];
  /** A PN column was found (needed to import a PY list). */
  hasPnColumn?: boolean;
}

type Column = 'id' | 'name' | 'crew' | 'rig' | 'spinnaker' | 'pn' | 'notes';

const COLUMN_PATTERNS: Record<Column, RegExp> = {
  id: /CLASSID/,
  name: /CLASSNAME/,
  crew: /CREW/,
  rig: /^RIG/,
  spinnaker: /SPINN/,
  pn: /^(RYA)?(\d{2,4})?(NUMBER|PN|PY|PYNUMBER|PORTSMOUTHNUMBER|PORTSMOUTHYARDSTICK)(\d{2,4})?$/,
  notes: /NOTES/,
};

const headerKey = (h: string) => h.toUpperCase().replace(/[^A-Z0-9]+/g, '');
const optional = (value: string | undefined) => normaliseWhitespace(value) || undefined;

/**
 * Parses the RYA list saved as CSV from the RYA spreadsheet. Title rows above the
 * header (e.g. "RYA PN LIST - Dinghy") are skipped; rows without a numeric class id
 * (notes, blank lines) are ignored.
 */
export function parseRyaClassList(text: string): RyaClassListParse {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex(line => /class\s*id/i.test(line));
  if (headerIndex < 0) {
    return { rows: [], errors: ['No header row with an "RYA Class ID" column was found.'] };
  }

  const parsed = parseCsv(lines.slice(headerIndex).join('\n'));
  const columns = new Map<Column, string>();
  for (const header of parsed.header) {
    const key = headerKey(header);
    for (const [column, pattern] of Object.entries(COLUMN_PATTERNS) as [Column, RegExp][]) {
      if (!columns.has(column) && pattern.test(key)) columns.set(column, header);
    }
  }
  const missing = (['id', 'name'] as Column[]).filter(c => !columns.has(c));
  if (missing.length > 0) {
    return { rows: [], errors: [`Missing required column(s): ${missing.join(', ')}.`] };
  }

  const cell = (row: Record<string, string>, column: Column) =>
    columns.has(column) ? row[columns.get(column)!] : undefined;

  const rows: RyaClassRow[] = [];
  const errors = [...parsed.errors];
  const seen = new Set<number>();
  for (const row of parsed.rows) {
    const ryaClassId = Number.parseInt(cell(row, 'id')?.trim() ?? '', 10);
    const name = normaliseWhitespace(cell(row, 'name'));
    if (!Number.isInteger(ryaClassId) || ryaClassId <= 0 || !name) continue;
    if (seen.has(ryaClassId)) {
      errors.push(`RYA Class ID ${ryaClassId} appears more than once; the first row is used.`);
      continue;
    }
    seen.add(ryaClassId);
    const crew = Number.parseInt(cell(row, 'crew') ?? '', 10);
    const pn = Number.parseInt(cell(row, 'pn') ?? '', 10);
    rows.push({
      ryaClassId,
      name,
      crew: Number.isInteger(crew) && crew > 0 ? crew : 1,
      rig: optional(cell(row, 'rig')),
      spinnaker: optional(cell(row, 'spinnaker')),
      pn: Number.isInteger(pn) && pn > 0 ? pn : undefined,
      notes: optional(cell(row, 'notes')),
    });
  }
  return { rows, errors, hasPnColumn: columns.has('pn') };
}

/**
 * Starting ScoreSmarter name for a new RYA entry: all-caps RYA names are title-cased,
 * keeping words with digits and short acronyms (RS, OK, GP14) as they are.
 * Mixed-case names are kept. Sys-admins can edit the result.
 */
export function cleanRyaClassName(ryaName: string): string {
  const name = normaliseWhitespace(ryaName);
  if (name !== name.toUpperCase()) return name;
  return name
    .split(' ')
    .map(word => (/\d/.test(word) || word.length <= 3 ? word : word[0] + word.slice(1).toLowerCase()))
    .join(' ');
}

export interface RyaClassDifference {
  entry: CatalogClass;
  /** E.g. `crew 2 → 1`. */
  changes: string[];
}

export interface RyaMergeResult {
  classes: CatalogClass[];
  added: number;
  unchanged: number;
  /** Published entries whose row in the file differs; they are kept as published. */
  differences: RyaClassDifference[];
  /** RYA ids in the catalogue but not in this list (kept, so club classes stay valid). */
  notInList: CatalogClass[];
}

/**
 * Adds the RYA list's new classes to the catalogue. Published entries are fixed and are
 * not changed; rows that differ from them are reported. Non-RYA entries are untouched.
 */
export function mergeRyaClassList(existing: readonly CatalogClass[], rows: readonly RyaClassRow[]): RyaMergeResult {
  const byId = new Map(existing.map(c => [c.catalogueId, c] as const));
  const importedIds = new Set(rows.map(r => r.ryaClassId));
  const classes = [...existing];
  const differences: RyaClassDifference[] = [];
  let added = 0;
  let unchanged = 0;

  for (const row of rows) {
    const current = byId.get(row.ryaClassId);
    if (!current) {
      classes.push({
        catalogueId: row.ryaClassId,
        name: cleanRyaClassName(row.name),
        crew: row.crew,
        ...(row.rig ? { rig: row.rig } : {}),
        ...(row.spinnaker ? { spinnaker: row.spinnaker } : {}),
        rya: { name: row.name, ...(row.notes ? { notes: row.notes } : {}) },
      });
      added++;
      continue;
    }
    const changes = classChanges(current, row);
    if (changes.length > 0) differences.push({ entry: current, changes });
    else unchanged++;
  }

  const notInList = existing.filter(c => c.catalogueId > 0 && !importedIds.has(c.catalogueId));
  return { classes, added, unchanged, differences, notInList };
}

function classChanges(entry: CatalogClass, row: RyaClassRow): string[] {
  const fields: [string, unknown, unknown][] = [
    ['RYA name', entry.rya?.name, row.name],
    ['crew', entry.crew, row.crew],
    ['rig', entry.rig, row.rig],
    ['spinnaker', entry.spinnaker, row.spinnaker],
  ];
  return fields
    .filter(([, was, now]) => (was ?? '') !== (now ?? ''))
    .map(([field, was, now]) => `${field} ${was ?? '—'} → ${now ?? '—'}`);
}

export interface PyRatingsImport {
  /** PN by catalogue id, for RYA classes in the catalogue. */
  ratings: Record<string, number>;
  /** RYA ids with a PN that aren't in the catalogue; import the class list first. */
  unknownIds: number[];
  errors: string[];
}

/** The PNs in an RYA list, keyed by catalogue id, for a PY rating list. */
export function pyRatingsFromRyaList(
  parse: RyaClassListParse,
  catalogue: readonly CatalogClass[],
): PyRatingsImport {
  const ids = new Set(catalogue.map(c => c.catalogueId));
  const ratings: Record<string, number> = {};
  const unknownIds: number[] = [];
  for (const row of parse.rows) {
    if (row.pn === undefined) continue;
    if (ids.has(row.ryaClassId)) ratings[String(row.ryaClassId)] = row.pn;
    else unknownIds.push(row.ryaClassId);
  }
  const errors = [...parse.errors];
  if (!parse.hasPnColumn) errors.push('No PN column was found.');
  else if (Object.keys(ratings).length === 0 && unknownIds.length === 0) errors.push('The PN column has no PNs.');
  return { ratings, unknownIds, errors };
}
