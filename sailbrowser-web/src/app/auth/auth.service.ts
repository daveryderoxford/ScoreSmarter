import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth, authState, signOut, idToken } from '@angular/fire/auth';
import { map, of, switchMap, from } from 'rxjs';
import { ClubStore } from 'app/club-tenant';

@Injectable({
   providedIn: 'root'
})
export class AuthService {
   auth = inject(Auth);
   private clubStore = inject(ClubStore);

   private user$ = authState(this.auth).pipe(
      map(val => val === null ? undefined : val)
   );
   
   user = toSignal(this.user$);

   private idTokenResult$ = authState(this.auth).pipe(
      switchMap(user => user ? from(user.getIdTokenResult()) : of(undefined))
   );
   idTokenResult = toSignal(this.idTokenResult$);

   loggedIn = computed<boolean>( () => this.user() !== undefined );

   isSysAdmin = computed<boolean>(() => {
      return this.idTokenResult()?.claims['sysAdmin'] === true;
   });

   isClubAdmin = computed <boolean>( () => {
      if (this.isSysAdmin()) return true;
      const clubId = this.clubStore.clubId();
      if (!clubId) return false;
      const clubs = this.idTokenResult()?.claims['clubs'] as Record<string, string> | undefined;
      return clubs?.[clubId] === 'club-admin';
   });

   isRaceOfficer = computed<boolean>(() => {
      if (this.isClubAdmin()) return true;
      const clubId = this.clubStore.clubId();
      if (!clubId) return false;
      const clubs = this.idTokenResult()?.claims['clubs'] as Record<string, string> | undefined;
      return clubs?.[clubId] === 'race-officer';
   });
   
   async signOut(): Promise<void> {
      return signOut(this.auth);
   }
}
