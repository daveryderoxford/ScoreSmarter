import { getFirestore } from "firebase-admin/firestore";
import { AuthData } from "firebase-functions/tasks";
import { CallableRequest, onCall } from "firebase-functions/v2/https";
import { Role, UserData } from "../model/user-data.js";
import { assertAuthenticated } from "../shared/authorisation.js";
import { detailedHttpsError } from "../shared/https-error.js";

export const ensureUserData =
   onCall(async (request: CallableRequest<{ clubId: string }>) => {
   assertAuthenticated(request.auth);

   const uid = request.auth.uid;
   const { clubId } = request.data;

   if (!clubId) {
      throw detailedHttpsError("invalid-argument", "The function must be called with a clubId.", {
         stage: "validate_input",
         cause: "missing_club_id",
      });
   }

   const db = getFirestore();

   try {
      const userRef = db.doc(`clubs/${clubId}/users/${uid}`);

      const docSnap = await userRef.get();
      if (docSnap.exists) {
         return { user: docSnap.data(), id: uid, isNew: false };
      } else {
         const user = makeUser(clubId, uid, "user", request.auth);
         await userRef.set(user, { merge: true });
         return { user: user, id: uid, isNew: true };
      }
   } catch (error) {
      console.error("Error updating user profile:", error);
      throw detailedHttpsError("internal", "Unable to update profile.", {
         stage: "ensure_user_data",
      });
   }
});

/** Makes a uuserData object populating fields from the Firebase auth object */
export function makeUser(clubId: string, uid: string, role: Role, auth: AuthData): UserData {

   const token = auth.token;

   const email = token.email || "";
   const firstName = (token.given_name as string) || "";
   const surname = (token.family_name as string) || "";

   let finalFirstName = firstName;
   let finalSurname = surname;

   if (!firstName && !surname && token.name) {
      const parts = (token.name as string).split(" ");
      finalFirstName = parts[0];
      finalSurname = parts.length > 1 ? parts.slice(1).join(" ") : "";
   }

   return {
      id: uid,
      role: role,
      tenantId: clubId,
      email: email,
      firstname: finalFirstName,
      surname: finalSurname,
      updatedBy: auth.uid,
      updatedAt: new Date().toISOString(),
      boats: [],
   };
}
