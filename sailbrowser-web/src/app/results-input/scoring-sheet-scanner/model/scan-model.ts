import type { FormControl } from '@angular/forms';
import type {
  ScannerContext as SharedScannerContext,
  ScannerTimeFormat,
  ScanStrategy,
} from '@shared/scanner-context';
import type { ScanExecutionMetrics as SharedScanExecutionMetrics } from '@shared/scan-metrics';
import { resolveClassAlias } from './class-aliases';

export type ScanExecutionMetrics = SharedScanExecutionMetrics;

export interface ScannedValue<T> {
  value: T;
  confidence: 'HIGH' | 'MANUAL_CHECK' | 'FAILED' | 'AMBIGUOUS';
  alternatives?: T[];
}

export interface ScanEntryDetails {
  id: string;
  class: string;
  sailNumber: string;
  name?: string;
  helm?: string;
}

export interface ScannedResultRow {
  rowIndex: number;
  boatClass?: ScannedValue<string>;
  sailNumber?: ScannedValue<string>;
  competitorName?: ScannedValue<string>;
  time?: ScannedValue<string>;
  laps?: ScannedValue<number>;
  /** Level-rating: assigned race for this sheet row. */
  raceId?: string;
  /**
   * Level-rating: post-arrow-swap order index. Present only when a linked-arrow
   * swap applies to this row (the swap marker). Ranking uses this when set.
   */
  swappedRowIndex?: number;
  /** Level-rating: finish / in-class position assigned in code after the scan. */
  position?: ScannedValue<number>;
  status?: string;
  overallRowConfidence: string;
  matchedCompetitorId?: string;
  accepted?: boolean;
}

export interface ScanResponse {
  scannedResults: ScannedResultRow[];
  pageNotes?: string;
  unreadableRowsCount: number;
  metrics?: ScanExecutionMetrics;
}

export type ScannerContext = SharedScannerContext;

export interface ScanRunRequest {
  raceId: string;
  clubId: string;
  scannerContext: ScannerContext;
  imageBase64?: string | null;
  imageMimeType?: string | null;
  /** Sheet already stored for this race at the canonical server path — skip upload before parse. */
  useStoredRaceSheet?: boolean;
}

export interface ScanRunState {
  status: 'running' | 'success' | 'error';
  stageMessage?: string;
  result?: ScanResponse;
  metrics?: ScanExecutionMetrics;
  error?: string;
}

/**
 * Maps boatClass sheet aliases (e.g. Radial) to canonical club names (ILCA 6)
 * and keeps the original text in alternatives when remapped.
 */
export function applyClassAliasesToRow(row: ScannedResultRow): ScannedResultRow {
  const field = row.boatClass;
  if (!field?.value?.trim()) return row;

  const original = field.value.trim();
  const resolved = resolveClassAlias(original);
  if (resolved === original) {
    // Still resolve any alternate strings that are aliases.
    const alts = (field.alternatives ?? [])
      .map(a => resolveClassAlias(a))
      .filter((a, i, arr) => !!a && a !== resolved && arr.indexOf(a) === i);
    if (alts.length === (field.alternatives?.length ?? 0) &&
      alts.every((a, i) => a === field.alternatives![i])) {
      return row;
    }
    return { ...row, boatClass: { ...field, alternatives: alts } };
  }

  const seen = new Set([resolved.toLowerCase().replace(/\s+/g, ''), original.toLowerCase().replace(/\s+/g, '')]);
  const nextAlts: string[] = [original];
  for (const alt of field.alternatives ?? []) {
    const trimmed = alt.trim();
    if (!trimmed) continue;
    const altResolved = resolveClassAlias(trimmed);
    const display = trimmed !== altResolved && altResolved === resolved ? trimmed : altResolved;
    const key = display.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    nextAlts.push(display);
  }

  return {
    ...row,
    boatClass: { ...field, value: resolved, alternatives: nextAlts },
  };
}

const NON_FINISHER_STATUSES = new Set([
  'DNC',
  'DNS',
  'DNF',
  'RET',
  'OCS',
  'BFD',
  'UFD',
  'DSQ',
  'DNE',
  'NSC',
  'NOT FINISHED',
  'OOD',
  'DGM',
  'STRUCK_THROUGH',
]);

function isLevelRatingFinisher(status: string | undefined): boolean {
  const code = (status ?? 'OK').trim().toUpperCase();
  if (!code || code === 'OK') return true;
  return !NON_FINISHER_STATUSES.has(code);
}

function effectiveOrderIndex(row: ScannedResultRow): number {
  return row.swappedRowIndex ?? row.rowIndex;
}

/**
 * Assigns finish places within each raceId from sheet order after arrow swaps.
 * Non-finishers are skipped and do not consume a place number.
 */
export function assignLevelRatingPositions(rows: ScannedResultRow[]): ScannedResultRow[] {
  if (!rows.some(row => !!row.raceId)) return rows;

  const next = rows.map(row => ({ ...row }));
  const finishersByRace = new Map<string, ScannedResultRow[]>();

  for (const row of next) {
    if (!row.raceId || !isLevelRatingFinisher(row.status)) continue;
    const group = finishersByRace.get(row.raceId);
    if (group) group.push(row);
    else finishersByRace.set(row.raceId, [row]);
  }

  for (const group of finishersByRace.values()) {
    group.sort((a, b) => effectiveOrderIndex(a) - effectiveOrderIndex(b));
    group.forEach((row, i) => {
      row.position = { value: i + 1, confidence: 'HIGH' };
    });
  }

  return next;
}

/**
 * Applies the auto-accept rules shared by the live scan run and the stored-scan
 * read. Handicap: overall + sail + time HIGH. Level-rating: overall + sail HIGH
 * with a raceId (position is assigned in code). Pure; safe to reuse across services.
 */
export function applyAutoAccept(response: ScanResponse): ScanResponse {
  const { metrics, ...scanPayload } = response;
  const withAliases = scanPayload.scannedResults.map(applyClassAliasesToRow);
  const scannedResults = assignLevelRatingPositions(withAliases).map(row => {
    const isLevelRating = !!row.raceId;
    const resultFieldOk = isLevelRating
      ? true
      : row.time?.confidence === 'HIGH';
    return {
      ...row,
      accepted: row.overallRowConfidence === 'HIGH' &&
        row.sailNumber?.confidence === 'HIGH' &&
        resultFieldOk,
    };
  });
  return { ...scanPayload, scannedResults, ...(metrics ? { metrics } : {}) };
}

/** Typed reactive form for the scanner-context setup step (Area 3: run scan). */
export interface ScannerContextForm {
  listOrder: FormControl<string>;
  timeFormat: FormControl<ScannerTimeFormat>;
  defaultLaps: FormControl<number>;
  scanStrategy: FormControl<ScanStrategy>;
  specialInstructions: FormControl<string>;
  debug: FormControl<boolean>;
}
