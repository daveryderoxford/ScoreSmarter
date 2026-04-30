import { randomUUID } from "crypto";
import { onCall } from "firebase-functions/v2/https";
import { httpsWithDetails, logScan, logScanError } from "../ai-scan-types.js";
import {
  appendResultsSheetImageRecord,
  storeResultsSheetImage,
  updateRaceResultsSheetImagePath,
} from "./image-storage.js";

interface UploadResultsSheetImageRequest {
  imageBase64: string;
  imageMimeType?: string;
  clubId: string;
  raceId: string;
}

function validateUploadRequest(data: unknown, requestId: string): Required<UploadResultsSheetImageRequest> {
  const requestData = data as UploadResultsSheetImageRequest;
  const {
    imageBase64,
    imageMimeType = "image/jpeg",
    clubId,
    raceId,
  } = requestData;

  if (!imageBase64 || typeof imageBase64 !== "string") {
    throw httpsWithDetails("invalid-argument", "Missing image base64 data.", {
      requestId,
      stage: "validate_input",
      cause: "missing_image",
    });
  }
  if (!clubId || typeof clubId !== "string") {
    throw httpsWithDetails("invalid-argument", "Missing clubId.", {
      requestId,
      stage: "validate_input",
      cause: "missing_club_id",
    });
  }
  if (!raceId || typeof raceId !== "string") {
    throw httpsWithDetails("invalid-argument", "Missing raceId.", {
      requestId,
      stage: "validate_input",
      cause: "missing_race_id",
    });
  }

  return {
    imageBase64,
    imageMimeType,
    clubId,
    raceId,
  };
}

export const uploadResultsSheetImage = onCall({
  memory: "512MiB",
  timeoutSeconds: 120,
}, async (request) => {
  const requestId = randomUUID();
  if (!request.auth) {
    logScanError(requestId, "validate_input", "Unauthenticated upload call");
    throw httpsWithDetails("unauthenticated", "Only authenticated users can upload results sheets.", {
      requestId,
      stage: "validate_input",
      cause: "no_auth",
    });
  }

  const { imageBase64, imageMimeType, clubId, raceId } = validateUploadRequest(request.data, requestId);
  logScan(requestId, "save_image", "uploadResultsSheetImage invoked", {
    uid: request.auth.uid,
    clubId,
    raceId,
    imageMimeType,
    imageBase64Length: imageBase64.length,
  });

  let imageBuffer: Buffer;
  try {
    imageBuffer = Buffer.from(imageBase64, "base64");
  } catch {
    throw httpsWithDetails("invalid-argument", "imageBase64 is not valid base64.", {
      requestId,
      stage: "validate_input",
      cause: "invalid_base64",
    });
  }

  const image = await storeResultsSheetImage(
    clubId,
    raceId,
    imageBuffer,
    imageMimeType,
    requestId,
  );

  await updateRaceResultsSheetImagePath(clubId, raceId, image.storagePath, requestId);
  await appendResultsSheetImageRecord(clubId, raceId, image, "uploaded", requestId);

  return {
    ...image,
  };
});

