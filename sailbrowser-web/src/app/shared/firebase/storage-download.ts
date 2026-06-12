import type { FirebaseApp } from '@angular/fire/app';

/** Lazy-loads the Storage SDK and resolves a download URL for an object path. */
export async function resolveStorageDownloadUrl(app: FirebaseApp, path: string): Promise<string> {
  const { getDownloadURL, getStorage, ref } = await import('firebase/storage');
  return getDownloadURL(ref(getStorage(app), path));
}
