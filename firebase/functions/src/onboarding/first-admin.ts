import { getAuth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { AuthData } from "firebase-functions/tasks";
import { logger } from "firebase-functions/v2";
import {
  CLUB_REGISTRATIONS,
  onboardingPath,
  shouldGrantFirstAdmin,
  type ClubOnboarding,
} from "./onboarding-model.js";

/**
 * Makes the caller the club's first club admin when their verified email is the one the
 * club registered with and nobody has claimed it yet. Returns true when granted.
 * Expects the caller's club user doc to exist. Never throws: signing in must not fail
 * because of onboarding.
 */
export async function grantFirstAdminIfContact(db: Firestore, clubId: string, auth: AuthData): Promise<boolean> {
  const uid = auth.uid;
  try {
    const onboardingRef = db.doc(onboardingPath(clubId));
    const granted = await db.runTransaction(async tx => {
      const onboardingSnap = await tx.get(onboardingRef);
      const onboarding = onboardingSnap.exists ? onboardingSnap.data() as ClubOnboarding : undefined;
      if (!onboarding || !shouldGrantFirstAdmin(onboarding, auth.token)) return false;

      const registrationRef = db.doc(`${CLUB_REGISTRATIONS}/${onboarding.registrationId}`);
      const registrationExists = (await tx.get(registrationRef)).exists;

      tx.update(onboardingRef, { claimedBy: uid, claimedAt: FieldValue.serverTimestamp() });
      tx.update(db.doc(`clubs/${clubId}/users/${uid}`), {
        role: "club-admin",
        updatedBy: uid,
        updatedAt: new Date().toISOString(),
      });
      if (registrationExists) {
        tx.update(registrationRef, {
          adminClaimedBy: uid,
          adminClaimedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return true;
    });
    if (!granted) return false;

    const user = await getAuth().getUser(uid);
    const claims = user.customClaims ?? {};
    await getAuth().setCustomUserClaims(uid, {
      ...claims,
      clubs: { ...(claims.clubs ?? {}), [clubId]: "club-admin" },
    });
    logger.info("grantFirstAdminIfContact: first club admin", { clubId, uid });
    return true;
  } catch (err) {
    logger.error("grantFirstAdminIfContact failed", { clubId, uid, error: String(err) });
    return false;
  }
}
