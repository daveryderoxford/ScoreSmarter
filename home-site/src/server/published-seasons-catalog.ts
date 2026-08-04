import {getApps, initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import type {CatalogResponse, CatalogSeason} from './published-seasons-catalog-map';
import {mapPublishedSeason} from './published-seasons-catalog-map';

function adminFirestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

/**
 * Load the public published-seasons catalog for a club from Firestore.
 * Throws if the club document does not exist.
 */
export async function loadPublishedSeasonsCatalog(clubId: string): Promise<CatalogResponse> {
  const db = adminFirestore();
  const clubSnap = await db.doc(`clubs/${clubId}`).get();
  if (!clubSnap.exists) {
    const err = new Error('club_not_found');
    (err as Error & {code: string}).code = 'club_not_found';
    throw err;
  }

  const seasonsSnap = await db.collection(`clubs/${clubId}/published_seasons`).get();
  const seasons: CatalogSeason[] = seasonsSnap.docs.map((doc) =>
    mapPublishedSeason(doc.id, (doc.data() ?? {}) as Record<string, unknown>, clubId),
  );
  seasons.sort((a, b) => a.id.localeCompare(b.id));

  return {clubId, seasons};
}
