import { Injectable, inject, signal } from '@angular/core';
import { Auth, signInWithCustomToken } from '@angular/fire/auth';
import { FirebaseApp } from '@angular/fire/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { environment } from '../../../environments/environment';

export interface KioskAuthFailure {
  deviceId: string;
  reason: string;
}

/**
 * Signs in Fully Kiosk tablets via hardware ID → custom token exchange.
 * No-op on normal browsers so username/password/Google login remain unchanged.
 */
@Injectable({ providedIn: 'root' })
export class KioskAuthService {
  private readonly auth = inject(Auth);
  private readonly app = inject(FirebaseApp);

  readonly lastFailure = signal<KioskAuthFailure | undefined>(undefined);

  isFullyKiosk(): boolean {
    return typeof fully !== 'undefined';
  }

  getDeviceId(): string | undefined {
    if (this.isFullyKiosk()) {
      try {
        const id = fully!.getDeviceId();
        return typeof id === 'string' && id.trim() ? id.trim() : undefined;
      } catch {
        return undefined;
      }
    }
    return this.devDeviceId();
  }

  /**
   * If running on Fully (or emulator dev override) and not already signed in,
   * exchange the hardware ID for a Firebase custom token and sign in.
   * Failures are recorded on {@link lastFailure}; they do not throw.
   *
   * Waits for Auth persistence restore before deciding, so a human session
   * that is about to load from IndexedDB is not replaced by kiosk sign-in.
   */
  async ensureSignedIn(clubId: string): Promise<void> {
    this.lastFailure.set(undefined);

    // authStateReady resolves after IndexedDB/local persistence has restored
    // (or confirmed there is no session). currentUser alone is racy at bootstrap.
    await this.auth.authStateReady();

    if (this.auth.currentUser) {
      return;
    }

    const deviceId = this.getDeviceId();
    if (!deviceId) {
      return;
    }

    if (!this.isFullyKiosk() && !this.devDeviceId()) {
      return;
    }

    try {
      const functions = getFunctions(this.app, 'europe-west1');
      if (environment.useEmulators) {
        try {
          connectFunctionsEmulator(functions, 'localhost', 5001);
        } catch {
          /* already configured */
        }
      }
      const exchange = httpsCallable<{ clubId: string; deviceId: string }, { token: string }>(
        functions,
        'exchangeKioskId',
        { timeout: 30_000 },
      );
      const result = await exchange({ clubId, deviceId });

      // Re-check after the network round-trip in case a session appeared.
      if (this.auth.currentUser) {
        return;
      }

      const token = result.data?.token;
      if (!token) {
        this.lastFailure.set({ deviceId, reason: 'No token returned from server.' });
        return;
      }
      await signInWithCustomToken(this.auth, token);
      console.log('KioskAuthService: signed in via hardware ID.');
    } catch (error: unknown) {
      const reason =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: string }).message)
          : 'Hardware authentication failed.';
      console.error('KioskAuthService: exchange failed', error);
      this.lastFailure.set({ deviceId, reason });
    }
  }

  /** Localhost/emulator-only override via ?kioskDevDeviceId=... */
  private devDeviceId(): string | undefined {
    if (!environment.useEmulators) {
      return undefined;
    }
    try {
      const param = new URLSearchParams(window.location.search).get('kioskDevDeviceId');
      return param?.trim() || undefined;
    } catch {
      return undefined;
    }
  }
}
