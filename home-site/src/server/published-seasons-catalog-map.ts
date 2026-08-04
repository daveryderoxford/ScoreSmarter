/** Must stay in sync with sailbrowser-web published results viewer routes. */
export const RESULTS_VIEWER_HOST_SUFFIX = '.ro.scoresmarter.app';

export interface CatalogSeries {
  id: string;
  baseSeriesId?: string;
  name: string;
  fleetId: string;
  startDate: string;
  endDate: string;
  raceCount: number;
  recentRaceCount6d?: number;
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

export function isValidClubId(clubId: unknown): clubId is string {
  return (
    typeof clubId === 'string' &&
    clubId.trim().length > 0 &&
    clubId.trim().length <= 64 &&
    /^[a-zA-Z0-9_-]+$/.test(clubId.trim())
  );
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

  if (typeof raw['baseSeriesId'] === 'string' && raw['baseSeriesId'].length > 0) {
    series.baseSeriesId = raw['baseSeriesId'];
  }
  if (
    typeof raw['recentRaceCount6d'] === 'number' &&
    Number.isFinite(raw['recentRaceCount6d'])
  ) {
    series.recentRaceCount6d = raw['recentRaceCount6d'];
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
