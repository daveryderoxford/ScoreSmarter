/** Must stay in sync with sailbrowser-web published results viewer routes. */
export const RESULTS_VIEWER_HOST_SUFFIX = '.ro.scoresmarter.app';

export interface CatalogSeries {
  id: string;
  /** Present only when this entry is a secondary series (differs from id). */
  baseSeriesId?: string;
  name: string;
  fleetId: string;
  startDate: string;
  endDate: string;
  raceCount: number;
  lastPublishedRaceStart?: string;
  resultsUrl: string;
}

export interface CatalogSeason {
  id: string;
  name: string;
  series: CatalogSeries[];
}

export interface CatalogResponse {
  clubId: string;
  seasons: CatalogSeason[];
}

export interface CatalogFilterOptions {
  includeSecondarySeries: boolean;
  /** When set, keep only this season id. */
  seasonId?: string;
}

export function isValidClubId(clubId: unknown): clubId is string {
  return (
    typeof clubId === 'string' &&
    clubId.trim().length > 0 &&
    clubId.trim().length <= 64 &&
    /^[a-zA-Z0-9_-]+$/.test(clubId.trim())
  );
}

/**
 * Parse a query-string boolean: `true` / `1` / `yes` (case-insensitive) → true;
 * anything else or absent → false.
 */
export function parseBooleanQuery(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

/** Canonical deep link to a published series results page. */
export function buildSeriesResultsUrl(clubId: string, seriesId: string): string {
  return `https://${clubId}${RESULTS_VIEWER_HOST_SUFFIX}/results/viewer/${encodeURIComponent(seriesId)}`;
}

/** Convert Firestore Timestamp, Date, or ISO-ish value to an ISO string. */
export function toIsoString(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (
    typeof value === 'object' &&
    typeof (value as {toDate?: unknown}).toDate === 'function'
  ) {
    const date = (value as {toDate: () => Date}).toDate();
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

/**
 * Map a raw Firestore series entry into the public catalog shape.
 * Returns null when required fields are missing.
 * `baseSeriesId` is only emitted when present and different from `id`.
 */
export function mapSeriesInfo(
  raw: Record<string, unknown>,
  clubId: string,
): CatalogSeries | null {
  if (typeof raw['id'] !== 'string' || raw['id'].length === 0) {
    return null;
  }
  if (typeof raw['name'] !== 'string') {
    return null;
  }
  if (typeof raw['fleetId'] !== 'string') {
    return null;
  }
  const startDate = toIsoString(raw['startDate']);
  const endDate = toIsoString(raw['endDate']);
  if (!startDate || !endDate) {
    return null;
  }

  const raceCount =
    typeof raw['raceCount'] === 'number' && Number.isFinite(raw['raceCount'])
      ? raw['raceCount']
      : 0;

  const series: CatalogSeries = {
    id: raw['id'],
    name: raw['name'],
    fleetId: raw['fleetId'],
    startDate,
    endDate,
    raceCount,
    resultsUrl: buildSeriesResultsUrl(clubId, raw['id']),
  };

  const baseSeriesId = raw['baseSeriesId'];
  if (
    typeof baseSeriesId === 'string' &&
    baseSeriesId.length > 0 &&
    baseSeriesId !== raw['id']
  ) {
    series.baseSeriesId = baseSeriesId;
  }
  const lastPublished = toIsoString(raw['lastPublishedRaceStart']);
  if (lastPublished) {
    series.lastPublishedRaceStart = lastPublished;
  }

  return series;
}

/** Map a published_seasons document (plus id) into the public catalog shape. */
export function mapPublishedSeason(
  id: string,
  data: Record<string, unknown>,
  clubId: string,
): CatalogSeason {
  const name = typeof data['name'] === 'string' ? data['name'] : id;
  const rawSeries = Array.isArray(data['series']) ? data['series'] : [];
  const series: CatalogSeries[] = [];
  for (const entry of rawSeries) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const mapped = mapSeriesInfo(entry as Record<string, unknown>, clubId);
    if (mapped) {
      series.push(mapped);
    }
  }
  return {id, name, series};
}

/**
 * Primary series: no `baseSeriesId` in the catalog shape (missing, or equal to id and omitted).
 * Secondary series: `baseSeriesId` present and different from `id`.
 */
export function isPrimaryCatalogSeries(series: CatalogSeries): boolean {
  return series.baseSeriesId == null || series.baseSeriesId === series.id;
}

/**
 * Apply includeSecondarySeries / seasonId filters to a loaded catalog.
 * Returns `{ error: 'season_not_found' }` when seasonId is set but missing.
 */
export function applyCatalogFilters(
  catalog: CatalogResponse,
  options: CatalogFilterOptions,
): CatalogResponse | {error: 'season_not_found'} {
  let seasons = catalog.seasons;

  if (options.seasonId != null && options.seasonId.length > 0) {
    const match = seasons.find((s) => s.id === options.seasonId);
    if (!match) {
      return {error: 'season_not_found'};
    }
    seasons = [match];
  }

  if (!options.includeSecondarySeries) {
    seasons = seasons.map((season) => ({
      ...season,
      series: season.series.filter(isPrimaryCatalogSeries),
    }));
  }

  return {clubId: catalog.clubId, seasons};
}
