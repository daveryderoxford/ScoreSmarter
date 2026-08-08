import {getApps, initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import type {SeriesCalendarFilterOptions, SeriesCalendarResponse} from './series-calendar-map';
import {buildSeriesCalendar, mapClubSeasons} from './series-calendar-map';

function adminFirestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

/**
 * Load the live series calendar for a club from Firestore.
 * Uses clubs/{clubId} seasons and clubs/{clubId}/series.
 * Loads clubs/{clubId}/races only when `includeRaces` is true.
 * Throws if the club document does not exist.
 */
export async function loadSeriesCalendar(
  clubId: string,
  options: SeriesCalendarFilterOptions,
): Promise<SeriesCalendarResponse | {error: 'season_not_found'}> {
  const db = adminFirestore();
  const clubSnap = await db.doc(`clubs/${clubId}`).get();
  if (!clubSnap.exists) {
    const err = new Error('club_not_found');
    (err as Error & {code: string}).code = 'club_not_found';
    throw err;
  }

  const clubData = (clubSnap.data() ?? {}) as Record<string, unknown>;
  const seasons = mapClubSeasons(clubData['seasons']);

  const seriesPromise = db.collection(`clubs/${clubId}/series`).get();
  const racesPromise = options.includeRaces
    ? db.collection(`clubs/${clubId}/races`).get()
    : Promise.resolve(null);

  const [seriesSnap, racesSnap] = await Promise.all([seriesPromise, racesPromise]);
  const seriesDocs = seriesSnap.docs.map((doc) => ({
    id: doc.id,
    data: (doc.data() ?? {}) as Record<string, unknown>,
  }));
  const raceDocs =
    racesSnap == null
      ? []
      : racesSnap.docs.map((doc) => ({
          id: doc.id,
          data: (doc.data() ?? {}) as Record<string, unknown>,
        }));

  return buildSeriesCalendar(clubId, seasons, seriesDocs, raceDocs, options);
}
