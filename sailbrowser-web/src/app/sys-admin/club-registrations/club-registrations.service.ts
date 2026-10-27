import { Injectable, inject } from '@angular/core';
import { collection, collectionData, doc, Firestore, limit, orderBy, query, serverTimestamp, updateDoc } from '@angular/fire/firestore';
import { cloudCallable } from 'app/shared/firebase/cloud-functions';
import { dataObjectConverter } from 'app/shared/firebase/firestore-helper';
import { firestoreListenerResource } from 'app/shared/firebase/firestore-listener-resource';
import { firestoreWrite } from 'app/shared/utils/with-timeout';

/** Collection written by the home site's registration form (see firestore.rules). */
const CLUB_REGISTRATIONS = 'club-registrations';

export type RegistrationStatus = 'new' | 'approved' | 'rejected';

export interface ClubRegistration {
  id: string;
  clubName: string;
  subdomain: string;
  contactName: string;
  contactEmail: string;
  status: RegistrationStatus;
  createdAt?: Date;
  notes?: string;
  clubId?: string;
  approvedAt?: Date;
  adminClaimedBy?: string;
  adminClaimedAt?: Date;
  emailsSent?: { received?: boolean; notified?: boolean; approved?: boolean };
}

export interface ApproveResult {
  clubId: string;
  clubUrl: string;
  emailSent: boolean;
}

/** Club registrations for the sys-admin page; provide on that page so the listener stops when it closes. */
@Injectable()
export class ClubRegistrationsService {
  private readonly firestore = inject(Firestore);

  private readonly resource = firestoreListenerResource({
    name: 'club-registrations',
    stream: () => collectionData(query(
      collection(this.firestore, CLUB_REGISTRATIONS).withConverter(dataObjectConverter<ClubRegistration>()),
      orderBy('createdAt', 'desc'),
      limit(100),
    )),
    defaultValue: [] as ClubRegistration[],
  });

  readonly registrations = this.resource.value.asReadonly();
  readonly isLoading = this.resource.isLoading;
  readonly error = this.resource.error;

  /** Creates the club; the contact becomes club admin when they sign in with their email. */
  async approve(registrationId: string, clubId: string, clubName: string): Promise<ApproveResult> {
    const approve = await cloudCallable<{ registrationId: string; clubId: string; clubName: string }, ApproveResult>(
      'approveClubRegistration',
    );
    const result = await approve({ registrationId, clubId, clubName });
    return result.data;
  }

  /** Rejects a request, or reopens a rejected one. */
  async setStatus(registrationId: string, status: 'new' | 'rejected'): Promise<void> {
    await firestoreWrite(
      updateDoc(doc(this.firestore, CLUB_REGISTRATIONS, registrationId), { status, updatedAt: serverTimestamp() }),
      'Updating registration',
    );
  }
}
