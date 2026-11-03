export type DivisionScoreAs = 'none' | 'separateSeries';
export type DivisionDisplayStyle = 'text' | 'marker';

export interface DivisionDisplay {
  style: DivisionDisplayStyle;
  /** Hex colour for marker/chip; used when style is `marker`. */
  markerColor?: string;
}

/** Series-owned division definition (catalog + scoring + display). */
export interface Division {
  id: string;
  name: string;
  scoreAs: DivisionScoreAs;
  display: DivisionDisplay;
}

/** Series-entry division ids (exact). */
export function entryDivisionIds(entry: {
  divisions?: string[] | null;
}): string[] {
  return Array.isArray(entry.divisions) ? [...entry.divisions] : [];
}

export function rowDivisionIds(row: {
  divisions?: string[] | null;
}): string[] {
  return Array.isArray(row.divisions) ? [...row.divisions] : [];
}

export function publishedDivisionDefinitions(doc: {
  divisionDefinitions?: Division[] | null;
}): Division[] {
  return Array.isArray(doc.divisionDefinitions) ? doc.divisionDefinitions : [];
}

export function legendDivisions(definitions: readonly Division[]): Division[] {
  return [...definitions]
    .filter(d => d.display.style === 'marker' && d.name.trim().length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function divisionIdsEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const ax = [...(a ?? [])].sort();
  const bx = [...(b ?? [])].sort();
  if (ax.length !== bx.length) return false;
  return ax.every((id, i) => id === bx[i]);
}

/** Exact id lookup against a division catalog or published snapshot. */
export function divisionById(
  id: string,
  definitions: readonly Division[],
): Division | undefined {
  if (!id) return undefined;
  return definitions.find(d => d.id === id);
}

export function buildDivisionSnapshot(
  referencedIds: Iterable<string>,
  catalog: readonly Division[],
): Division[] {
  const wanted = new Set([...referencedIds].filter(Boolean));
  if (wanted.size === 0) return [];
  return catalog.filter(def => wanted.has(def.id));
}

export function textDivisionNames(
  ids: readonly string[],
  definitions: readonly Division[],
): string[] {
  const names: string[] = [];
  for (const id of ids) {
    const def = divisionById(id, definitions);
    if (def?.display.style === 'text' && def.name.trim()) {
      names.push(def.name.trim());
    }
  }
  return names;
}

export function markerDivisionIds(
  ids: readonly string[],
  definitions: readonly Division[],
): string[] {
  return ids.filter(id => divisionById(id, definitions)?.display.style === 'marker');
}

export function shouldShowDivisionColumn(
  rows: Array<{ divisions?: string[] }>,
  definitions: readonly Division[],
): boolean {
  return rows.some(row => textDivisionNames(rowDivisionIds(row), definitions).length > 0);
}

export function withOptionalDivisionColumn(
  columns: readonly string[],
  rows: Array<{ divisions?: string[] }>,
  definitions: readonly Division[],
): string[] {
  const cols = [...columns];
  if (!shouldShowDivisionColumn(rows, definitions)) {
    return cols.filter(c => c !== 'division');
  }
  if (cols.includes('division')) return cols;
  const nameIdx = cols.indexOf('name');
  if (nameIdx === -1) {
    cols.push('division');
    return cols;
  }
  cols.splice(nameIdx + 1, 0, 'division');
  return cols;
}
