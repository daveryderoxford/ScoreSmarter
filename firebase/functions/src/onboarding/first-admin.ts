import type { Firestore } from "firebase-admin/firestore";
import type { AuthData } from "firebase-functions/tasks";
import { logger } from "firebase-functions/v2";
import { claimClubInTransaction, setClubAdminClaim } from "./claim-club.js";
import { onboardingPath, shouldGrantFirstAdmin, type ClubOnboarding } from "./onboarding-model.js";

/**
 * Makes the caller the club's first club admin when their verified email is the one the
 * club registered with and nobody has claimed it yet; a fallback for contacts who sign in
 * without using the welcome link. Returns true when granted. Expects the caller's club
 * user doc to exist. Never throws: signing in must not fail because of onboarding.
 */
export async function grantFirstAdminIfContact(db: Firestore, clubId: string, auth: AuthData): Promise<boolean> {
  const uid = auth.uid;
  try {
    const onboardingRef = db.doc(onboardingPath(clubId));
    const granted = await db.runTransaction(async tx => {
      const onboardingSnap = await tx.get(onboardingRef);
      const onboarding = onboardingSnap.exists ? onboardingSnap.data() as ClubOnboarding : undefined;
      if (!onboarding || !shouldGrantFirstAdmin(onboarding, auth.token)) return false;
      await claimClubInTransaction(tx, db, clubId, uid, onboarding);
      return true;
    });
    if (!granted) return false;

    await setClubAdminClaim(uid, clubId);
    logger.info("grantFirstAdminIfContact: first club admin", { clubId, uid });
    return true;
  } catch (err) {
    logger.error("grantFirstAdminIfContact failed", { clubId, uid, error: String(err) });
    return false;
  }
}
