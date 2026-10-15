import { Injectable } from '@angular/core';
import { Race } from 'app/race-calender/model/race';
import { RESULT_CODES, ResultCode } from 'app/scoring/model/result-code-scoring';
import type { ScannerTimeFormat } from '@shared/scanner-context';
import { normaliseString } from 'app/shared/utils/string-utils';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';
import { resolveClassAlias } from '../model/class-aliases';
import { ScannedResultRow } from '../model/scan-model';
import type { HelmOption, ScanGridRowVm } from './review-step';
import {
  sameStagedIdentity,
  type HelmCandidate,
  type ScanRowIdentityPlan,
  type UnmatchedReason,
} from './scan-row-provision';

/** True when class names match after normalisation and class-alias resolution. */
export function boatClassesMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  return normaliseString(resolveClassAlias(a)) === normaliseString(resolveClassAlias(b));
}

/**
 * Pure view-model and parsing logic for scanned result rows. Takes its inputs
 * as arguments so it stays free of store/signal dependencies and is easy to unit test.
 */
@Injectable()
export class ScanRowMatchingService {
  private readonly allowedResultCodes = new Set<string>(RESULT_CODES as readonly string[]);

  /** One view model per scanned row, in sheet order. `rows` already carry automatic matches. */
  buildGridRows(rows: readonly ScannedResultRow[], ctx: GridRowContext): ScanGridRowVm[] {
    return [...rows]
      .sort((a, b) => a.rowIndex - b.rowIndex)
      .map(row => buildGridRow(row, ctx));
  }

  parseScannedTime(
    timeStr: string,
    race: Race,
    opts: { timeFormat: ScannerTimeFormat; defaultHour: number },
  ): Date | null {
    if (!timeStr || !race) return null;
    const normalized = timeStr
      .trim()
      .replace(/[^\d]/g, ':')
      .replace(/:+/g, ':')
      .replace(/^:|:$/g, '');
    const parts = normalized
      .split(':')
      .map(p => parseInt(p, 10))
      .filter(p => Number.isFinite(p));
    if (parts.length < 2 || parts.length > 3) return null;
    const date = new Date(race.scheduledStart);
    if (parts.length === 3) date.setHours(parts[0], parts[1], parts[2], 0);
    else if (parts.length === 2 && opts.timeFormat === 'clock_hms') date.setHours(opts.defaultHour ?? 14, parts[0], parts[1], 0);
    else if (parts.length === 2) date.setHours(0, parts[0], parts[1], 0);
    else return null;
    return date;
  }

  normalizeResultCode(raw?: string): ResultCode {
    const status = raw?.trim().toUpperCase().replace(/_/g, ' ');
    if (!status) return 'OK';
    return this.allowedResultCodes.has(status) ? (status as ResultCode) : 'OK';
  }
}

/** Why an accepted row cannot be saved as it stands. */
export interface RowConflict {
  reason: string;
  /** The staged entry clashes with an existing race entry that can be replaced. */
  canReplaceExisting: boolean;
}

export interface GridRowContext {
  plans: ReadonlyMap<number, ScanRowIdentityPlan>;
  conflicts: ReadonlyMap<number, RowConflict>;
  resolvedById: ReadonlyMap<string, ResolvedRaceCompetitor>;
  nearMissRows: ReadonlySet<number>;
}

const UNMATCHED_PROBLEMS: Record<UnmatchedReason, NonNullable<ScanGridRowVm['problem']>> = {
  'unreadable-class': { field: 'boatClass', message: 'Class unreadable' },
  'unreadable-sail': { field: 'sailNumber', message: 'Sail number unreadable' },
  'unknown-class': { field: 'boatClass', message: 'Class not found in the club classes' },
  'not-found': { field: 'sailNumber', message: 'No entry or boat found with this sail number' },
};

function buildGridRow(row: ScannedResultRow, ctx: GridRowContext): ScanGridRowVm {
  const plan = ctx.plans.get(row.rowIndex) ?? { kind: 'skip' };
  const conflict = ctx.conflicts.get(row.rowIndex);
  const base = {
    row,
    lowConfidence: !row.accepted && row.overallRowConfidence !== 'HIGH',
    nearMissSail: ctx.nearMissRows.has(row.rowIndex),
    canReplaceExisting: !!conflict?.canReplaceExisting,
  };

  if (row.matchedCompetitorId) {
    const competitor = ctx.resolvedById.get(row.matchedCompetitorId);
    return {
      ...base,
      status: conflict ? 'conflict' : 'matched',
      reason: conflict?.reason,
      competitor,
      identity: competitor,
      helmOptions: [],
      canAccept: true,
    };
  }

  const candidates = plan.kind === 'sign-on' || plan.kind === 'choose-helm' ? plan.candidates : [];

  if (row.pendingEntry) {
    const { helm, boatClass, sailNumber } = row.pendingEntry;
    const candidate = candidates.find(c => sameStagedIdentity(c.entry, row.pendingEntry!));
    const onlyCandidateChosen = candidates.length === 1 && !!candidate;
    return {
      ...base,
      status: conflict ? 'conflict' : 'new-entry',
      reason: conflict?.reason,
      identity: { helm, boatClass, sailNumber },
      pendingSource: candidate?.source ?? 'new',
      helmOptions: candidates.length > 0 && !onlyCandidateChosen
        ? helmOptions(candidates, candidate ? undefined : helm)
        : [],
      selectedHelm: candidate ? `candidate:${candidate.helm}` : `new:${helm}`,
      canAccept: true,
    };
  }

  if (plan.kind === 'choose-helm') {
    return {
      ...base,
      status: 'choose-helm',
      reason: plan.helmDiffers
        ? `Scanned helm "${plan.scannedHelm}" is not entered for this boat`
        : 'Several helms sail this boat',
      helmOptions: helmOptions(plan.candidates, plan.scannedHelm),
      canAccept: false,
    };
  }

  const problem = plan.kind === 'unmatched' ? UNMATCHED_PROBLEMS[plan.reason] : undefined;
  return {
    ...base,
    status: 'no-match',
    reason: problem?.message ?? 'Race not found',
    problem,
    helmOptions: [],
    canAccept: false,
  };
}

function helmOptions(candidates: readonly HelmCandidate[], newHelm?: string): HelmOption[] {
  const options: HelmOption[] = candidates.map(c => ({ value: `candidate:${c.helm}`, label: c.helm }));
  if (newHelm?.trim()) options.push({ value: `new:${newHelm}`, label: `New helm: ${newHelm}` });
  options.push({ value: 'edit', label: 'New helm...' });
  return options;
}
