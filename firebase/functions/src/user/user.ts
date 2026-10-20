import { getFirestore } from "firebase-admin/firestore";
import { AuthData } from "firebase-functions/tasks";
import { CallableRequest, onCall } from "firebase-functions/v2/https";
import { Role, UserData } from "../model/user-data.js";
import { assertAuthenticated } from "../shared/authorisation.js";
import { detailedHttpsError } from "../shared/https-error.js";

const MAX_NAME_LENGTH = 100;

interface EnsureUserDataRequest {
   clubId: string;
   /** Supplied by email/password signup, where the auth token carries no name. */
   firstname?: string;
   surname?: string;
}

export const ensureUserData =
   onCall(async (request: CallableRequest<EnsureUserDataRequest>) => {
   assertAuthenticated(request.auth);

   const uid = request.auth.uid;
   const { clubId } = request.data;

   if (!clubId) {
      throw detailedHttpsError("invalid-argument", "The function must be called with a clubId.", {
         stage: "validate_input",
         cause: "missing_club_id",
      });
   }

   const names = normaliseNames(request.data.firstname, request.data.surname);
   const auth = request.auth;
   const db = getFirestore();

   try {
      const userRef = db.doc(`clubs/${clubId}/users/${uid}`);

      // Transaction so a concurrent call without names (the login-time call) cannot
      // overwrite names written by the signup call.
      return await db.runTransaction(async tx => {
         const docSnap = await tx.get(userRef);

         if (!docSnap.exists) {
            const user = makeUser(clubId, uid, "user", auth, names);
            tx.set(userRef, user, { merge: true });
            return { user, id: uid, isNew: true };
         }

         const existing = docSnap.data() as UserData;
         const hasStoredName = !!(existing.firstname?.trim() || existing.surname?.trim());
         if (names && !hasStoredName) {
            const update = {
               firstname: names.firstname,
               surname: names.surname,
               updatedBy: uid,
               updatedAt: new Date().toISOString(),
            };
            tx.update(userRef, update);
            return { user: { ...existing, ...update }, id: uid, isNew: false };
         }

         return { user: existing, id: uid, isNew: false };
      });
   } catch (error) {
      console.error("Error updating user profile:", error);
      throw detailedHttpsError("internal", "Unable to update profile.", {
         stage: "ensure_user_data",
      });
   }
});

function normaliseNames(
   firstname: unknown,
   surname: unknown,
): { firstname: string; surname: string } | undefined {
   // Same rule as the web app's normaliseWhitespace: trim and collapse runs of whitespace.
   const tidy = (value: unknown) =>
      typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
   const first = tidy(firstname);
   const last = tidy(surname);
   return first || last ? { firstname: first, surname: last } : undefined;
}

/** Makes a userData object, using explicit names when given, otherwise the Firebase auth token. */
export function makeUser(
   clubId: string,
   uid: string,
   role: Role,
   auth: AuthData,
   names?: { firstname: string; surname: string },
): UserData {

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

   if (names) {
      finalFirstName = names.firstname;
      finalSurname = names.surname;
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
