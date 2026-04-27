
//TODO not complete 
// Need to consider how logon is handled for provisioning
// do we first get a login and then call provisioning function

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth' ;
import { makeUser } from '../user/user.js';

export const createNewTenant = onCall(async (request) => {
   // 1. Check if the user is authenticated
   if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be logged in.');
   }

   const uid = request.auth.uid;
   const { clubId } = request.data;

   const db = getFirestore();
   const auth = getAuth();

   try {
      // 1. Create a club dcouemnt
      // TODO

      // 3. Set Custom Claims on the User's Auth Token
      // We use the new multi-tenant structure
      const user = await auth.getUser(uid);
      const currentClaims = user.customClaims || {};
      const clubs = currentClaims.clubs || {};
      clubs[clubId] = 'club-admin';

      await auth.setCustomUserClaims(uid, {
         ...currentClaims,
         clubs
      });

      // Also create the user record in the club's users collection
      const userData = makeUser(clubId, uid, 'club-admin', request.auth);
      await db.doc(`clubs/${clubId}/users/${uid}`).set(userData);

      // Create a new Tenant Document
      const tenantRef = db.collection(`tenants/${clubId}`).doc();

      await tenantRef.set({
         id: clubId,
         name: clubId,
         email: userData.email,
         firstName: userData.firstname,
         surname: userData.surname,
         ownerUid: uid,
         createdAt: new Date().toISOString(),
         plan: 'free'
      });

      return { success: true, tenantId: clubId };
   } catch (error: any) {
      throw new HttpsError('internal', error.message);
   }
});