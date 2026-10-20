import { inject, Injectable } from '@angular/core';
import { DocumentData, DocumentReference, Firestore, getDocs, query, where, writeBatch } from '@angular/fire/firestore';
import { FIRESTORE_BULK_WRITE_TIMEOUT_MS, firestoreWrite, withTimeout } from 'app/shared/utils/with-timeout';
import { FirestoreTenantService } from './firestore-tenant';

const WRITE_BATCH_LIMIT = 500;

/** Boats and series entries that store a class name, found before a rename. */
export interface ClassRenamePlan {
  oldName: string;
  boats: DocumentReference[];
  seriesEntries: DocumentReference[];
}

/**
 * Class names are stored as text on boats and series entries, so renaming a class
 * also renames it there. Published results keep the name they were published with.
 */
@Injectable({ providedIn: 'root' })
export class ClassRenameService {
  private readonly firestore = inject(Firestore);
  private readonly tenant = inject(FirestoreTenantService);

  async plan(oldName: string): Promise<ClassRenamePlan> {
    const byClass = (collection: string) =>
      firestoreWrite(
        getDocs(query(this.tenant.collectionRef<DocumentData>(collection), where('boatClass', '==', oldName))),
        'Finding records for class rename',
      );
    const [boats, seriesEntries] = await Promise.all([byClass('boats'), byClass('series-entries')]);
    return {
      oldName,
      boats: boats.docs.map(d => d.ref),
      seriesEntries: seriesEntries.docs.map(d => d.ref),
    };
  }

  async apply(plan: ClassRenamePlan, newName: string): Promise<void> {
    const refs = [...plan.boats, ...plan.seriesEntries];
    for (let i = 0; i < refs.length; i += WRITE_BATCH_LIMIT) {
      const batch = writeBatch(this.firestore);
      for (const ref of refs.slice(i, i + WRITE_BATCH_LIMIT)) {
        batch.update(ref, { boatClass: newName });
      }
      await withTimeout(batch.commit(), FIRESTORE_BULK_WRITE_TIMEOUT_MS, 'Renaming class');
    }
  }
}
