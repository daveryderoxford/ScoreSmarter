import { inject, Injectable } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import type { Handicap } from 'app/scoring/model/handicap';
import { cloudCallable } from 'app/shared/firebase/cloud-functions';
import type { BoatClass, ClassKind } from '../model/boat-class';
import { ClubStore } from './club-store';

export interface AddClassRequest {
  kind: ClassKind;
  /** RYA Class ID, for an RYA class. */
  catalogueId?: number;
  /** Name, for a local class. */
  name?: string;
  /** For a local class; an RYA class takes it from the RYA list. */
  isSinglehander?: boolean;
  /** For an RYA class, a PY here is an override of the RYA PN. */
  handicaps: Handicap[];
}

/** Adds classes to the club list through the `addClubClass` callable (race officers and above). */
@Injectable({ providedIn: 'root' })
export class ClubClassService {
  private readonly app = inject(FirebaseApp);
  private readonly clubStore = inject(ClubStore);

  /** The added class. Rejects with the callable's message, e.g. when the class already exists. */
  async add(request: AddClassRequest): Promise<BoatClass> {
    const addClubClass = await cloudCallable<AddClassRequest & { clubId: string }, BoatClass>(
      'addClubClass',
      undefined,
      this.app,
    );
    const result = await addClubClass({ ...request, clubId: this.clubStore.club().id });
    return result.data;
  }
}
