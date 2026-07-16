import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import {
  assertAuthenticated,
  assertCallerRole,
} from "../shared/authorisation.js";
import { detailedHttpsError } from "../shared/https-error.js";
import { ensureKioskAuthUser } from "./ensure-kiosk-user.js";
import {
  AuthorizedKiosk,
  kioskClaims,
  kioskDocPath,
  kioskUid,
  MAX_LABEL_LENGTH,
  validateClubId,
  validateDeviceId,
} from "./kiosk-auth.js";

type ManageAction = "register" | "revoke" | "activate";

/**
 * Club-admin: register, revoke, or re-activate a Fully Kiosk tablet for a club.
 */
export const manageAuthorizedKiosk = onCall({ enforceAppCheck: true }, async (request) => {
  assertAuthenticated(request.auth);

  let clubId: string;
  let deviceId: string;
  try {
    clubId = validateClubId(request.data?.clubId);
    deviceId = validateDeviceId(request.data?.deviceId);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "invalid_input";
    throw detailedHttpsError("invalid-argument", "Invalid clubId or deviceId.", {
      stage: "validate_input",
      cause: reason,
    });
  }

  const action = request.data?.action as ManageAction | undefined;
  if (action !== "register" && action !== "revoke" && action !== "activate") {
    throw detailedHttpsError("invalid-argument", "action must be register, revoke, or activate.", {
      stage: "validate_input",
      cause: "invalid_action",
    });
  }

  assertCallerRole("club-admin", request.auth, clubId);

  const labelRaw = request.data?.label;
  const label =
    typeof labelRaw === "string" && labelRaw.trim().length > 0
      ? labelRaw.trim().slice(0, MAX_LABEL_LENGTH)
      : undefined;

  const callerUid = request.auth.uid;
  const authUid = kioskUid(deviceId);
  const now = new Date().toISOString();
  const db = getFirestore();
  const auth = getAuth();
  const ref = db.doc(kioskDocPath(clubId, deviceId));

  if (action === "revoke") {
    const existing = await ref.get();
    if (!existing.exists) {
      throw detailedHttpsError("not-found", "Kiosk device not found.", {
        stage: "revoke",
        cause: "not_registered",
        clubId,
      });
    }
    const prev = existing.data() as AuthorizedKiosk;
    const updated: AuthorizedKiosk = {
      ...prev,
      status: "revoked",
      updatedAt: now,
      updatedBy: callerUid,
    };
    await ref.set(updated, { merge: true });
    try {
      await auth.updateUser(authUid, { disabled: true });
      await auth.setCustomUserClaims(authUid, { kiosk: true, deviceId });
    } catch (error: unknown) {
      console.warn("manageAuthorizedKiosk revoke: auth update skipped", error);
    }
    return { kiosk: updated };
  }

  // register or activate
  await ensureKioskAuthUser(auth, authUid, label ?? `Kiosk ${deviceId.slice(0, 8)}`);
  await auth.updateUser(authUid, {
    disabled: false,
    ...(label ? { displayName: label } : {}),
  });
  await auth.setCustomUserClaims(authUid, kioskClaims(clubId, deviceId));

  const existing = await ref.get();
  const prev = existing.exists ? (existing.data() as AuthorizedKiosk) : undefined;
  const record: AuthorizedKiosk = {
    deviceId,
    authUid,
    status: "active",
    label: label ?? prev?.label,
    createdAt: prev?.createdAt ?? now,
    createdBy: prev?.createdBy ?? callerUid,
    updatedAt: now,
    updatedBy: callerUid,
  };
  await ref.set(record, { merge: true });
  return { kiosk: record };
});
