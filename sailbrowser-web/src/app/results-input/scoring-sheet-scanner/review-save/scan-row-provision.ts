import { Boat } from 'app/boats/model/boat';
import { findHelmNameMatch, helmNamesEqual } from 'app/boats/model/helm-name';
import { normalizeSailNumber, sailNumbersEqual } from 'app/boats/model/sail-number';
import { SeriesEntry } from 'app/results-input/model/series-entry';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';
import { PendingScanEntry, ScannedResultRow } from '../model/scan-model';
import { boatClassesMatch } from './scan-row-matching.service';

export interface ScanRowRaceRef {
  id: string;
  seriesId: string;
}

export interface ScanRowIdentitySources {
  race: ScanRowRaceRef | null;
  competitors: readonly ResolvedRaceCompetitor[];
  seriesEntries: readonly SeriesEntry[];
  boats: readonly Boat[];
  /** Club class names, used to explain why a row has no match. */
  classes: readonly string[];
}

/** A helm the row could be entered as, with the details its entry would be created from. */
export interface HelmCandidate {
  helm: string;
  entry: PendingScanEntry;
  source: 'series-entry' | 'boat';
}

export type UnmatchedReason = 'unreadable-class' | 'unreadable-sail' | 'unknown-class' | 'not-found';

export type ScanRowIdentityPlan =
  | { kind: 'link'; competitorId: string }
  | { kind: 'sign-on'; candidate: HelmCandidate; candidates: HelmCandidate[] }
  | { kind: 'choose-helm'; candidates: HelmCandidate[]; scannedHelm?: string; helmDiffers: boolean }
  | { kind: 'unmatched'; reason: UnmatchedReason }
  | { kind: 'skip' };

/**
 * Decide how a scanned row becomes a race competitor, from its scanned values only.
 * Class and sail number identify the boat; the scanned helm name only chooses between
 * several helms who sail it. An existing race entry wins. Otherwise the unique helms
 * from the series entries and the boat register are candidates.
 */
export function classifyScanRow(
  row: ScannedResultRow,
  sources: ScanRowIdentitySources,
): ScanRowIdentityPlan {
  const race = sources.race;
  if (!race) return { kind: 'skip' };
  const unreadable = unreadableIdentity(row);
  if (unreadable) return { kind: 'unmatched', reason: unreadable };

  const boatClass = row.boatClass?.value ?? '';
  const sailNumber = normalizeSailNumber(row.sailNumber?.value);

  const racing = sources.competitors.find(c =>
    c.raceId === race.id &&
    boatClassesMatch(c.boatClass, boatClass) &&
    sailNumbersEqual(c.sailNumber, sailNumber),
  );
  if (racing) return { kind: 'link', competitorId: racing.id };

  const candidates = helmCandidates(boatClass, sailNumber, race.seriesId, sources);
  if (candidates.length === 0) {
    const knownClass = sources.classes.some(c => boatClassesMatch(c, boatClass));
    return { kind: 'unmatched', reason: knownClass ? 'not-found' : 'unknown-class' };
  }

  if (candidates.length === 1) return { kind: 'sign-on', candidate: candidates[0]!, candidates };

  const scannedHelm = readableScannedHelm(row);
  const match = findHelmNameMatch(scannedHelm, candidates, c => c.helm);
  return match
    ? { kind: 'sign-on', candidate: match, candidates }
    : { kind: 'choose-helm', candidates, scannedHelm, helmDiffers: !!scannedHelm };
}

/**
 * Unique helms for a class and sail number, from the series' entries and the boat register.
 * A series entry wins over a boat with the same helm because it carries divisions.
 */
export function helmCandidates(
  boatClass: string,
  sailNumber: string,
  seriesId: string,
  sources: Pick<ScanRowIdentitySources, 'seriesEntries' | 'boats'>,
): HelmCandidate[] {
  const candidates: HelmCandidate[] = [];
  const add = (candidate: HelmCandidate) => {
    if (!candidate.helm.trim()) return;
    if (candidates.some(c => helmNamesEqual(c.helm, candidate.helm))) return;
    candidates.push(candidate);
  };
  for (const e of sources.seriesEntries) {
    if (e.seriesId !== seriesId) continue;
    if (!boatClassesMatch(e.boatClass, boatClass) || !sailNumbersEqual(e.sailNumber, sailNumber)) continue;
    add({ helm: e.helm, entry: entryDetailsFromSeriesEntry(e), source: 'series-entry' });
  }
  for (const b of sources.boats) {
    if (!boatClassesMatch(b.boatClass, boatClass) || !sailNumbersEqual(b.sailNumber, sailNumber)) continue;
    add({ helm: b.helm, entry: entryDetailsFromBoat(b), source: 'boat' });
  }
  return candidates;
}

/** True when the user has linked the row or chosen its entry; automatic matching leaves it alone. */
export function hasExplicitChoice(row: ScannedResultRow): boolean {
  return !!row.matchedCompetitorId || !!row.pendingEntry;
}

/** Applies a unique match to a row the user has not resolved. Acceptance is left as scanned. */
export function applyAutomaticMatch(row: ScannedResultRow, plan: ScanRowIdentityPlan): ScannedResultRow {
  if (hasExplicitChoice(row)) return row;
  if (plan.kind === 'link') return { ...row, matchedCompetitorId: plan.competitorId };
  if (plan.kind === 'sign-on') return { ...row, pendingEntry: plan.candidate.entry };
  return row;
}

/** Same boat and helm, so the two entries would create the same race competitor. */
export function sameStagedIdentity(a: PendingScanEntry, b: PendingScanEntry): boolean {
  return boatClassesMatch(a.boatClass, b.boatClass) &&
    sailNumbersEqual(a.sailNumber, b.sailNumber) &&
    helmNamesEqual(a.helm, b.helm);
}

export function entryDetailsFromSeriesEntry(entry: SeriesEntry): PendingScanEntry {
  return {
    helm: entry.helm,
    crew: entry.crew,
    club: entry.club,
    boatName: entry.boatName,
    boatClass: entry.boatClass,
    sailNumber: entry.sailNumber,
    handicaps: entry.handicaps,
    personalHandicapBand: entry.personalHandicapBand,
    divisions: entry.divisions,
  };
}

export function entryDetailsFromBoat(boat: Boat): PendingScanEntry {
  return {
    helm: boat.helm,
    crew: boat.crew,
    boatName: boat.name,
    boatClass: boat.boatClass,
    sailNumber: boat.sailNumber,
    handicaps: boat.handicaps,
    personalHandicapBand: boat.personalHandicapBand,
  };
}

function readableScannedHelm(row: ScannedResultRow): string | undefined {
  const field = row.competitorName;
  if (!field || field.confidence === 'FAILED') return undefined;
  return field.value?.trim() || undefined;
}

function unreadableIdentity(row: ScannedResultRow): UnmatchedReason | undefined {
  const blocked = new Set(['FAILED', 'AMBIGUOUS']);
  if (!row.boatClass?.value?.trim() || blocked.has(row.boatClass.confidence)) return 'unreadable-class';
  if (!normalizeSailNumber(row.sailNumber?.value) || blocked.has(row.sailNumber?.confidence ?? '')) {
    return 'unreadable-sail';
  }
  return undefined;
}
