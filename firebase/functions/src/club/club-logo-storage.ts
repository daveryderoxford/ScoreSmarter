import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";

export const CLUB_LOGO_FILE_NAME = "club-logo.jpg";

export function clubLogoStoragePath(clubId: string): string {
  return `clubs/${clubId}/${CLUB_LOGO_FILE_NAME}`;
}

export async function storeClubLogo(
  clubId: string,
  imageBuffer: Buffer,
  imageMimeType: string,
): Promise<{ storagePath: string; gsUri: string }> {
  const storagePath = clubLogoStoragePath(clubId);
  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);

  await file.save(imageBuffer, {
    resumable: false,
    metadata: {
      contentType: imageMimeType,
      cacheControl: "public, max-age=3600",
      metadata: { clubId },
    },
  });

  return {
    storagePath,
    gsUri: `gs://${bucket.name}/${storagePath}`,
  };
}

export async function updateClubLogoPath(clubId: string, storagePath: string): Promise<void> {
  await getFirestore().doc(`clubs/${clubId}`).set({ logoUrl: storagePath }, { merge: true });
}
