import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Ideal interface for your sailing app frontend
interface SailingForecast {
   time: string;
   windSpeedKnots: number;
   windGustKnots: number;
   windDirectionDegrees: number;
   feelsLikeTemp: number;
}

export const getMetOfficeForcast = onCall(
   {
      secrets: ['MET_OFFICE_API_KEY'], // Securely bind the single Met Office API Key
      region: 'europe-west1'           // Keeps execution close to UK/EU for lower latency
   },
   async (request) => {
      const db = getFirestore();
      
      // 1. Extract and validate parameters
      const { latitude, longitude, locationId } = request.data;

      if (!latitude || !longitude || !locationId) {
         throw new HttpsError('invalid-argument', 'Missing coordinates or location identifier.');
      }

      // 2. Check the Firestore Cache
      const cacheRef = db.collection('weather_caches').doc(locationId);
      const cacheDoc = await cacheRef.get();
      const now = Date.now();

      // If cache exists and is younger than 60 minutes (3,600,000 ms), return it immediately
      if (cacheDoc.exists) {
         const cachedData = cacheDoc.data();
         if (cachedData && now - cachedData.updatedAt.toMillis() < 3600000) {
            console.log(`Cache hit for ${locationId}`);
            return { success: true, fromCache: true, data: cachedData.forecast };
         }
      }

      // 3. Cache missed or expired: Prepare to fetch fresh data
      const apiKey = process.env.MET_OFFICE_API_KEY;
      if (!apiKey) {
         throw new HttpsError('internal', 'Server configuration missing credentials.');
      }

      // Build the URL safely using Node 22's native URL constructor
      const url = new URL('https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/hourly');
      url.searchParams.append('latitude', latitude.toString());
      url.searchParams.append('longitude', longitude.toString());

      try {
         // 4. Fetch from Met Office using Node 22 Native Fetch & AbortSignal
         const response = await fetch(url, {
            method: 'GET',
            headers: {
               'apikey': apiKey,
               'accept': 'application/json'
            },
            signal: AbortSignal.timeout(6000) // Drops the connection if Met Office stalls for >6s
         });

         // Native fetch requires manual check for non-2xx status codes
         if (!response.ok) {
            throw new Error(`Met Office API responded with status ${response.status}`);
         }

         const responseData = await response.json();

         // 5. Process the nested Met Office GeoJSON structure
         const timeSeries = responseData.features[0].properties.timeSeries;

         const processedForecast: SailingForecast[] = timeSeries.map((slot: any) => {
            return {
               time: slot.time,
               // Convert natively provided m/s to knots, rounded to 1 decimal place
               windSpeedKnots: Math.round(slot.windSpeed10m * 1.94384 * 10) / 10,
               windGustKnots: Math.round(slot.windGustSpeed10m * 1.94384 * 10) / 10,
               windDirectionDegrees: slot.windDirectionFrom10m,
               feelsLikeTemp: slot.feelsLikeTemperature
            };
         });

         // 6. Update the Firestore cache asynchronously
         await cacheRef.set({
            locationId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            forecast: processedForecast
         });

         console.log(`Fresh data fetched and cached for ${locationId}`);
         return { success: true, fromCache: false, data: processedForecast };

      } catch (error: any) {
         // Differentiate between a timeout and a general crash
         if (error.name === 'TimeoutError') {
            console.error('Met Office API Request Timed Out.');
            throw new HttpsError('deadline-exceeded', 'The weather server took too long to respond.');
         }

         console.error('DataHub API Fetch Failed:', error.message);
         throw new HttpsError('internal', 'Failed to retrieve fresh marine forecast data.');
      }
   }
);