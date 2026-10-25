import type { PublishedSeries, PublishedSeriesResult } from './published-series';

type RaceScore = PublishedSeriesResult['raceScores'][number];

/**
 * A race score as stored on the published series document. Most of the document is
 * one of these per competitor per race, so the common values are left out:
 * `resultCode` 'OK' and `isDiscard` false.
 */
export type StoredRaceScore = Omit<RaceScore, 'resultCode' | 'isDiscard'> &
  Partial<Pick<RaceScore, 'resultCode' | 'isDiscard'>>;

/** A competitor row as stored: compact race scores, no tie-break scores (only needed while scoring). */
export type StoredSeriesResult = Omit<PublishedSeriesResult, 'raceScores' | 'scoresForTiebreak'> & {
  raceScores: StoredRaceScore[];
  scoresForTiebreak?: number[];
};

/** The published series document as stored in Firestore. */
export type StoredPublishedSeries = Omit<PublishedSeries, 'competitors'> & { competitors: StoredSeriesResult[] };

function compactRaceScore(score: RaceScore): StoredRaceScore {
  const { resultCode, isDiscard, notes, ...rest } = score;
  return {
    ...rest,
    ...(resultCode !== 'OK' ? { resultCode } : {}),
    ...(isDiscard ? { isDiscard: true } : {}),
    ...(notes ? { notes } : {}),
  };
}

/** Competitor rows in their stored form; unset optional fields are left out rather than written as null. */
export function compactSeriesResults(results: readonly PublishedSeriesResult[]): StoredSeriesResult[] {
  return results.map(({ scoresForTiebreak: _tiebreak, raceScores, ...rest }) => {
    const row = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined && value !== null),
    ) as unknown as Omit<StoredSeriesResult, 'raceScores'>;
    return { ...row, raceScores: raceScores.map(compactRaceScore) };
  });
}

/** A stored competitor row (compact or older full form) with defaults restored. */
export function expandSeriesResult(row: StoredSeriesResult): PublishedSeriesResult {
  return {
    ...row,
    scoresForTiebreak: row.scoresForTiebreak ?? [],
    raceScores: row.raceScores.map(score => ({
      ...score,
      resultCode: score.resultCode ?? 'OK',
      isDiscard: score.isDiscard ?? false,
    })),
  };
}
