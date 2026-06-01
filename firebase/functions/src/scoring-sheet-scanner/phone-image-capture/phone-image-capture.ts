import { randomBytes, randomUUID, createHash } from "crypto";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { logScan } from "../ai-scan-model.js";
import {
  storeResultsSheetImage,
  updateRaceResultsSheetImagePath,
} from "../image-upload/image-storage.js";
import { detailedHttpsError } from "../../shared/https-error.js";
import { assertAuthenticated, assertCallerRole } from "../../shared/authorisation.js";

const CAPTURE_SESSION_TTL_MS = 10 * 60 * 1000;

interface PhoneImageCaptureRequestData {
  clubId: string;
  raceId: string;
}

interface UploadImageFromPhoneData {
  clubId: string;
  sessionId: string;
  token: string;
  imageBase64: string;
  imageMimeType?: string;
}

function sessionDocPath(clubId: string, sessionId: string): string {
  return `clubs/${clubId}/results-sheet-capture-sessions/${sessionId}`;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function validateCreateRequest(data: unknown, requestId: string): PhoneImageCaptureRequestData {
  const req = data as PhoneImageCaptureRequestData;
  if (!req?.clubId || typeof req.clubId !== "string") {
    throw detailedHttpsError("invalid-argument", "Missing clubId.", {
      requestId, stage: "validate_input", cause: "missing_club_id",
    });
  }
  if (!req?.raceId || typeof req.raceId !== "string") {
    throw detailedHttpsError("invalid-argument", "Missing raceId.", {
      requestId, stage: "validate_input", cause: "missing_race_id",
    });
  }
  return req;
}

function validateUploadRequest(data: unknown, requestId: string): Required<UploadImageFromPhoneData> {
  const req = data as UploadImageFromPhoneData;
  if (!req?.sessionId || typeof req.sessionId !== "string") {
    throw detailedHttpsError("invalid-argument", "Missing sessionId.", {
      requestId, stage: "validate_input", cause: "missing_session_id",
    });
  }
  if (!req?.clubId || typeof req.clubId !== "string") {
    throw detailedHttpsError("invalid-argument", "Missing clubId.", {
      requestId, stage: "validate_input", cause: "missing_club_id",
    });
  }
  if (!req?.token || typeof req.token !== "string") {
    throw detailedHttpsError("invalid-argument", "Missing token.", {
      requestId, stage: "validate_input", cause: "missing_session_token",
    });
  }
  if (!req?.imageBase64 || typeof req.imageBase64 !== "string") {
    throw detailedHttpsError("invalid-argument", "Missing image base64 data.", {
      requestId, stage: "validate_input", cause: "missing_image",
    });
  }
  return {
    clubId: req.clubId,
    sessionId: req.sessionId,
    token: req.token,
    imageBase64: req.imageBase64,
    imageMimeType: req.imageMimeType ?? "image/jpeg",
  };
}

export const createPhoneUploadRequest = onCall({
  memory: "256MiB",
  timeoutSeconds: 60,
}, async (request) => {
  const requestId = randomUUID();

  assertAuthenticated(request.auth, { requestId });

  const { clubId, raceId } = validateCreateRequest(request.data, requestId);
  
  assertCallerRole("race-officer", request.auth, clubId);

  const sessionId = randomBytes(8).toString("base64url");
  const token = randomBytes(12).toString("base64url");
  const expiresAt = new Date(Date.now() + CAPTURE_SESSION_TTL_MS);
  const docPath = sessionDocPath(clubId, sessionId);

  await getFirestore().doc(docPath).set({
    clubId,
    raceId,
    createdByUid: request.auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    status: "pending",
    tokenHash: tokenHash(token),
  });

  logScan(requestId, "update_race_doc", "Created capture session", {
    clubId, raceId, sessionId, expiresAt: expiresAt.toISOString(),
  });

  return {
    sessionId,
    token,
    clubId,
    raceId,
    expiresAt: expiresAt.toISOString(),
  };
});

export const uploadImageFromPhone = onCall({
  memory: "512MiB",
  timeoutSeconds: 120,
}, async (request) => {
  const requestId = randomUUID();
  const { clubId, sessionId, token, imageBase64, imageMimeType } = validateUploadRequest(request.data, requestId);
  const db = getFirestore();
  const sessionSnap = await db.doc(sessionDocPath(clubId, sessionId)).get();
  if (!sessionSnap.exists) {
    throw detailedHttpsError("not-found", "Capture session not found.", {
      requestId, stage: "validate_input", cause: "session_not_found", sessionId, clubId,
    });
  }
  const data = sessionSnap.data() as Record<string, unknown>;
  const sessionClubId = String(data["clubId"] ?? "");
  const raceId = String(data["raceId"] ?? "");
  const expectedHash = String(data["tokenHash"] ?? "");
  const expiresAt = data["expiresAt"] as Timestamp | undefined;

  if (!sessionClubId || !raceId || !expectedHash || !expiresAt) {
    throw detailedHttpsError("failed-precondition", "Capture session is invalid.", {
      requestId, stage: "validate_input", cause: "session_malformed", sessionId,
    });
  }
  if (sessionClubId !== clubId) {
    throw detailedHttpsError("permission-denied", "Capture session club mismatch.", {
      requestId, stage: "validate_input", cause: "session_club_mismatch", sessionId, clubId,
    });
  }
  if (tokenHash(token) !== expectedHash) {
    throw detailedHttpsError("permission-denied", "Invalid capture token.", {
      requestId, stage: "validate_input", cause: "invalid_session_token", sessionId,
    });
  }
  if (expiresAt.toDate().getTime() < Date.now()) {
    await sessionSnap.ref.set({ status: "expired", expiredAt: FieldValue.serverTimestamp() }, { merge: true });
    throw detailedHttpsError("failed-precondition", "Capture session has expired.", {
      requestId, stage: "validate_input", cause: "session_expired", sessionId,
    });
  }

  let imageBuffer: Buffer;
  try {
    imageBuffer = Buffer.from(imageBase64, "base64");
  } catch {
    throw detailedHttpsError("invalid-argument", "imageBase64 is not valid base64.", {
      requestId, stage: "validate_input", cause: "invalid_base64",
    });
  }

  const image = await storeResultsSheetImage(clubId, raceId, imageBuffer, imageMimeType, requestId);
  await updateRaceResultsSheetImagePath(clubId, raceId, image.storagePath, requestId);
  await sessionSnap.ref.set({
    status: "uploaded",
    uploadedAt: FieldValue.serverTimestamp(),
    storagePath: image.storagePath,
    gsUri: image.gsUri,
  }, { merge: true });

  return {
    sessionId,
    clubId,
    raceId,
    storagePath: image.storagePath,
    gsUri: image.gsUri,
    status: "uploaded",
  };
});

