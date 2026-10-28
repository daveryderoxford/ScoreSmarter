import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import type { UserData } from "../model/user-data.js";
import { adminJoinedFields, CLUB_REGISTRATIONS, onboardingPath, type ClubOnboarding } from "./onboarding-model.js";

/**
 * Within a transaction, records `uid` as the club's first administrator: the onboarding
 * doc is claimed (so the welcome link stops working), the club moves to setting up, and
 * the user doc gets the club-admin role. Does the reads it needs, so call it before
 * making any other writes in the transaction. `newUser` is written when the user has no
 * club user doc yet; without it the doc must exist.
 */
export async function claimClubInTransaction(
  tx: Transaction,
  db: Firestore,
  clubId: string,
  uid: string,
  onboarding: ClubOnboarding,
  newUser?: UserData,
): Promise<void> {
  const registrationRef = db.doc(`${CLUB_REGISTRATIONS}/${onboarding.registrationId}`);
  const userRef = db.doc(`clubs/${clubId}/users/${uid}`);
  const [registrationSnap, userSnap] = await Promise.all([tx.get(registrationRef), tx.get(userRef)]);
  const now = Timestamp.now();

  tx.update(db.doc(onboardingPath(clubId)), { claimedBy: uid, claimedAt: now, codeHash: FieldValue.delete() });
  tx.update(db.doc(`clubs/${clubId}`), adminJoinedFields(now));
  if (userSnap.exists) {
    tx.update(userRef, { role: "club-admin", updatedBy: uid, updatedAt: new Date().toISOString() });
  } else if (newUser) {
    tx.set(userRef, { ...newUser, role: "club-admin" });
  } else {
    throw new Error(`clubs/${clubId}/users/${uid} does not exist`);
  }
  if (registrationSnap.exists) {
    tx.update(registrationRef, { adminClaimedBy: uid, adminClaimedAt: now, updatedAt: now });
  }
}

/** Adds club admin for `clubId` to the user's custom claims, keeping their other clubs. */
export async function setClubAdminClaim(uid: string, clubId: string): Promise<void> {
  const user = await getAuth().getUser(uid);
  const claims = user.customClaims ?? {};
  await getAuth().setCustomUserClaims(uid, {
    ...claims,
    clubs: { ...(claims.clubs ?? {}), [clubId]: "club-admin" },
  });
}
