import { parseCsv } from 'app/shared/utils/csv';
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
}

type Column = 'id' | 'name' | 'crew' | 'rig' | 'spinnaker' | 'pn' | 'notes';

const COLUMN_PATTERNS: Record<Column, RegExp> = {
  id: /CLASSID/,
  name: /CLASSNAME/,
  crew: /CREW/,
  rig: /^RIG/,
  spinnaker: /SPINN/,
  pn: /^(NUMBER|PN|PYNUMBER|PORTSMOUTHNUMBER)$/,
  notes: /NOTES/,
};

const headerKey = (h: string) => h.toUpperCase().replace(/[^A-Z0-9]+/g, '');
const optional = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);

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
    const name = cell(row, 'name')?.replace(/\s+/g, ' ').trim();
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
  return { rows, errors };
}

/**
 * Starting ScoreSmarter name for a new RYA entry: all-caps RYA names are title-cased,
 * keeping words with digits and short acronyms (RS, OK, GP14) as they are.
 * Mixed-case names are kept. Sys-admins can edit the result.
 */
export function cleanRyaClassName(ryaName: string): string {
  const name = ryaName.replace(/\s+/g, ' ').trim();
  if (name !== name.toUpperCase()) return name;
  return name
    .split(' ')
    .map(word => (/\d/.test(word) || word.length <= 3 ? word : word[0] + word.slice(1).toLowerCase()))
    .join(' ');
}

export interface RyaMergeResult {
  classes: CatalogClass[];
  added: number;
  updated: number;
  unchanged: number;
  /** RYA ids in the catalogue but not in this list (kept, so club links stay valid). */
  notInList: CatalogClass[];
}

/**
 * Merges an RYA list into the catalogue by RYA Class ID. Existing entries get the
 * RYA name, PN, notes, crew, rig and spinnaker from the list but keep their
 * ScoreSmarter name and aliases. Non-RYA entries are untouched.
 */
export function mergeRyaClassList(existing: readonly CatalogClass[], rows: readonly RyaClassRow[]): RyaMergeResult {
  const byId = new Map(existing.map(c => [c.catalogueId, c] as const));
  const importedIds = new Set(rows.map(r => r.ryaClassId));
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  const merged = new Map(byId);
  for (const row of rows) {
    const current = byId.get(row.ryaClassId);
    const next: CatalogClass = {
      catalogueId: row.ryaClassId,
      name: current?.name ?? cleanRyaClassName(row.name),
      crew: row.crew,
      rig: row.rig,
      spinnaker: row.spinnaker,
      rya: { name: row.name, pn: row.pn, notes: row.notes },
      ...(current?.aliases?.length ? { aliases: current.aliases } : {}),
    };
    if (!current) added++;
    else if (JSON.stringify(stripUndefined(current)) === JSON.stringify(stripUndefined(next))) unchanged++;
    else updated++;
    merged.set(row.ryaClassId, next);
  }

  const notInList = existing.filter(c => c.catalogueId > 0 && !importedIds.has(c.catalogueId));
  return { classes: [...merged.values()], added, updated, unchanged, notInList };
}

function stripUndefined(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
