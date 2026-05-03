import type { Series } from './series';
import { DISCARD_PROFILE_CAP, discardTableFromLegacy } from 'app/scoring/model/discard-profile';

/**
 * Firestore may omit `discards` or ship only deprecated `initialDiscardAfter` /
 * `subsequentDiscardsEveryN`. Downstream uses {@link hydrateSeriesFromFirestore}
 * immediately after read so {@link Series} always has {@link Series.discards}.
 */
export type RawSeriesFirestoreDocument = Omit<Series, 'discards'> & {
  discards?: number[];
  initialDiscardAfter?: number;
  subsequentDiscardsEveryN?: number;
};

export function hydrateSeriesFromFirestore(raw: RawSeriesFirestoreDocument): Series {
  const legacyInitial = raw.initialDiscardAfter ?? 4;
  const legacyStep = Math.max(1, raw.subsequentDiscardsEveryN ?? 3);
  const discards =
    Array.isArray(raw.discards) && raw.discards.length > 0
      ? [...raw.discards]
      : discardTableFromLegacy(legacyInitial, legacyStep, DISCARD_PROFILE_CAP);

  const {
    initialDiscardAfter: _a,
    subsequentDiscardsEveryN: _s,
    discards: _d,
    ...seriesCore
  } = raw;

  return { ...seriesCore, discards };
}
