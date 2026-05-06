import type { ResultCode } from 'app/scoring/model/result-code';

type CountingCandidate = Pick<{ seriesEntryId: string; resultCode: ResultCode }, 'seriesEntryId' | 'resultCode'>;

/** OOD rows stay visible/scored but are non-counting for DNC basis. */
export function isCountingCompetitorResultCode(resultCode: ResultCode): boolean {
  return resultCode !== 'OOD';
}

/** Entries are countable if they have at least one non-OOD result in the scored race set. */
export function countableSeriesEntryIds(
  competitors: CountingCandidate[],
): Set<string> {
  const ids = new Set<string>();
  for (const competitor of competitors) {
    if (isCountingCompetitorResultCode(competitor.resultCode)) {
      ids.add(competitor.seriesEntryId);
    }
  }
  return ids;
}
