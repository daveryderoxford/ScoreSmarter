import {
  buildSeriesResultsUrl,
  toIsoString,
} from './published-seasons-catalog-map';

/**
 * Public live race-calendar API (not published results).
 *
 * GET /api/series-calendar?clubId=ibrsc
 * GET /api/series-calendar?clubId=ibrsc&seasonId=2026
 * GET /api/series-calendar?clubId=ibrsc&season=2026
 * GET /api/series-calendar?clubId=ibrsc&includeRaces=true
 * GET /api/series-calendar?clubId=ibrsc&include-races=1
 *
 * `scoringAlgorithm` is `"long"` | `"short"` from the series document field
 * (ISAF long vs short series scoring — not from `primaryScoringConfiguration`).
 *
 * `startDate` / `endDate` come from the series document.
 * Race docs are loaded only when `includeRaces` / `include-races` is true
 * (default false).
 */

export type ScoringAlgorithm = 'long' | 'short';

export interface CalendarRace {
  index: number;
  scheduledStart: string;
  raceOfDay: number;
}

export interface CalendarSeries {
  seriesId: string;
  name: string;
  fleetId: string;
  startDate: string;
  endDate: string;
  scoringAlgorithm: ScoringAlgorithm;
  resultsUrl: string;
  races?: CalendarRace[];
}

export interface CalendarSeason {
  id: string;
  name: string;
  series: CalendarSeries[];
}

export interface SeriesCalendarResponse {
  clubId: string;
  seasons: CalendarSeason[];
}

export interface SeriesCalendarFilterOptions {
  /** When set, keep only this season id. */
  seasonId?: string;
  includeRaces: boolean;
}

/** Extract fleet id from primary scoring configuration (series has no top-level fleetId). */
export function extractFleetId(raw: Record<string, unknown>): string | undefined {
  const primary = raw['primaryScoringConfiguration'];
  if (typeof primary !== 'object' || primary === null) {
    return undefined;
  }
  const fleet = (primary as Record<string, unknown>)['fleet'];
  if (typeof fleet !== 'object' || fleet === null) {
    return undefined;
  }
  const id = (fleet as Record<string, unknown>)['id'];
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * Map series `scoringAlgorithm` (`long` | `short`) for the public calendar.
 * Returns undefined when missing or unrecognized.
 */
export function mapScoringAlgorithm(value: unknown): ScoringAlgorithm | undefined {
  if (value === 'long' || value === 'short') {
    return value;
  }
  return undefined;
}

/**
 * Map a raw Firestore series document into the public calendar shape.
 * Returns null when required fields are missing.
 * Omits `races` unless `includeRaces` is true (empty array when none match).
 */
export function mapCalendarSeries(
  seriesId: string,
  raw: Record<string, unknown>,
  clubId: string,
  options: {includeRaces: boolean; races?: CalendarRace[]},
): CalendarSeries | null {
  if (typeof raw['name'] !== 'string' || raw['name'].length === 0) {
    return null;
  }
  const fleetId = extractFleetId(raw);
  if (!fleetId) {
    return null;
  }
  const startDate = toIsoString(raw['startDate']);
  const endDate = toIsoString(raw['endDate']);
  if (!startDate || !endDate) {
    return null;
  }
  const scoringAlgorithm = mapScoringAlgorithm(raw['scoringAlgorithm']);
  if (!scoringAlgorithm) {
    return null;
  }

  const series: CalendarSeries = {
    seriesId,
    name: raw['name'],
    fleetId,
    startDate,
    endDate,
    scoringAlgorithm,
    resultsUrl: buildSeriesResultsUrl(clubId, seriesId),
  };

  if (options.includeRaces) {
    series.races = options.races ?? [];
  }

  return series;
}

/** Map a raw Firestore race document into the public schedule shape. */
export function mapCalendarRace(
  raw: Record<string, unknown>,
): CalendarRace | null {
  const index = raw['index'];
  const raceOfDay = raw['raceOfDay'];
  if (typeof index !== 'number' || !Number.isFinite(index)) {
    return null;
  }
  if (typeof raceOfDay !== 'number' || !Number.isFinite(raceOfDay)) {
    return null;
  }
  const scheduledStart = toIsoString(raw['scheduledStart']);
  if (!scheduledStart) {
    return null;
  }
  return {index, scheduledStart, raceOfDay};
}

export function compareCalendarRaces(a: CalendarRace, b: CalendarRace): number {
  const byStart = a.scheduledStart.localeCompare(b.scheduledStart);
  if (byStart !== 0) {
    return byStart;
  }
  return a.raceOfDay - b.raceOfDay;
}

export function compareCalendarSeries(a: CalendarSeries, b: CalendarSeries): number {
  const byStart = a.startDate.localeCompare(b.startDate);
  if (byStart !== 0) {
    return byStart;
  }
  return a.name.localeCompare(b.name);
}

export interface RawSeason {
  id: string;
  name: string;
}

export interface RawSeriesDoc {
  id: string;
  data: Record<string, unknown>;
}

export interface RawRaceDoc {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Index non-archived races by series id (sorted by scheduled start, then raceOfDay).
 * Used when `includeRaces` is true so each series can attach its schedule.
 */
export function indexRacesBySeriesId(
  raceDocs: RawRaceDoc[],
): Map<string, CalendarRace[]> {
  const racesBySeriesId = new Map<string, CalendarRace[]>();
  for (const raceDoc of raceDocs) {
    const status = raceDoc.data['status'];
    if (status === 'Archived') {
      continue;
    }
    const seriesId = raceDoc.data['seriesId'];
    if (typeof seriesId !== 'string' || seriesId.length === 0) {
      continue;
    }
    const mapped = mapCalendarRace(raceDoc.data);
    if (!mapped) {
      continue;
    }
    const list = racesBySeriesId.get(seriesId);
    if (list) {
      list.push(mapped);
    } else {
      racesBySeriesId.set(seriesId, [mapped]);
    }
  }
  for (const list of racesBySeriesId.values()) {
    list.sort(compareCalendarRaces);
  }
  return racesBySeriesId;
}

/**
 * Build the public calendar response from club seasons, series docs, and races.
 * Skips archived series and archived races. Series with unknown seasonId are omitted.
 */
export function buildSeriesCalendar(
  clubId: string,
  seasons: RawSeason[],
  seriesDocs: RawSeriesDoc[],
  raceDocs: RawRaceDoc[],
  options: SeriesCalendarFilterOptions,
): SeriesCalendarResponse | {error: 'season_not_found'} {
  let seasonList = seasons;

  if (options.seasonId != null && options.seasonId.length > 0) {
    const match = seasonList.find((s) => s.id === options.seasonId);
    if (!match) {
      return {error: 'season_not_found'};
    }
    seasonList = [match];
  }

  const racesBySeriesId = options.includeRaces
    ? indexRacesBySeriesId(raceDocs)
    : undefined;

  const seriesBySeasonId = new Map<string, CalendarSeries[]>();
  for (const seriesDoc of seriesDocs) {
    if (seriesDoc.data['archived'] === true) {
      continue;
    }
    const seasonId = seriesDoc.data['seasonId'];
    if (typeof seasonId !== 'string' || seasonId.length === 0) {
      continue;
    }
    const mapped = mapCalendarSeries(seriesDoc.id, seriesDoc.data, clubId, {
      includeRaces: options.includeRaces,
      races: racesBySeriesId?.get(seriesDoc.id),
    });
    if (!mapped) {
      continue;
    }
    const list = seriesBySeasonId.get(seasonId);
    if (list) {
      list.push(mapped);
    } else {
      seriesBySeasonId.set(seasonId, [mapped]);
    }
  }

  const resultSeasons: CalendarSeason[] = seasonList.map((season) => {
    const series = [...(seriesBySeasonId.get(season.id) ?? [])].sort(compareCalendarSeries);
    return {
      id: season.id,
      name: season.name,
      series,
    };
  });

  return {clubId, seasons: resultSeasons};
}

/** Map seasons embedded on the club document. */
export function mapClubSeasons(rawSeasons: unknown): RawSeason[] {
  if (!Array.isArray(rawSeasons)) {
    return [];
  }
  const seasons: RawSeason[] = [];
  for (const entry of rawSeasons) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const data = entry as Record<string, unknown>;
    if (typeof data['id'] !== 'string' || data['id'].length === 0) {
      continue;
    }
    const name = typeof data['name'] === 'string' ? data['name'] : data['id'];
    seasons.push({id: data['id'], name});
  }
  return seasons;
}
