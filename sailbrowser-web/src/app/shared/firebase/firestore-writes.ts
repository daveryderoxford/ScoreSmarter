import { InjectionToken } from '@angular/core';
import {
  type DocumentReference,
  type Firestore,
  type PartialWithFieldValue,
  type SetOptions,
  setDoc,
  type WriteBatch,
  writeBatch,
} from '@angular/fire/firestore';

/**
 * Firestore write entry points, injectable so tests can apply writes to
 * in-memory stores. Module mocking (`vi.mock`) is unreliable here because the
 * unit-test builder bundles specs and the mock's reach depends on chunking.
 */
export interface FirestoreWrites {
  writeBatch(firestore: Firestore): WriteBatch;
  setDoc<T>(ref: DocumentReference<T>, data: PartialWithFieldValue<T>, options: SetOptions): Promise<void>;
}

export const FIRESTORE_WRITES = new InjectionToken<FirestoreWrites>('FirestoreWrites', {
  providedIn: 'root',
  factory: () => ({ writeBatch, setDoc }),
});
