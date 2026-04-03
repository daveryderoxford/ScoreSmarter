import { HandicapScheme } from './handicap-scheme';

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

