
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { USER_ROLES, UserData } from '../model/user-data';

/**
 * Assigns a role to a user for a specific club or globally (sys-admin).
 * Authorization:
 * - sys-admin can assign any role.
 * - club-admin can assign race-officer or user roles within their club.
 */
export const assignRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const { targetUid, clubId, role } = request.data;

  if (!targetUid || !role) {
    throw new HttpsError('invalid-argument', 'Target UID and role are required.');
  }

  if (!USER_ROLES.includes(role)) {
    throw new HttpsError('invalid-argument', 'Invalid role specified.');
  }

  const callerUid = request.auth.uid;
  const auth = getAuth();
  const db = getFirestore();

  const caller = await auth.getUser(callerUid);
  const callerClaims = caller.customClaims || {};

  const isSysAdmin = callerClaims.sysAdmin === true;
  const isClubAdmin = clubId && callerClaims.clubs?.[clubId] === 'club-admin';

  if (!isSysAdmin && !isClubAdmin) {
    throw new HttpsError('permission-denied', 'You do not have permission to assign roles.');
  }

  // Only sys-admin can assign club-admin or sys-admin roles
  if (!isSysAdmin && (role === 'club-admin' || role === 'sys-admin')) {
    throw new HttpsError('permission-denied', 'Only sys-admins can assign administrative roles.');
  }

  // Update Firestore club-specific user record
  if (clubId) {

    const update: Partial<UserData> = {
      role: role,
      updatedBy: callerUid,
      updatedAt: new Date().toISOString(),
    };

    await db.doc(`clubs/${clubId}/users/${targetUid}`).set(update, { merge: true });
  }

  // Update Custom Claims
  const targetUser = await auth.getUser(targetUid);
  const targetClaims = targetUser.customClaims || {};

  if (role === 'sys-admin') {
    targetClaims.sysAdmin = true;
  } else {
    if (!clubId) {
      throw new HttpsError('invalid-argument', 'Club ID is required for non-sys-admin roles.');
    }
    const clubs = targetClaims.clubs || {};
    clubs[clubId] = role;
    targetClaims.clubs = clubs;
  }

  await auth.setCustomUserClaims(targetUid, targetClaims);

  return { success: true };
});
