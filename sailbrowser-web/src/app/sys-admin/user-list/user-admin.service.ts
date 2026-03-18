import { Injectable, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Auth } from '@angular/fire/auth';
import { Firestore, collectionGroup, collectionSnapshots, query, where } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AuthService } from 'app/auth/auth.service';
import { ClubStore, FirestoreTenantService } from 'app/club-tenant';
import { dataObjectConverter } from 'app/shared/firebase/firestore-helper';
import { map, of } from 'rxjs';
import { UserData } from '../../user/model/user';

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
  private _roleFilter = signal<string | null>(null);

  private _usersResource = rxResource<UserData[], { load: boolean, global: boolean, roleFilter: string | null; }>({
    params: () => ({ load: this._load(), global: this._global(), roleFilter: this._roleFilter() }),
    stream: (request) => {
      const { load, global, roleFilter } = request.params;
      if (!load) return of([]);
      let q: any = global
        ? collectionGroup(this.firestore, 'users').withConverter(dataObjectConverter<UserData>())
        : this.tenant.collectionRef<UserData>('users');

      if (roleFilter) {
        const roles = ['user', 'race-officer', 'club-admin', 'sys-admin'];
        const idx = roles.indexOf(roleFilter);
        if (idx !== -1) {
          q = query(q, where('role', 'in', roles.slice(idx)));
        }
      }

      return collectionSnapshots<UserData>(q).pipe(
        map(snaps => snaps.map(snap => {
          const clubId = snap.ref.parent.parent?.id;
          return { ...snap.data(), id: snap.id, clubId };
        }))
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

  filterRole(role: string | null): void {
    this._roleFilter.set(role);
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
  readonly roleFilter = this._roleFilter.asReadonly();
}