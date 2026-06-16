import { randomUUID } from "crypto";
import { onCall } from "firebase-functions/v2/https";
import { logScan } from "../ai-scan-model.js";
import { detailedHttpsError } from "../../shared/https-error.js";
import {
  storeResultsSheetImage,
  updateRaceResultsSheetImagePath,
} from "./image-storage.js";
import { assertAuthenticated, assertCallerRole } from "../../shared/authorisation.js";

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
    throw detailedHttpsError("invalid-argument", "Missing image base64 data.", {
      requestId,
      stage: "validate_input",
      cause: "missing_image",
    });
  }
  if (!clubId || typeof clubId !== "string") {
    throw detailedHttpsError("invalid-argument", "Missing clubId.", {
      requestId,
      stage: "validate_input",
      cause: "missing_club_id",
    });
  }
  if (!raceId || typeof raceId !== "string") {
    throw detailedHttpsError("invalid-argument", "Missing raceId.", {
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
  assertAuthenticated(request.auth, { requestId });

  const { imageBase64, imageMimeType, clubId, raceId } = validateUploadRequest(request.data, requestId);
  assertCallerRole("race-officer", request.auth, clubId);
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
    throw detailedHttpsError("invalid-argument", "imageBase64 is not valid base64.", {
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

  return {
    ...image,
  };
});
