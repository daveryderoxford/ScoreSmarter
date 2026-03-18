import { Injectable, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { collection, collectionData, Firestore } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { AuthService } from 'app/auth/auth.service';
import { of, catchError } from 'rxjs';
import { UserData } from '../../user/model/user';
import { FirestoreTenantService, ClubStore } from 'app/club-tenant';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { dataObjectConverter } from 'app/shared/firebase/firestore-helper';
import { handleFirestoreError, OperationType } from 'app/shared/firebase/firestore-error-handler';

@Injectable({
   providedIn: 'root'
})
export class UserAdminService {
   private as = inject(AuthService);
   private auth = inject(Auth);
   private readonly tenant = inject(FirestoreTenantService);
   private readonly clubStore = inject(ClubStore);
   private readonly functions = inject(Functions);
   private readonly firestore = inject(Firestore);

   private _load = signal(false);
   private _global = signal(false);

   private _usersResource = rxResource<UserData[], { load: boolean, global: boolean }>({
      params: () => ({ load: this._load(), global: this._global() }),
      stream: (params: any) => {
         const { load, global } = params;
         if (!load) return of([]);
         const col = global 
            ? collection(this.firestore, 'users').withConverter(dataObjectConverter<UserData>())
            : this.tenant.collectionRef<UserData>('users');
         
         return collectionData(col).pipe(
            catchError(err => handleFirestoreError(this.auth, err, OperationType.LIST, global ? 'users' : 'club-users'))
         );
      }
   });

   /** Triggers the loading of users for current club. */
   load(): void {
      this._global.set(false);
      this._load.set(true);
   }

   /** Triggers the loading of all users globally. */
   loadGlobal(): void {
      this._global.set(true);
      this._load.set(true);
   }

   async assignRole(targetUid: string, role: string): Promise<void> {
      const clubId = this.clubStore.club().id;
      const assignRoleFn = httpsCallable(this.functions, 'assignRole');
      await assignRoleFn({ targetUid, clubId, role });
   }

   /** Signal that emits the array of all users. */
   readonly users = this._usersResource.value.asReadonly();
   readonly loading = this._usersResource.isLoading;
   readonly error = this._usersResource.error;
   readonly status = this._usersResource.status;
   readonly isGlobal = this._global.asReadonly();
}