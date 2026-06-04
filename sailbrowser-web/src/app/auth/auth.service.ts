import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth, authState, signOut } from '@angular/fire/auth';
import { ClubTenant } from 'app/club-tenant';
import { from, map, merge, of, Subject, switchMap } from 'rxjs';

export const USER_ROLES = ['sys-admin', 'club-admin', 'race-officer', 'user'] as const;
export type Role = typeof USER_ROLES[number];

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  auth = inject(Auth);
  clubId = inject(ClubTenant).clubId;

  private user$ = authState(this.auth).pipe(
    map(val => val === null ? undefined : val)
  );

  user = toSignal(this.user$);

  private readonly refreshIdToken$ = new Subject<void>();

  private idTokenResult$ = merge(
    authState(this.auth),
    this.refreshIdToken$.pipe(map(() => this.auth.currentUser)),
  ).pipe(switchMap(user => (user ? from(user.getIdTokenResult()) : of(undefined))));

  idTokenResult = toSignal(this.idTokenResult$);

  loggedIn = computed<boolean>(() => this.user() !== undefined);

  isSysAdmin = computed<boolean>(() => this.idTokenResult()?.claims['sysAdmin'] === true);

  /** JWT claims excluding standard Firebase metadata fields. */
  readonly customClaims = computed<ReadonlyArray<{ key: string; value: string }>>(() => {
    const claims = this.idTokenResult()?.claims;
    if (!claims) return [];
    const skip = new Set([
      'aud',
      'auth_time',
      'exp',
      'iat',
      'iss',
      'sub',
      'firebase',
      'email',
      'email_verified',
    ]);
    return Object.entries(claims)
      .filter(([key]) => !skip.has(key))
      .map(([key, value]) => ({ key, value: formatClaimValue(value) }));
  });

  isClubAdmin = computed<boolean>(() => {
    if (this.isSysAdmin()) return true;
    const clubs = this.idTokenResult()?.claims['clubs'] as Record<string, string> | undefined;
    return clubs?.[this.clubId] === 'club-admin';
  });

  isRaceOfficer = computed<boolean>(() => {
    if (this.isClubAdmin()) return true;
    const clubs = this.idTokenResult()?.claims['clubs'] as Record<string, string> | undefined;
    return clubs?.[this.clubId] === 'race-officer';
  });

  /** Human-readable role for the current club from ID token claims. */
  readonly clubRoleLabel = computed(() => {
    if (this.isSysAdmin()) return 'System admin';
    const clubs = this.idTokenResult()?.claims['clubs'] as Record<string, string> | undefined;
    const role = clubs?.[this.clubId];
    if (role === 'club-admin') return 'Club admin';
    if (role === 'race-officer') return 'Race officer';
    return 'User';
  });

  async signOut(): Promise<void> {
    return signOut(this.auth);
  }

  /** Refreshes the ID token so custom claims reflect recent server updates. */
  async refreshIdToken(): Promise<void> {
    const user = this.auth.currentUser;
    if (user) {
      await user.getIdToken(true);
      this.refreshIdToken$.next();
    }
  }
}

function formatClaimValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
