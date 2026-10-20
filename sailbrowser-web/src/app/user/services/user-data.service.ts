import { Injectable, computed, effect, inject } from "@angular/core";
import { rxResource } from '@angular/core/rxjs-interop';
import { User } from "@angular/fire/auth";
import { DocumentReference, arrayRemove, arrayUnion, doc, docData, setDoc } from "@angular/fire/firestore";
import { AuthService } from 'app/auth';
import type { Boat } from 'app/boats';
import { ClubTenant, FirestoreTenantService } from 'app/club-tenant';
import { cloudCallable } from 'app/shared/firebase/cloud-functions';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';
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
          await this.ensureUserData();
        } catch (error) {
          console.error('UserDataService:  Error creating user data ', error);
        }
      }
    });
  }

  /**
   * Creates the club user record if missing. Names, when given, are stored on a new
   * record or fill in a record whose names are still blank; existing names are kept.
   */
  async ensureUserData(names?: { firstname: string; surname: string }): Promise<void> {
    const ensureUserData = await cloudCallable<
      { clubId: string; firstname?: string; surname?: string },
      { user: UserData; id: string; isNew: boolean }
    >('ensureUserData');
    const result = await ensureUserData({ clubId: this.clubId, ...names });
    console.log('UserDataService: User data returned for ' + result.data.id);
  }


  /** Update the user info. */
  async updateDetails(details: Partial<UserData>): Promise<void> {

    const id = this.id();

    if (!id) {
      console.error('UserDataService: Saving user: Unexpectedly null');
      throw new Error('UserDataService: Saving user: Unexpectedly null');
    }

    console.log('UserDataService: Saving user ' + this);
    const update: Partial<UserData> = { ...details, id };
    if (typeof update.firstname === 'string') update.firstname = normaliseWhitespace(update.firstname);
    if (typeof update.surname === 'string') update.surname = normaliseWhitespace(update.surname);
    // Use setDoc with merge=true rather than update as update does not support withConverter
    await setDoc(this._doc(id), update, { merge: true });
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
