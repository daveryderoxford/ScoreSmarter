import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth, authState, getRedirectResult, signOut, UserCredential } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { ClubTenant } from 'app/club-tenant';
import { from, map, of, switchMap } from 'rxjs';

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

  private idTokenResult$ = authState(this.auth).pipe(
    switchMap(user => user ? from(user.getIdTokenResult()) : of(undefined))
  );
  idTokenResult = toSignal(this.idTokenResult$);

  loggedIn = computed<boolean>(() => this.user() !== undefined);

  isSysAdmin = computed<boolean>(() => {
  //  return this.idTokenResult()?.claims['sysAdmin'] === true;
  return true;
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

  async signOut(): Promise<void> {
    return signOut(this.auth);
  }
}
