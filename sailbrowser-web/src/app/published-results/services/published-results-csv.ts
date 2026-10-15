import { format } from 'date-fns';
import { toCsv } from 'app/shared/utils/csv';
import { hasRaceRank, type PublishedRace, type RaceResult } from '../model/published-race';
import type { PublishedSeries } from '../model/published-series';

/** Column "Race" is the series race number (1…n), same as results viewer “Race N” — not race-of-day. */
export const PUBLISHED_RESULTS_CSV_COLUMNS = [
  'Season',
  'Series',
  'Race',
  'Race date',
  'Race type',
  'Rank',
  'Helm',
  'Crew',
  'Boat class',
  'Sail number',
  'Boat name',
  'Club',
  'Handicap',
  'Laps',
  'Start time',
  'Finish time',
  'Elapsed',
  'Corrected time',
  'Result code',
  'Points',
] as const;

export interface PublishedSeriesExportChunk {
  seasonName: string;
  series: PublishedSeries;
  races: readonly PublishedRace[];
}

/** Same formatting as the duration pipe: seconds → mm:ss or hh:mm:ss; empty when ≤ 0. */
export function formatDurationSeconds(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || totalSeconds <= 0) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatClock(value: Date | undefined): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  return format(value, 'HH:mm:ss');
}

function formatRaceDate(value: Date | undefined): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  return format(value, 'yyyy-MM-dd');
}

function rowForResult(
  seasonName: string,
  seriesName: string,
  race: PublishedRace,
  result: RaceResult,
): Record<string, string> {
  return {
    Season: seasonName,
    Series: seriesName,
    Race: String(race.index),
    'Race date': formatRaceDate(race.scheduledStart),
    'Race type': race.type ?? '',
    Rank: hasRaceRank(result.rank) ? String(result.rank) : '',
    Helm: result.helm ?? '',
    Crew: result.crew ?? '',
    'Boat class': result.boatClass ?? '',
    'Sail number': result.sailNumber ?? '',
    'Boat name': result.boatName ?? '',
    Club: result.club ?? '',
    Handicap: result.handicap != null ? String(result.handicap) : '',
    Laps: result.laps != null ? String(result.laps) : '',
    'Start time': formatClock(result.startTime),
    'Finish time': formatClock(result.finishTime),
    Elapsed: formatDurationSeconds(result.elapsedTime),
    'Corrected time': formatDurationSeconds(result.correctedTime),
    'Result code': result.resultCode ?? '',
    Points: result.points != null ? String(result.points) : '',
  };
}

/** Long-format CSV: one row per boat per race across the given published series. */
export function buildPublishedResultsCsv(chunks: readonly PublishedSeriesExportChunk[]): string {
  const rows: Record<string, string>[] = [];
  const sorted = [...chunks].sort((a, b) => {
    const bySeason = a.seasonName.localeCompare(b.seasonName);
    if (bySeason !== 0) return bySeason;
    return a.series.name.localeCompare(b.series.name);
  });

  for (const chunk of sorted) {
    const races = [...chunk.races].sort((a, b) => a.index - b.index);
    for (const race of races) {
      const results = [...race.results].sort((a, b) => {
        const aRank = hasRaceRank(a.rank) ? a.rank : Number.POSITIVE_INFINITY;
        const bRank = hasRaceRank(b.rank) ? b.rank : Number.POSITIVE_INFINITY;
        if (aRank !== bRank) return aRank - bRank;
        return (a.helm ?? '').localeCompare(b.helm ?? '');
      });
      for (const result of results) {
        rows.push(rowForResult(chunk.seasonName, chunk.series.name, race, result));
      }
    }
  }

  return toCsv([...PUBLISHED_RESULTS_CSV_COLUMNS], rows);
}
