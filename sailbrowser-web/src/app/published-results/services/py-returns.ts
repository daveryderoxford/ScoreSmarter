import type { BoatClass } from 'app/club-tenant/model/boat-class';
import type { CatalogClass } from 'app/club-tenant/model/catalog-class';
import { isFinishedComp } from 'app/scoring/model/result-code-scoring';
import type { ResultCode } from 'app/scoring/model/result-code';
import { toCsv } from 'app/shared/utils/csv';
import { format } from 'date-fns';
import type { PublishedRace, RaceResult } from '../model/published-race';

/** RYA PY Online inclusion criteria for a race. */
export const PY_MIN_FINISHERS = 4;
export const PY_MIN_CLASSES = 2;
export const PY_MIN_DURATION_SECONDS = 20 * 60;

/** PY return, written in the PY Online upload layout by {@link pyReturnToCsv}. */
export interface PyReturn {
  affiliationId: string;
  races: PyReturnRace[];
}

export interface PyReturnRace {
  raceId: string;
  /** Unique within the return (series race numbers clash across series on a day). */
  raceNumber: number;
  /** yyyy-mm-dd */
  date: string;
  /** HH:mm */
  startTime: string;
  seriesName: string;
  raceIndex: number;
  entries: PyReturnEntry[];
}

export interface PyReturnEntry {
  ryaClassId: number;
  /** RYA class name from the class configuration list (how PY Online identifies the class). */
  ryaClassName: string;
  /** The club's own class name. */
  className: string;
  rank: number;
  /** Letters and digits only (the RYA rejects symbols such as `/`). */
  sailNumber: string;
  helm: string;
  crew: string;
  elapsedSeconds: number;
  correctedSeconds: number;
  laps: number;
  handicap: number;
  persons: number;
  rig: string;
  spinnaker: string;
  resultCode: ResultCode;
}

export type PyClassStatus = 'rya' | 'non-rya' | 'unlinked' | 'unknown-class';

/** One club class seen in the selected races, for checking links before export. */
export interface PyClassCheck {
  className: string;
  status: PyClassStatus;
  catalogueId?: number;
  catalogue?: CatalogClass;
  /** Finishers of this class in eligible races. */
  entries: number;
}

export interface PyExcludedRace {
  raceId: string;
  label: string;
  reasons: string[];
}

export interface PyReturnBuild {
  ret: PyReturn;
  excludedRaces: PyExcludedRace[];
  classes: PyClassCheck[];
  issues: string[];
}

interface ResolvedEntry {
  result: RaceResult;
  check: PyClassCheck;
}

/**
 * Builds a PY return from published races. Only handicap races are used; finishers
 * with an elapsed time are returned under their club class's RYA Class ID (a positive
 * `catalogueId`). Races that fail the RYA criteria are excluded with reasons, and
 * classes without an RYA ID are reported. A race published in several series
 * (secondary scoring, divisions) is returned once.
 */
export function buildPyReturn(
  races: readonly PublishedRace[],
  clubClasses: readonly BoatClass[],
  catalogueById: ReadonlyMap<number, CatalogClass>,
  affiliationId: string | undefined,
): PyReturnBuild {
  const classByName = new Map(clubClasses.map(c => [c.name, c] as const));
  const checks = new Map<string, PyClassCheck>();
  const checkFor = (className: string): PyClassCheck => {
    let check = checks.get(className);
    if (!check) {
      const boatClass = classByName.get(className);
      const catalogueId = boatClass?.catalogueId;
      const status: PyClassStatus = !boatClass
        ? 'unknown-class'
        : catalogueId === undefined
          ? 'unlinked'
          : catalogueId > 0 ? 'rya' : 'non-rya';
      check = {
        className,
        status,
        ...(catalogueId !== undefined ? { catalogueId } : {}),
        ...(catalogueId !== undefined && catalogueById.has(catalogueId) ? { catalogue: catalogueById.get(catalogueId) } : {}),
        entries: 0,
      };
      checks.set(className, check);
    }
    return check;
  };

  const included: PyReturnRace[] = [];
  const excludedRaces: PyExcludedRace[] = [];

  for (const race of mergeRaces(races)) {
    const label = `${race.seriesName} race ${race.index} (${format(race.scheduledStart, 'd MMM yyyy')})`;
    if (race.type !== 'Handicap') {
      excludedRaces.push({ raceId: race.id, label, reasons: [`${race.type} race (handicap races only)`] });
      continue;
    }

    const finishers: ResolvedEntry[] = race.results
      .filter(r => isFinishedComp(r.resultCode) && r.elapsedTime > 0)
      .map(result => ({ result, check: checkFor(result.boatClass) }));
    const returnable = finishers.filter(f => f.check.status === 'rya');

    const reasons: string[] = [];
    if (finishers.length < PY_MIN_FINISHERS) {
      reasons.push(`${finishers.length} finishers (needs at least ${PY_MIN_FINISHERS})`);
    }
    const classCount = new Set(returnable.map(f => f.check.catalogueId)).size;
    if (classCount < PY_MIN_CLASSES) {
      reasons.push(`${classCount} RYA class${classCount === 1 ? '' : 'es'} (needs at least ${PY_MIN_CLASSES})`);
    }
    const shortest = Math.min(...finishers.map(f => f.result.elapsedTime));
    if (finishers.length > 0 && shortest < PY_MIN_DURATION_SECONDS) {
      reasons.push(`first finisher in ${Math.round(shortest / 60)} min (needs at least 20)`);
    }
    if (reasons.length > 0) {
      excludedRaces.push({ raceId: race.id, label, reasons });
      continue;
    }

    for (const f of returnable) f.check.entries++;
    included.push({
      raceId: race.id,
      raceNumber: included.length + 1,
      date: format(race.scheduledStart, 'yyyy-MM-dd'),
      startTime: format(race.scheduledStart, 'HH:mm'),
      seriesName: race.seriesName,
      raceIndex: race.index,
      entries: returnable.map(({ result, check }) => ({
        ryaClassId: check.catalogueId!,
        ryaClassName: check.catalogue?.rya?.name ?? result.boatClass,
        className: result.boatClass,
        rank: result.rank,
        sailNumber: cleanSailNumber(result.sailNumber),
        helm: result.helm,
        crew: result.crew ?? '',
        elapsedSeconds: result.elapsedTime,
        correctedSeconds: result.correctedTime,
        laps: result.laps,
        handicap: result.handicap,
        persons: check.catalogue?.crew ?? 1,
        rig: check.catalogue?.rig ?? '',
        spinnaker: check.catalogue?.spinnaker ?? '',
        resultCode: result.resultCode,
      })),
    });
  }

  const classes = [...checks.values()].sort((a, b) => a.className.localeCompare(b.className));
  const issues: string[] = [];
  if (!affiliationId?.trim()) issues.push('No RYA affiliation ID: set it in Club settings.');
  for (const c of classes) {
    if (c.status === 'unlinked') issues.push(`${c.className} is not linked to the class catalogue; its boats are left out.`);
    if (c.status === 'non-rya') issues.push(`${c.className} is not an RYA class; its boats are left out.`);
    if (c.status === 'unknown-class') issues.push(`${c.className} is not one of the club's classes; its boats are left out.`);
  }

  return {
    ret: { affiliationId: affiliationId?.trim() ?? '', races: included },
    excludedRaces,
    classes,
    issues,
  };
}

/** Sail numbers with letters and digits only. */
export function cleanSailNumber(sailNumber: string): string {
  return String(sailNumber ?? '').replace(/[^A-Za-z0-9]/g, '');
}

/** One race per id; results from several published series are combined by series entry. */
function mergeRaces(races: readonly PublishedRace[]): PublishedRace[] {
  const byId = new Map<string, PublishedRace>();
  for (const race of races) {
    const existing = byId.get(race.id);
    if (!existing) {
      byId.set(race.id, { ...race, results: [...race.results] });
      continue;
    }
    const seen = new Set(existing.results.map(r => r.seriesEntryId));
    existing.results.push(...race.results.filter(r => !seen.has(r.seriesEntryId)));
  }
  return [...byId.values()].sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());
}

/** Title row and columns of the RYA "PY online" upload spreadsheet. */
export const PY_ONLINE_TITLE = 'Complete race results';
export const PY_ONLINE_COLUMNS = [
  'Class', 'Race Number', 'Race Date', 'Start Name', 'Rank', 'SailNo', 'Helm', 'Crew',
  'pn', 'Laps', 'Elapsed', 'Corrected', 'Persons', 'Rig', 'Spin',
];

/** Duration as h:mm:ss (hours not zero-padded), the format Sailwave sends to the RYA. */
export function formatPyDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s)}`;
}

/** The return in the PY Online upload layout: title row, header row, one row per finisher. */
export function pyReturnToCsv(ret: PyReturn): string {
  const rows = ret.races.flatMap(race =>
    race.entries.map(e => ({
      Class: e.ryaClassName,
      'Race Number': String(race.raceNumber),
      'Race Date': race.date,
      'Start Name': race.seriesName,
      Rank: e.rank > 0 ? String(e.rank) : '',
      SailNo: e.sailNumber,
      Helm: e.helm,
      Crew: e.crew,
      pn: String(e.handicap),
      Laps: e.laps > 0 ? String(e.laps) : '',
      Elapsed: formatPyDuration(e.elapsedSeconds),
      Corrected: formatPyDuration(e.correctedSeconds),
      Persons: String(e.persons),
      Rig: e.rig,
      Spin: e.spinnaker,
    })),
  );
  return `${PY_ONLINE_TITLE}\n${toCsv(PY_ONLINE_COLUMNS, rows)}`;
}
