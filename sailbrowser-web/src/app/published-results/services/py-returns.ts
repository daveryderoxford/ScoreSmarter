import type { BoatClass } from 'app/club-tenant/model/boat-class';
import type { CatalogClass } from 'app/club-tenant/model/catalog-class';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';
import { isFinishedComp } from 'app/scoring/model/result-code-scoring';
import type { ResultCode } from 'app/scoring/model/result-code';
import { toCsv } from 'app/shared/utils/csv';
import { format } from 'date-fns';
import type { PublishedRace, RaceResult } from '../model/published-race';

/** RYA PY Online inclusion criteria for a race. */
export const PY_MIN_FINISHERS = 4;
export const PY_MIN_CLASSES = 2;
export const PY_MIN_DURATION_SECONDS = 20 * 60;

/**
 * PY return: one file per series, as PY Online gives each uploaded file a single event
 * name. Written in the PY Online upload layout by {@link pyReturnToCsv}.
 */
export interface PyReturn {
  series: PySeriesReturn[];
}

export interface PySeriesReturn {
  /** Source series id (secondary scoring and division series are folded into it). */
  seriesId: string;
  /** Event Name to enter on PY Online: season and series name (see {@link pyEventName}). */
  eventName: string;
  races: PyReturnRace[];
}

export interface PyReturnRace {
  raceId: string;
  /** The series race number, so PY Online matches the club's published results. */
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
  /** Races left out of the files: not handicap races, or no finishers in RYA classes. */
  excludedRaces: PyExcludedRace[];
  /** Races in the files that the RYA is likely to exclude under its current criteria. */
  flaggedRaces: PyExcludedRace[];
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
 * `catalogueId`). Races that fail the RYA criteria are still returned (PY Online applies
 * its own rules) but flagged with reasons, and classes without an RYA ID are reported.
 * A race published in several series
 * (secondary scoring, divisions) is returned once. `seasonNameBySeriesId` (keyed by source
 * series id) adds the season to each event name, so series repeated each season differ.
 */
export function buildPyReturn(
  races: readonly PublishedRace[],
  clubClasses: readonly BoatClass[],
  catalogueById: ReadonlyMap<number, CatalogClass>,
  seasonNameBySeriesId: ReadonlyMap<string, string> = new Map(),
): PyReturnBuild {
  const checks = new Map<string, PyClassCheck>();
  const checkFor = (className: string): PyClassCheck => {
    let check = checks.get(className);
    if (!check) {
      const boatClass = findClubClass(className, clubClasses);
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

  const seriesReturns = new Map<string, PySeriesReturn>();
  const excludedRaces: PyExcludedRace[] = [];
  const flaggedRaces: PyExcludedRace[] = [];

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
    if (returnable.length === 0) {
      excludedRaces.push({ raceId: race.id, label, reasons: ['no finishers in RYA classes'] });
      continue;
    }
    if (reasons.length > 0) flaggedRaces.push({ raceId: race.id, label, reasons });

    for (const f of returnable) f.check.entries++;
    const ranks = finisherRanks(finishers.map(f => f.result));
    const seriesId = sourceSeriesId(race.seriesId);
    let seriesReturn = seriesReturns.get(seriesId);
    if (!seriesReturn) {
      seriesReturn = { seriesId, eventName: pyEventName(race.seriesName, seasonNameBySeriesId.get(seriesId)), races: [] };
      seriesReturns.set(seriesId, seriesReturn);
    }
    seriesReturn.races.push({
      raceId: race.id,
      raceNumber: race.index,
      date: format(race.scheduledStart, 'yyyy-MM-dd'),
      startTime: format(race.scheduledStart, 'HH:mm'),
      seriesName: race.seriesName,
      raceIndex: race.index,
      entries: returnable.map(({ result, check }) => ({
        ryaClassId: check.catalogueId!,
        ryaClassName: check.catalogue?.rya?.name ?? result.boatClass,
        className: result.boatClass,
        rank: ranks.get(result) ?? result.rank,
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
  for (const c of classes) {
    if (c.status === 'unlinked') issues.push(`${c.className} is not linked to the class catalogue; its boats are left out.`);
    if (c.status === 'non-rya') issues.push(`${c.className} is not an RYA class; its boats are left out.`);
    if (c.status === 'unknown-class') issues.push(`${c.className} is not one of the club's classes; its boats are left out.`);
  }

  const series = [...seriesReturns.values()].sort((a, b) => a.eventName.localeCompare(b.eventName));
  return {
    ret: { series },
    excludedRaces,
    flaggedRaces,
    classes,
    issues,
  };
}

/** "Series (Season)", e.g. "Summer PM (2025-26)". */
export function pyEventName(seriesName: string, seasonName: string | undefined): string {
  const season = normaliseWhitespace(seasonName);
  return season ? `${seriesName} (${season})` : seriesName;
}

/**
 * The series a published race came from. Secondary scoring (`{id}_{configId}`) and
 * division (`{id}_div_{divisionId}`) published series fold into their source series.
 */
export function sourceSeriesId(publishedSeriesId: string): string {
  const separator = publishedSeriesId.indexOf('_');
  return separator < 0 ? publishedSeriesId : publishedSeriesId.slice(0, separator);
}

/**
 * Club class for a class name stored on a result. Results keep the name the class had
 * when they were published, so a renamed class is found by its id (its original name).
 * Names are compared exactly; they are normalised when saved.
 */
export function findClubClass(className: string, clubClasses: readonly BoatClass[]): BoatClass | undefined {
  return clubClasses.find(c => c.name === className) ?? clubClasses.find(c => c.id === className);
}

/** Sail numbers with letters and digits only. */
export function cleanSailNumber(sailNumber: string): string {
  return String(sailNumber ?? '').replace(/[^A-Za-z0-9]/g, '');
}

/**
 * One race per id; results from several published series are combined by series entry.
 * The primary series copy supplies the series name (secondary copies are "Name - Config").
 */
function mergeRaces(races: readonly PublishedRace[]): PublishedRace[] {
  const isPrimary = (race: PublishedRace) => race.seriesId === sourceSeriesId(race.seriesId);
  const byId = new Map<string, PublishedRace>();
  for (const race of races) {
    const existing = byId.get(race.id);
    if (!existing) {
      byId.set(race.id, { ...race, results: [...race.results] });
      continue;
    }
    const seen = new Set(existing.results.map(r => r.seriesEntryId));
    const results = [...existing.results, ...race.results.filter(r => !seen.has(r.seriesEntryId))];
    const base = isPrimary(race) && !isPrimary(existing) ? race : existing;
    byId.set(race.id, { ...base, results });
  }
  return [...byId.values()].sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());
}

/** Title row and columns of the RYA "PY online" upload spreadsheet. */
export const PY_ONLINE_TITLE = 'Complete race results';
export const PY_ONLINE_COLUMNS = [
  'Class', 'Race Number', 'Race Date', 'Start Name', 'Rank', 'SailNo', 'Helm', 'Crew',
  'pn', 'Laps', 'Elapsed', 'Corrected', 'Persons', 'Rig', 'Spin',
];

/**
 * One series in the PY Online upload layout: title row, header row, one row per finisher.
 * The series name is entered as the Event Name on upload. RYA rules: Race Number and Rank
 * are numbers, Race Date is yyyy-mm-dd, Start Name is mandatory ("-" when there is none),
 * Elapsed and Corrected are whole seconds.
 */
export function pyReturnToCsv(series: PySeriesReturn): string {
  const rows = series.races.flatMap(race =>
    race.entries.map(e => ({
      Class: e.ryaClassName,
      'Race Number': String(race.raceNumber),
      'Race Date': race.date,
      'Start Name': '-',
      Rank: String(e.rank),
      SailNo: e.sailNumber,
      Helm: e.helm,
      Crew: e.crew,
      pn: String(e.handicap),
      Laps: e.laps > 0 ? String(e.laps) : '',
      Elapsed: String(Math.round(e.elapsedSeconds)),
      Corrected: String(Math.round(e.correctedSeconds)),
      Persons: String(e.persons),
      Rig: e.rig,
      Spin: e.spinnaker,
    })),
  );
  return `${PY_ONLINE_TITLE}\n${toCsv(PY_ONLINE_COLUMNS, rows)}`;
}

/** File name for a series' return, e.g. "Winter Sunday afternoon B2B Handicap 2026 - PY return.csv". */
export function pyReturnFilename(series: PySeriesReturn): string {
  const safe = normaliseWhitespace(series.eventName.replace(/[\\/:*?"<>|]+/g, '-')) || 'series';
  return `${safe} - PY return.csv`;
}

/** Published rank, or position by corrected time for an unranked finisher (Rank must be a number). */
function finisherRanks(finishers: readonly RaceResult[]): Map<RaceResult, number> {
  const byCorrected = [...finishers].sort((a, b) => a.correctedTime - b.correctedTime);
  return new Map(byCorrected.map((r, i) => [r, r.rank > 0 ? r.rank : i + 1] as const));
}
