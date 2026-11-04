import { computed, inject, Injectable } from '@angular/core';
import { collectionData, deleteDoc, setDoc } from '@angular/fire/firestore';
import { FirestoreTenantService } from 'app/club-tenant/services/firestore-tenant';
import { generateSecureID } from 'app/shared/firebase/firestore-helper';
import { firestoreListenerResource } from 'app/shared/firebase/firestore-listener-resource';
import { firestoreWrite } from 'app/shared/utils/with-timeout';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';
import { map } from 'rxjs';
import { OpenEvent, sortEvents } from '../model/open-event';

/** Open meetings for the club (a handful a season), read by everyone. */
@Injectable({ providedIn: 'root' })
export class EventStore {
  private readonly tenant = inject(FirestoreTenantService);

  private readonly collection = this.tenant.collectionRef<OpenEvent>('events');
  private readonly ref = (id: string) => this.tenant.docRef<OpenEvent>('events', id);

  private readonly eventsResource = firestoreListenerResource({
    name: 'open-events',
    stream: () => collectionData(this.collection, { idField: 'id' }).pipe(map(events => [...events].sort(sortEvents))),
    defaultValue: [] as OpenEvent[],
  });

  readonly events = this.eventsResource.value.asReadonly();
  readonly loading = this.eventsResource.isLoading;
  readonly error = this.eventsResource.error;

  event(id: () => string) {
    return computed(() => this.events().find(e => e.id === id()));
  }

  async addEvent(event: Omit<OpenEvent, 'id'>): Promise<string> {
    const tidied = tidyEvent(event);
    const id = generateSecureID(1000, `E-${tidied.name}`);
    await firestoreWrite(setDoc(this.ref(id), { ...tidied, id } as OpenEvent), 'Saving event');
    return id;
  }

  async updateEvent(id: string, changes: Partial<OpenEvent>): Promise<void> {
    await firestoreWrite(setDoc(this.ref(id), tidyEvent(changes) as OpenEvent, { merge: true }), 'Updating event');
  }

  async deleteEvent(id: string): Promise<void> {
    await firestoreWrite(deleteDoc(this.ref(id)), 'Deleting event');
  }
}

/** Trims the name; empty document links are stored as cleared (`null` deletes on merge). */
function tidyEvent<T extends Partial<OpenEvent>>(event: T): T {
  const out = { ...event };
  if (typeof out.name === 'string') out.name = normaliseWhitespace(out.name);
  for (const key of ['noticeOfRaceUrl', 'sailingInstructionsUrl'] as const) {
    if (key in out) {
      const value = out[key]?.trim();
      (out as Record<string, unknown>)[key] = value || null;
    }
  }
  return out;
}
