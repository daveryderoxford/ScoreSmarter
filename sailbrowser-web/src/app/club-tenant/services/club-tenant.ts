import { Injectable, inject } from '@angular/core';
import { Auth, getRedirectResult } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { ClubStore } from './club-store';

@Injectable({ 
  providedIn: 'root' 
})
export class ClubTenant {
  private _clubId: string = '';

  get clubId() { return this._clubId; }

  private clubStore = inject(ClubStore);
  private auth = inject(Auth);
  private router = inject(Router);

  /** Called when the application initialises to
   * handle the extracting the clubId from the subdomain and
   * valifdating it. 
   * 
   * Runs during bootstrap before routed components exist, so OAuth redirect must be finished here (not in LoginComponent).
   */
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

    // OAuth redirect: complete handoff before anything else. LoginComponent is not created yet,
    // and a later full-page redirect (e.g. club init failure → /clubs) would skip the handoff on localhost.
    try {
      const cred = await getRedirectResult(this.auth);
      if (cred) {
        const returnUrl =
          new URLSearchParams(window.location.search).get('returnUrl') ??
          '/';
        await this.router.navigateByUrl(returnUrl);
      }
    } catch (e: unknown) {
      console.error('ClubTenant: getRedirectResult failed', e);
    }

    // Read club data and verify that the clubid corresponds
    // If read fails redirect to home site
    try {
      const club = await this.clubStore.initialize(this._clubId);

      // Check if club is null OR if the ID doesn't match
      if (!club || club.id !== this._clubId) {
        throw new Error(`Club mismatch or not found: Expected ${this._clubId}`);
      }

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