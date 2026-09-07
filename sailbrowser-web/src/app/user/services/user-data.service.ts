import { Injectable, computed, effect, inject } from "@angular/core";
import { rxResource } from '@angular/core/rxjs-interop';
import { User } from "@angular/fire/auth";
import { DocumentReference, arrayRemove, arrayUnion, doc, docData, setDoc } from "@angular/fire/firestore";
import { AuthService } from 'app/auth';
import type { Boat } from 'app/boats';
import { ClubTenant, FirestoreTenantService } from 'app/club-tenant';
import { cloudCallable } from 'app/shared/firebase/cloud-functions';
import { of } from 'rxjs';
import { UserData } from '../model/user';
import { pushRecentBoat } from './recent-boats';

@Injectable({
  providedIn: "root"
})
export class UserDataService {
  private as = inject(AuthService);
  private tenant = inject(FirestoreTenantService);
  private clubId = inject(ClubTenant).clubId;

  private userCollection = this.tenant.collectionRef<UserData>('users');
  
  private _userResource = rxResource<UserData | undefined, User| undefined>({
    params: () => this.as.user(),
    stream: request => request.params ? docData(this._doc(request.params.uid)) : of(undefined)
  });

  readonly user = this._userResource.value.asReadonly();

  id = computed( () => this.user()?.id);

  constructor() {
    /** Ensure user data exists on login */
    effect( async () => {
      if (this.as.loggedIn()) {
        try  {
          const ensureUserData = await cloudCallable<
            { clubId: string },
            { user: UserData; id: string; isNew: boolean }
          >('ensureUserData');
          const result = await ensureUserData({ clubId: this.clubId });

          console.log('UserDataService: User data returned for ' + result.data.id);
        } catch (error) {
          console.error('UserDataService:  Error creating user data ', error);
        }
      }
    });
  }


  /** Update the user info. */
  async updateDetails(details: Partial<UserData>): Promise<void> {

    const id = this.id();

    if (!id) {
      console.error('UserDataService: Saving user: Unexpectedly null');
      throw new Error('UserDataService: Saving user: Unexpectedly null');
    }

    console.log('UserDataService: Saving user ' + this);
    details.id = id;
    // Use setDoc with merge=true rather than update as update does not support withConverter
    await setDoc(this._doc(id), details, { merge: true });
  }

  private _doc(uid: string): DocumentReference<UserData> {
    return doc(this.userCollection, uid)
  }

  /**
   * Records a boat in the user's recent entry boats (MRU list up to 5 boats).
   */
  async recordRecentBoat(boat: Boat): Promise<void> {
    const userId = this.id();
    if (!userId) {
      console.warn('UserDataService: Cannot record recent boat without user id');
      return;
    }
    const current = this.user()?.boats ?? [];
    const updated = pushRecentBoat(current, boat, 5);
    await setDoc(this._doc(userId), { boats: updated }, { merge: true });
  }

  // Same rationale as `updateDetails` above: prefer `setDoc({ merge: true })`
  // over `updateDoc` so the typed converter is invoked.
  async addBoat(boat: Boat) {
    await setDoc(this._doc(this.id()!), { boats: arrayUnion(boat) }, { merge: true });
  }

  async removeBoat(boat: Boat) {
    // NOTE: the previous implementation wrote to a non-existent `classes`
    // field. `updateDoc` masked the typo (no converter, no field-name
    // validation); the typed `setDoc({ merge: true })` path surfaced it. The
    // method is unused at the call sites today but is corrected so it would
    // actually work if wired up.
    await setDoc(this._doc(this.id()!), { boats: arrayRemove(boat) }, { merge: true });
  }
}
