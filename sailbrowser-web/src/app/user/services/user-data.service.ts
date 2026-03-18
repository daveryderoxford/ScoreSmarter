import { Injectable, computed, effect, inject } from "@angular/core";
import { rxResource } from '@angular/core/rxjs-interop';
import { User } from "@angular/fire/auth";
import { DocumentReference, arrayRemove, arrayUnion, doc, docData, setDoc, updateDoc } from "@angular/fire/firestore";
import { AuthService } from 'app/auth';
import type { Boat } from 'app/boats';
import { of } from 'rxjs';
import { UserData } from '../model/user';
import { ClubTenant, FirestoreTenantService } from 'app/club-tenant';
import { httpsCallable } from 'firebase/functions';
import { Functions } from '@angular/fire/functions';

@Injectable({
  providedIn: "root"
})
export class UserDataService {
  private as = inject(AuthService);
  private tenant = inject(FirestoreTenantService);
  private functions = inject(Functions);
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
      const ensureUserData = httpsCallable<{clubId: string}, {user: UserData, id: string, isNew: boolean}>(this.functions, 'ensureUserData');
      if (this.as.loggedIn()) {
        try  {
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

  async addBoat(boat: Boat) {
    await updateDoc(this._doc(this.id()!), { boats: arrayUnion(boat) });
  }

  async removeBoat(boat: Boat) {
    await updateDoc(this._doc(this.id()!), { classes: arrayRemove(boat) });
  }
}
