import { format, parseISO, subYears } from 'date-fns';

/** One cell in a Sailwave series summary. Parentheses mark a discarded score. */
export interface SailwaveRaceCell {
  blank: boolean;
  discarded: boolean;
  points: number | null;
  code: string | null;
}

export interface SailwaveCompetitor {
  sailNumber: string;
  helm: string;
  crew: string;
  club: string;
  boatClass: string;
  boatName: string;
  fleet: string;
  rating: number | null;
  races: SailwaveRaceCell[];
}

/** The line Sailwave prints above a summary table: `Sailed: 12, Discards: 6, To count: 6, Entries: 42, ...`. */
export interface SailwaveSummaryCaption {
  sailed: number | null;
  discards: number | null;
  toCount: number | null;
  entries: number | null;
  ratingSystem: string;
  scoringSystem: string;
}

/** One table. A series page has a summary per fleet; race tables are used only when a page has no summary. */
export interface SailwaveSeries {
  id: string;
  title: string;
  seriesName: string;
  fleetLabel: string | null;
  sourceName: string;
  kind: 'series' | 'race';
  caption: SailwaveSummaryCaption | null;
  raceHeaders: string[];
  competitors: SailwaveCompetitor[];
  hasRatingColumn: boolean;
  /** `yyyy-MM-dd`: the last race, else when the results were published, else 1 July of the title year. */
  date: string | null;
  datePrecision: 'day' | 'year' | null;
}

export type SeriesAge = 'recent' | 'old' | 'undated';

const RECENT_YEARS = 2;

export function blankRaceCell(): SailwaveRaceCell {
  return { blank: true, discarded: false, points: null, code: null };
}

/** Races sailed so far. A published series often has empty columns for races still to come. */
export function sailedRaceCount(series: SailwaveSeries): number {
  if (series.caption?.sailed != null) return series.caption.sailed;
  return series.raceHeaders.filter((_, raceIndex) =>
    series.competitors.some(competitor => {
      const cell = competitor.races[raceIndex];
      return !!cell && !cell.blank;
    })).length;
}

export function seriesAge(series: SailwaveSeries, today: Date): SeriesAge {
  if (!series.date) return 'undated';
  const cutoff = format(subYears(today, RECENT_YEARS), 'yyyy-MM-dd');
  return series.date >= cutoff ? 'recent' : 'old';
}

export function describeSeries(series: SailwaveSeries): string {
  const parts: string[] = [];
  const caption = series.caption;
  const entries = caption?.entries ?? series.competitors.length;
  if (series.kind === 'race') {
    parts.push(`Single race, ${series.competitors.length} boats.`);
  } else {
    parts.push(`${entries} entries.`);
    const counts = [
      `sailed ${sailedRaceCount(series)}`,
      caption?.discards != null ? `discards ${caption.discards}` : '',
      caption?.toCount != null ? `to count ${caption.toCount}` : '',
    ].filter(Boolean).join(', ');
    parts.push(`${counts.charAt(0).toUpperCase()}${counts.slice(1)}.`);
  }
  if (!series.date) parts.push('No date found.');
  else if (series.datePrecision === 'year') parts.push(`${series.date.slice(0, 4)}.`);
  else parts.push(`${format(parseISO(series.date), 'd MMM yyyy')}.`);
  return parts.join(' ');
}
