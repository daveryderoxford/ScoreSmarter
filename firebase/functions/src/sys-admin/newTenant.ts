
// TODO not complete
// Need to consider how logon is handled for provisioning
// do we first get a login and then call provisioning function

import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { makeUser } from "../user/user.js";
import { assertAuthenticated, assertCallerRole } from "../shared/authorisation.js";
import { detailedHttpsError } from "../shared/https-error.js";

export const createNewTenant = onCall(async (request) => {
   assertAuthenticated(request.auth);

   const uid = request.auth.uid;
   const { clubId } = request.data;

   if (!clubId || typeof clubId !== "string") {
      throw detailedHttpsError("invalid-argument", "clubId is required.", {
         stage: "validate_input",
         cause: "missing_club_id",
      });
   }

   assertCallerRole("sys-admin", request.auth, clubId);

   const db = getFirestore();
   const auth = getAuth();

   try {
      // 1. Create a club document
      // TODO

      const user = await auth.getUser(uid);
      const currentClaims = user.customClaims || {};
      const clubs = currentClaims.clubs || {};
      clubs[clubId] = "club-admin";

      await auth.setCustomUserClaims(uid, {
         ...currentClaims,
         clubs,
      });

      const userData = makeUser(clubId, uid, "club-admin", request.auth);
      await db.doc(`clubs/${clubId}/users/${uid}`).set(userData);

      const tenantRef = db.collection(`tenants/${clubId}`).doc();

      await tenantRef.set({
         id: clubId,
         name: clubId,
         email: userData.email,
         firstName: userData.firstname,
         surname: userData.surname,
         ownerUid: uid,
         createdAt: new Date().toISOString(),
         plan: "free",
      });

      return { success: true, tenantId: clubId };
   } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Provisioning failed.";
      throw detailedHttpsError("internal", message, {
         stage: "create_new_tenant",
      });
   }
});
