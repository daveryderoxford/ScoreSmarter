import { HandicapScheme } from './handicap-scheme';
import { isUnknownHandicapValue } from './personal-handicap';

export interface Handicap {
  scheme: HandicapScheme;
  value: number;
}

/**
 * Returns the numeric handicap value for `scheme` (must be > 0) or undefined.
 */
export function getHandicapValue(
  handicaps: Handicap[] | undefined,
  scheme: HandicapScheme
): number | undefined {
  const h = handicaps?.find(x => x.scheme === scheme);
  if (!h) return undefined;
  return h.value > 0 ? h.value : undefined;
}

/**
 * Returns handicap value only when it is a known/scorable number for `scheme`.
 */
export function getScorableHandicapValue(
  handicaps: Handicap[] | undefined,
  scheme: HandicapScheme
): number | undefined {
  const value = getHandicapValue(handicaps, scheme);
  return isUnknownHandicapValue(scheme, value) ? undefined : value;
}

