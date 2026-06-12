import { Injectable } from '@angular/core';
import { Boat } from 'app/boats/model/boat';
import { normalizeSailNumber, sailNumbersEqual } from 'app/boats/model/sail-number';
import { BoatClass } from 'app/club-tenant/model/boat-class';
import { Race } from 'app/race-calender/model/race';
import { RESULT_CODES, ResultCode } from 'app/scoring/model/result-code-scoring';
import type { ScannerTimeFormat } from '@shared/scanner-context';
import { normaliseString } from 'app/shared/utils/string-utils';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';
import { ScannedResultRow } from '../model/scan-model';
import { MatchedRowVm, UnmatchedRowVm } from './review-step';

/** Boat-class matching: whitespace/case insensitive, treats Laser as ILCA. */
function normaliseBoatClassForMatch(className: string | undefined | null): string {
  return normaliseString(className).replace(/laser/g, 'ilca');
}

export function boatClassesMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  return normaliseBoatClassForMatch(a) === normaliseBoatClassForMatch(b);
}

/**
 * Pure matching/parsing logic for scanned result rows. Takes its inputs
 * (boats, classes, resolved competitors, race) as arguments so it stays free of
 * store/signal dependencies and is easy to unit test.
 */
@Injectable({ providedIn: 'root' })
export class ScanRowMatchingService {
  private readonly allowedResultCodes = new Set<string>(RESULT_CODES as readonly string[]);

  findBoatMatches(row: ScannedResultRow, boats: Boat[]): Boat[] {
    const boatClass = row.boatClass?.value;
    const sailNumber = normalizeSailNumber(row.sailNumber?.value);
    if (!boatClass?.trim() || !sailNumber) return [];
    const scannedClass = normaliseBoatClassForMatch(boatClass);
    return boats.filter(
      b =>
        normaliseBoatClassForMatch(b.boatClass) === scannedClass &&
        sailNumbersEqual(b.sailNumber, sailNumber),
    );
  }

  buildMatchedRows(
    rows: ScannedResultRow[],
    resolvedById: Map<string, ResolvedRaceCompetitor>,
  ): MatchedRowVm[] {
    return rows
      .filter(row => !!row.matchedCompetitorId)
      .map(row => {
        const competitor = row.matchedCompetitorId ? resolvedById.get(row.matchedCompetitorId) : undefined;
        return { row, helm: competitor?.helm, competitor };
      });
  }

  buildUnmatchedRows(
    rows: ScannedResultRow[],
    ctx: { boats: Boat[]; classes: BoatClass[] },
  ): UnmatchedRowVm[] {
    return rows
      .filter(row => !row.matchedCompetitorId)
      .map(row => {
        const classMatches =
          !row.boatClass?.value?.trim() ||
          ctx.classes.some(c => boatClassesMatch(c.name, row.boatClass?.value));
        const boatMatches = this.findBoatMatches(row, ctx.boats);
        const possibleHelms = Array.from(
          new Set(boatMatches.map(m => m.helm).filter((h): h is string => !!h && h.trim().length > 0)),
        );
        return {
          row,
          matchedBoat: boatMatches.length > 0,
          possibleHelms,
          matchedClass: classMatches,
        };
      });
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
    const status = raw?.trim().toUpperCase();
    if (!status) return 'OK';
    return this.allowedResultCodes.has(status) ? (status as ResultCode) : 'OK';
  }
}
