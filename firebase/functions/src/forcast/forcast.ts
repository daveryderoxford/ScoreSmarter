import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getMetOfficeForcast } from './met-office.js';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export const getForcast = onCall(
   {
      secrets: ['MET_OFFICE_API_KEY'], // Securely bind the single Met Office API Key
      region: 'europe-west1'           // Keeps execution close to UK/EU for lower latency
   },
   async (request) => {
      const { latitude, longitude, clubId } = request.data;

      if (!latitude || !longitude || !clubId) {
         throw new HttpsError('invalid-argument', 'Missing coordinates or location identifier.');
      }

      // Return cached data if less than 1 hour old
      const cacheRef = db.doc(`clubs/${clubId}/forcasts/current`);
      const cacheDoc = await cacheRef.get();
      const now = Date.now();

      // If cache exists and is younger than 60 minutes (3,600,000 ms), return it immediately
      if (cacheDoc.exists) {
         const cachedData = cacheDoc.data();
         if (cachedData && now - cachedData.updatedAt.toMillis() < 3600000) {
            console.log(`getForcast: Cache hit for ${clubId}`);
            return { success: true, fromCache: true, data: cachedData.forecast };
         }
      }

      // Cache missed or expired: Read fresh data from met office
      const apiKey = process.env.MET_OFFICE_API_KEY;
      if (!apiKey) {
         throw new HttpsError('internal', 'Server configuration missing credentials.');
      }

      try {

        const timeSeries = await getMetOfficeForcast( apiKey, latitude, longitude)

         // Update the Firestore cache asynchronously
         await cacheRef.set({
            clubId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            forecast: timeSeries
         });

         console.log(`getForcast: Fresh data fetched and cached for ${clubId}`);
         return { success: true, fromCache: false, data: timeSeries };

      } catch (error: any) {
         // Differentiate between a timeout and a general crash
         if (error.name === 'TimeoutError') {
            console.error('getForcast: Met Office API Request Timed Out.');
            throw new HttpsError('deadline-exceeded', 'The weather server took too long to respond.');
         }

         console.error('getForcast: DataHub API Fetch Failed:', error.message);
         throw new HttpsError('internal', 'Failed to retrieve fresh marine forecast data.');
      }
   }
);