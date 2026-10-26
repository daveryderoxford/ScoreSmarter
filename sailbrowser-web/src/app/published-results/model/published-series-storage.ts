import type {
  DocumentData,
  FirestoreDataConverter,
  PartialWithFieldValue,
  QueryDocumentSnapshot,
  SetOptions,
} from '@angular/fire/firestore';
import { publishedDivisionDefinitions } from 'app/race-calender/model/division';
import { dataObjectConverter, toAppModel } from 'app/shared/firebase/firestore-helper';
import type { PublishedSeries, PublishedSeriesResult } from './published-series';

type RaceScore = PublishedSeriesResult['raceScores'][number];

/**
 * A race score as stored on the published series document. `resultCode` 'OK' is left
 * out, and discards are listed per competitor rather than flagged per score.
 * (Documents published before this format may still carry `isDiscard`.)
 */
export type StoredRaceScore = Omit<RaceScore, 'resultCode' | 'isDiscard'> &
  Partial<Pick<RaceScore, 'resultCode' | 'isDiscard'>>;

/**
 * A competitor row as stored. When the series has `dncPoints`, races with no score are
 * DNC at those points (most entries in a club series are DNC). No tie-break scores:
 * they are only needed while scoring.
 */
export type StoredSeriesResult = Omit<PublishedSeriesResult, 'raceScores' | 'scoresForTiebreak'> & {
  raceScores: StoredRaceScore[];
  /** Race numbers whose score is discarded. */
  discardedRaces?: number[];
  scoresForTiebreak?: number[];
};

/** The published series document as stored in Firestore. */
export type StoredPublishedSeries = Omit<PublishedSeries, 'competitors'> & {
  competitors: StoredSeriesResult[];
  /** Points for every race left out of a competitor's `raceScores`. */
  dncPoints?: number;
};

/** The points most DNC scores in the series carry, if any. */
function commonDncPoints(rows: readonly PublishedSeriesResult[]): number | undefined {
  const counts = new Map<number, number>();
  for (const row of rows) {
    for (const s of row.raceScores) {
      if (s.resultCode === 'DNC') counts.set(s.points, (counts.get(s.points) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** True when every row scores exactly the series' races, in race order. */
function rowsMatchRaces(rows: readonly PublishedSeriesResult[], raceIndexes: readonly number[]): boolean {
  return rows.every(
    r => r.raceScores.length === raceIndexes.length && r.raceScores.every((s, i) => s.raceIndex === raceIndexes[i]),
  );
}

function compactRow(row: PublishedSeriesResult, dncPoints: number | undefined): StoredSeriesResult {
  const { scoresForTiebreak: _tiebreak, raceScores, ...rest } = row;
  const fields = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined && value !== null),
  ) as unknown as Omit<StoredSeriesResult, 'raceScores'>;
  const discardedRaces = raceScores.filter(s => s.isDiscard).map(s => s.raceIndex);
  return {
    ...fields,
    raceScores: raceScores
      .filter(s => !(dncPoints !== undefined && s.resultCode === 'DNC' && s.points === dncPoints))
      .map(({ raceIndex, points, resultCode, notes }) => ({
        raceIndex,
        points,
        ...(resultCode !== 'OK' ? { resultCode } : {}),
        ...(notes ? { notes } : {}),
      })),
    ...(discardedRaces.length > 0 ? { discardedRaces } : {}),
  };
}

/** The series in its stored form. DNC scores are left out when every row lines up with `raceStarts`. */
export function compactPublishedSeries(series: PublishedSeries): StoredPublishedSeries {
  const raceIndexes = series.raceStarts?.map(r => r.index);
  const dncPoints = raceIndexes && rowsMatchRaces(series.competitors, raceIndexes)
    ? commonDncPoints(series.competitors)
    : undefined;
  return {
    ...series,
    ...(dncPoints !== undefined ? { dncPoints } : {}),
    competitors: series.competitors.map(row => compactRow(row, dncPoints)),
  };
}

function expandRow(row: StoredSeriesResult, raceIndexes: readonly number[] | undefined, dncPoints: number | undefined): PublishedSeriesResult {
  const { discardedRaces, raceScores, scoresForTiebreak, ...rest } = row;
  const discarded = new Set(discardedRaces ?? []);
  const byIndex = new Map(raceScores.map(s => [s.raceIndex, s] as const));
  const indexes = raceIndexes ?? raceScores.map(s => s.raceIndex);
  return {
    ...rest,
    scoresForTiebreak: scoresForTiebreak ?? [],
    raceScores: indexes.map(raceIndex => {
      const s = byIndex.get(raceIndex);
      if (!s) return { raceIndex, points: dncPoints ?? 0, resultCode: 'DNC', isDiscard: discarded.has(raceIndex) };
      return { ...s, resultCode: s.resultCode ?? 'OK', isDiscard: s.isDiscard ?? discarded.has(raceIndex) };
    }),
  };
}

/** A stored series (any format published so far) with every competitor's full race scores restored. */
export function expandPublishedSeries(series: StoredPublishedSeries): PublishedSeries {
  const { dncPoints, ...rest } = series;
  const raceIndexes = dncPoints !== undefined ? series.raceStarts?.map(r => r.index) : undefined;
  return {
    ...rest,
    competitors: series.competitors.map(row => expandRow(row, raceIndexes, dncPoints)),
  };
}

/** A stored series as the app uses it: full race scores, and division fields defaulted. */
export function readPublishedSeries(stored: StoredPublishedSeries): PublishedSeries {
  const series = expandPublishedSeries(stored);
  return {
    ...series,
    competitors: series.competitors.map(c => ({ ...c, divisions: Array.isArray(c.divisions) ? c.divisions : [] })),
    divisionDefinitions: publishedDivisionDefinitions(series),
  };
}

const genericConverter = dataObjectConverter<StoredPublishedSeries>();

/**
 * Converter for published series documents, so no reader or writer sees the stored
 * format: full writes are compacted, reads are expanded. Partial writes pass through.
 */
export const publishedSeriesConverter: FirestoreDataConverter<PublishedSeries> = {
  toFirestore(series: PartialWithFieldValue<PublishedSeries>, options?: SetOptions): DocumentData {
    if (options) return genericConverter.toFirestore(series as PartialWithFieldValue<StoredPublishedSeries>, options);
    return genericConverter.toFirestore(compactPublishedSeries(series as PublishedSeries));
  },
  fromFirestore(snap: QueryDocumentSnapshot): PublishedSeries {
    return readPublishedSeries({ ...toAppModel<StoredPublishedSeries>(snap.data()), id: snap.id });
  },
};
