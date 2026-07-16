import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { detailedHttpsError } from "../shared/https-error.js";
import {
  AuthorizedKiosk,
  kioskClaims,
  kioskDocPath,
  kioskUid,
  validateClubId,
  validateDeviceId,
} from "./kiosk-auth.js";
import { ensureKioskAuthUser } from "./ensure-kiosk-user.js";

/**
 * Unauthenticated: exchange a Fully Kiosk hardware ID for a Firebase custom token.
 * Device must be listed as active under clubs/{clubId}/authorized_kiosks/{deviceId}.
 */
export const exchangeKioskId = onCall(async (request) => {
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

  const deviceIdPrefix = deviceId.slice(0, 8);
  console.log(`exchangeKioskId: club=${clubId} devicePrefix=${deviceIdPrefix}`);

  const db = getFirestore();
  const snap = await db.doc(kioskDocPath(clubId, deviceId)).get();
  if (!snap.exists) {
    throw detailedHttpsError("permission-denied", "Device unauthorized.", {
      stage: "authorize_device",
      cause: "not_registered",
      clubId,
      deviceIdPrefix,
    });
  }

  const data = snap.data() as AuthorizedKiosk;
  if (data.status !== "active") {
    throw detailedHttpsError("permission-denied", "Device unauthorized.", {
      stage: "authorize_device",
      cause: "revoked",
      clubId,
      deviceIdPrefix,
    });
  }

  const authUid = data.authUid || kioskUid(deviceId);
  const auth = getAuth();

  try {
    await ensureKioskAuthUser(auth, authUid, data.label ?? `Kiosk ${deviceIdPrefix}`);
    await auth.updateUser(authUid, { disabled: false });
    await auth.setCustomUserClaims(authUid, kioskClaims(clubId, deviceId));
    const token = await auth.createCustomToken(authUid);
    return { token };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Token mint failed.";
    console.error(`exchangeKioskId failed: club=${clubId} devicePrefix=${deviceIdPrefix}`, message);
    throw detailedHttpsError("internal", "Failed to mint kiosk token.", {
      stage: "mint_token",
      clubId,
      deviceIdPrefix,
    });
  }
});
