
import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { USER_ROLES, UserData } from "../model/user-data.js";
import {
  assertAuthenticated,
  assertCanAssignRole,
  callerClaims,
} from "../shared/authorisation.js";
import { detailedHttpsError } from "../shared/https-error.js";

/**
 * Assigns a role to a user for a specific club or globally (sys-admin).
 * Authorization:
 * - sys-admin can assign any role.
 * - club-admin can assign race-officer or user roles within their club.
 */
export const assignRole = onCall(async (request) => {
  assertAuthenticated(request.auth);

  const { targetUid, clubId, role } = request.data;

  if (!targetUid || !role) {
    throw detailedHttpsError("invalid-argument", "Target UID and role are required.", {
      stage: "validate_input",
      cause: "missing_fields",
    });
  }

  if (!USER_ROLES.includes(role)) {
    throw detailedHttpsError("invalid-argument", "Invalid role specified.", {
      stage: "validate_input",
      cause: "invalid_role",
    });
  }

  const callerUid = request.auth.uid;
  const callerTokenClaims = callerClaims(request.auth);
  assertCanAssignRole(callerTokenClaims, role, clubId);

  const auth = getAuth();
  const db = getFirestore();

  if (clubId) {
    const update: Partial<UserData> = {
      role: role,
      updatedBy: callerUid,
      updatedAt: new Date().toISOString(),
    };

    await db.doc(`clubs/${clubId}/users/${targetUid}`).set(update, { merge: true });
  }

  const targetUser = await auth.getUser(targetUid);
  const targetClaims = targetUser.customClaims || {};

  if (role === "sys-admin") {
    targetClaims.sysAdmin = true;
  } else {
    const clubs = targetClaims.clubs || {};
    clubs[clubId!] = role;
    targetClaims.clubs = clubs;
  }

  await auth.setCustomUserClaims(targetUid, targetClaims);

  return { success: true };
});
