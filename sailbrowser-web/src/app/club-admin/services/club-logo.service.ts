import { Injectable, inject } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, getStorage, ref as storageRef } from 'firebase/storage';
import { environment } from '../../../environments/environment';

const UPLOAD_CLUB_LOGO_CALLABLE_TIMEOUT_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class ClubLogoService {
  private readonly app = inject(FirebaseApp);

  async resolveDownloadUrl(path: string | null | undefined): Promise<string | null> {
    const trimmed = path?.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return await getDownloadURL(storageRef(getStorage(this.app), trimmed));
  }

  async uploadLogo(
    clubId: string,
    base64: string,
    mimeType: string,
  ): Promise<{ storagePath: string }> {
    const functions = getFunctions(this.app, 'europe-west1');
    if (environment.useEmulators) {
      try {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      } catch {
        /* already configured */
      }
    }
    const uploadFn = httpsCallable(functions, 'uploadClubLogo', {
      timeout: UPLOAD_CLUB_LOGO_CALLABLE_TIMEOUT_MS,
    });
    const res = await uploadFn({
      imageBase64: base64,
      imageMimeType: mimeType,
      clubId,
    });
    const storagePath = (res.data as { storagePath?: string } | null)?.storagePath;
    if (!storagePath) {
      throw new Error('Upload succeeded but no storagePath was returned.');
    }
    return { storagePath };
  }
}
