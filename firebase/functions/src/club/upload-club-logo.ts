import { randomUUID } from "crypto";
import { onCall } from "firebase-functions/v2/https";
import { detailedHttpsError } from "../shared/https-error.js";
import { storeClubLogo, updateClubLogoPath } from "./club-logo-storage.js";
import { assertAuthenticated, assertCallerRole } from "../shared/authorisation.js";

interface UploadClubLogoRequest {
  imageBase64: string;
  imageMimeType?: string;
  clubId: string;
}

function validateUploadRequest(data: unknown, requestId: string): Required<UploadClubLogoRequest> {
  const requestData = data as UploadClubLogoRequest;
  const { imageBase64, imageMimeType = "image/jpeg", clubId } = requestData;

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

  return { imageBase64, imageMimeType, clubId };
}

export const uploadClubLogo = onCall({
  memory: "256MiB",
  timeoutSeconds: 60,
}, async (request) => {
  const requestId = randomUUID();
  assertAuthenticated(request.auth, { requestId });

  const { imageBase64, imageMimeType, clubId } = validateUploadRequest(request.data, requestId);
  assertCallerRole("club-admin", request.auth, clubId);

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

  const image = await storeClubLogo(clubId, imageBuffer, imageMimeType);
  await updateClubLogoPath(clubId, image.storagePath);

  return image;
});
