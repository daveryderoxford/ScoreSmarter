import { getStorage } from "firebase-admin/storage";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { logScan } from "../ai-scan-types.js";

export interface StoredResultsSheetImage {
  storagePath: string;
  gsUri: string;
}

export type StoredResultsSheetImageStatus = "uploaded" | "scanned";

export interface StoredResultsSheetImageRecord extends StoredResultsSheetImage {
  status: StoredResultsSheetImageStatus;
  createdAt: Timestamp;
}

export async function storeResultsSheetImage(
  clubId: string,
  raceId: string,
  imageBuffer: Buffer,
  imageMimeType: string,
  requestId: string,
): Promise<StoredResultsSheetImage> {
  const storagePath = resultsSheetStoragePath(clubId, raceId);
  const storage = getStorage();
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
  const db = getFirestore();
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

export async function appendResultsSheetImageRecord(
  clubId: string,
  raceId: string,
  image: StoredResultsSheetImage,
  status: StoredResultsSheetImageStatus,
  requestId: string,
): Promise<void> {
  const scanDocPath = resultsSheetScanDocPath(clubId, raceId);
  const record: StoredResultsSheetImageRecord = {
    ...image,
    status,
    createdAt: Timestamp.now(),
  };
  logScan(requestId, "update_race_doc", "Updating latest stored image set", {
    scanDocPath,
    raceId,
    storagePath: image.storagePath,
    status,
  });
  await getFirestore().doc(scanDocPath).set(
    {
      raceId,
      updatedAt: FieldValue.serverTimestamp(),
      images: [record],
    },
    { merge: true },
  );
}

export function resultsSheetStoragePath(clubId: string, raceId: string): string {
  return `clubs/${clubId}/results-sheets/${raceId}/${Date.now()}-${randomUUID()}.jpg`;
}

export function raceCalendarDocPath(clubId: string, raceId: string): string {
  return `clubs/${clubId}/calendar/${raceId}`;
}

export function resultsSheetScanDocPath(clubId: string, raceId: string): string {
  return `clubs/${clubId}/results-sheet-scans/${raceId}`;
}