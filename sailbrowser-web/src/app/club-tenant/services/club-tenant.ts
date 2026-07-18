import { Injectable, inject } from '@angular/core';
import { KioskAuthService } from 'app/auth/services/kiosk-auth.service';
import { ClubStore } from './club-store';

@Injectable({ 
  providedIn: 'root' 
})
export class ClubTenant {
  private _clubId = '';

  get clubId() { return this._clubId; }

  private clubStore = inject(ClubStore);
  private kioskAuth = inject(KioskAuthService);

  /** Called when the application initialises to extract and validate the clubId from the subdomain. */
  async initialize(): Promise<void> {
    console.log('ClubContextService: Initializing...');

    const host = window.location.hostname;
    console.log('ClubContextService: Hostname is', host);

    // If running in AI Studio or localhost, use the 'test' database
    const isTrustedTestDomain = 
      host.includes('aistudio.google.com') || 
      host.endsWith('.run.app') || 
      host.endsWith('.googleusercontent.com') ||
      host === 'localhost' || 
      host === '127.0.0.1';

    if (isTrustedTestDomain) {
      console.log('ClubContextService: Trusted test domain detected. Using "test" club ID.');
      this._clubId = 'test';
    } else {
      // Resolve ClubId from subdomain for production domains
      this._clubId = host.split('.')[0];
    
      console.log('ClubContextService: Resolved club ID from subdomain:', this._clubId);
    }

    // Read club data and verify that the clubid corresponds
    // If read fails redirect to home site
    try {
      const club = await this.clubStore.initialize(this._clubId);

      // Check if club is null OR if the ID doesn't match
      if (!club || club.id !== this._clubId) {
        throw new Error(`Club mismatch or not found: Expected ${this._clubId}`);
      }

      // Fully Kiosk: exchange hardware ID for a custom token (no-op elsewhere).
      // Runs after Auth persistence restore (inside ensureSignedIn) so a human
      // popup/password session is not replaced.
      await this.kioskAuth.ensureSignedIn(this._clubId);

    } catch (e: unknown) { 

      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error('ClubTenant: Redirecting to club list page as URL does not start with a valid club sub-domain', {
        message: errorMessage,
        originalError: e,
        clubId: this._clubId
      });
      if (isTrustedTestDomain) {
        console.warn(
          'ClubTenant: Club init failed on dev/trusted host; not redirecting offsite. Check Firestore rules and clubs/',
          this._clubId,
        );
        return;
      }
      window.location.href = 'https://scoresmarter.app/clubs';
    }
  }
}
