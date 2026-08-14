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
  /** Level-rating: finish / in-class position from the sheet. */
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

/**
 * Applies the auto-accept rules shared by the live scan run and the stored-scan
 * read. Handicap: overall + sail + time HIGH. Level-rating: overall + sail +
 * position HIGH (when position is present). Pure; safe to reuse across services.
 */
export function applyAutoAccept(response: ScanResponse): ScanResponse {
  const { metrics, ...scanPayload } = response;
  const scannedResults = scanPayload.scannedResults.map(row => {
    const withAliases = applyClassAliasesToRow(row);
    const isLevelRating = withAliases.position != null || !!withAliases.raceId;
    const resultFieldOk = isLevelRating
      ? withAliases.position?.confidence === 'HIGH'
      : withAliases.time?.confidence === 'HIGH';
    return {
      ...withAliases,
      accepted: withAliases.overallRowConfidence === 'HIGH' &&
        withAliases.sailNumber?.confidence === 'HIGH' &&
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
