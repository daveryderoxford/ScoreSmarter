import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FirebaseApp } from '@angular/fire/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, getStorage, ref as storageRef } from 'firebase/storage';
import { ClubStore } from 'app/club-tenant';
import { from, of } from 'rxjs';
import { environment } from '../../../environments/environment';

const UPLOAD_CLUB_LOGO_CALLABLE_TIMEOUT_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class ClubLogoService {
  private readonly app = inject(FirebaseApp);
  private readonly clubStore = inject(ClubStore);

  /** Firebase Storage path — sole input to logo resolution. */
  private readonly logoStoragePath = computed(() => {
    const path = this.clubStore.club().logoUrl?.trim();
    return path || undefined;
  });

  private readonly logoDownloadResource = rxResource<string | null, string | undefined>({
    params: this.logoStoragePath,
    stream: ({ params }) => {
      const trimmed = params?.trim();
      if (!trimmed) {
        return of(null);
      }
      return from(getDownloadURL(storageRef(getStorage(this.app), trimmed)));
    },
    defaultValue: null,
  });

  /** Resolved HTTPS URL for the current club logo, or null. */
  readonly logoDownloadUrl = this.logoDownloadResource.value.asReadonly();

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
