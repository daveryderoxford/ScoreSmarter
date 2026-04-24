import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { logScan } from "./types";

const storage = getStorage();
const db = getFirestore();

export interface StoredResultsSheetImage {
  storagePath: string;
  gsUri: string;
}

export function resultsSheetStoragePath(clubId: string, raceId: string): string {
  return `clubs/${clubId}/results-sheets/sheet-${raceId}`;
}

export function raceCalendarDocPath(clubId: string, raceId: string): string {
  return `clubs/${clubId}/calendar/${raceId}`;
}

export async function storeResultsSheetImage(
  clubId: string,
  raceId: string,
  imageBuffer: Buffer,
  imageMimeType: string,
  requestId: string,
): Promise<StoredResultsSheetImage> {
  const storagePath = resultsSheetStoragePath(clubId, raceId);
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);

  logScan(requestId, "save_image", "Saving results sheet image to Cloud Storage", {
    clubId,
    raceId,
    storagePath,
    imageBytes: imageBuffer.length,
    imageMimeType,
  });

  await file.save(imageBuffer, {
    resumable: false,
    metadata: {
      contentType: imageMimeType,
      cacheControl: "no-cache",
      metadata: {
        clubId,
        raceId,
      },
    },
  });

  const gsUri = `gs://${bucket.name}/${storagePath}`;
  logScan(requestId, "save_image", "Saved results sheet image", {
    storagePath,
    gsUri,
  });

  return { storagePath, gsUri };
}

export async function updateRaceResultsSheetImagePath(
  clubId: string,
  raceId: string,
  storagePath: string,
  requestId: string,
): Promise<void> {
  const raceDocPath = raceCalendarDocPath(clubId, raceId);
  logScan(requestId, "update_race_doc", "Updating race with results sheet image path", {
    raceDocPath,
    storagePath,
  });

  await db.doc(raceDocPath).set(
    {
      "resultsSheetImage": storagePath,
    },
    { merge: true },
  );
}
