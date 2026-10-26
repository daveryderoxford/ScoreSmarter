import { signal, type Provider } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { AuthService } from 'app/auth/auth.service';

export interface TestAuthOptions {
  /** Signed-in Firebase uid; signed out by default so written payloads have no `enteredByUid`. */
  uid?: string;
  /** Default true: the result-entry services were written for race officers. */
  raceOfficer?: boolean;
}

/**
 * Stand-ins for Firebase `Auth` and the app `AuthService` for TestBed, so services that
 * check the signed-in user (EntryService, RaceCompetitorMutator) don't pull in Firebase.
 */
export function provideTestAuth({ uid, raceOfficer = true }: TestAuthOptions = {}): Provider[] {
  return [
    { provide: Auth, useValue: { currentUser: uid ? { uid } : null } },
    {
      provide: AuthService,
      useValue: {
        isRaceOfficer: signal(raceOfficer),
        loggedIn: signal(!!uid),
        user: signal(uid ? { uid } : null),
      },
    },
  ];
}
