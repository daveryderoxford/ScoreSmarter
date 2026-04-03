import { differenceInSeconds } from 'date-fns';
import { ResultCode } from '../model/result-code';
import { HandicapScheme } from '../model/handicap-scheme';

export interface GetElapsedSecondsArgs {
  startTime?: Date;
  finishTime?: Date;
  resultCode: ResultCode;
  isAverageLap: boolean;
  laps: number;
  maxLaps: number;
}

export function getElapsedSeconds(args: GetElapsedSecondsArgs): number {
  const { startTime, finishTime, isAverageLap, laps, maxLaps } = args;

  if (!startTime || !finishTime) {
    return 0;
  }

  // Preserve existing behavior: for NOT_FINISHED we still return 0.
  // (DNF/OCS/etc may still have a manual finish time in some workflows.)
  if (args.resultCode === 'NOT FINISHED') {
    return 0;
  }

  const diff = differenceInSeconds(finishTime, startTime);
  if (diff < 0) {
    return 0;
  }

  if (isAverageLap && laps === 0) {
    return 0;
  }

  const elapsed = isAverageLap ? (diff / laps) * maxLaps : diff;
  return Math.round(elapsed);
}

export function getCorrectedTime(
  elapsedSeconds: number,
  handicapValue: number,
  scheme: HandicapScheme
): number {
  if (elapsedSeconds === 0) {
    return 0;
  }

  switch (scheme) {
    case 'PY':
      return Math.round((elapsedSeconds * 1000.0) / handicapValue);
    case 'Personal':
      // Same as PY for now.
      return Math.round((elapsedSeconds * 1000.0) / handicapValue);
    case 'Level Rating':
      return elapsedSeconds;
    case 'IRC': {
      const corrected = elapsedSeconds * handicapValue;
      // Round up to nearest 0.5 seconds.
      return Math.ceil(corrected * 2) / 2;
    }
    default:
      return elapsedSeconds;
  }
}

