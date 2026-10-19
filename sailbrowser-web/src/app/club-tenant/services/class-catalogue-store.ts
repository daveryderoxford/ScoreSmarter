import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { doc, docData, Firestore, setDoc } from '@angular/fire/firestore';
import { dataObjectConverter } from 'app/shared/firebase/firestore-helper';
import { firestoreWrite } from 'app/shared/utils/with-timeout';
import { map } from 'rxjs';
import { CLASS_CATALOGUE_PATH, type CatalogClass, type ClassCatalogue } from '../model/catalog-class';

/** Global class catalogue (one document, read once and kept live). */
@Injectable({ providedIn: 'root' })
export class ClassCatalogueStore {
  private readonly firestore = inject(Firestore);

  private ref() {
    return doc(this.firestore, ...CLASS_CATALOGUE_PATH).withConverter(dataObjectConverter<ClassCatalogue>());
  }

  private readonly resource = rxResource({
    stream: () => docData(this.ref()).pipe(map(data => data ?? { classes: [] })),
  });

  readonly catalogue = computed<ClassCatalogue>(() => this.resource.value() ?? { classes: [] });
  readonly classes = computed<CatalogClass[]>(() =>
    [...this.catalogue().classes].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly byId = computed(() => new Map(this.classes().map(c => [c.catalogueId, c] as const)));
  readonly isLoading = this.resource.isLoading;
  readonly error = this.resource.error;

  /** Sys-admin only (enforced by Firestore rules). */
  async save(catalogue: ClassCatalogue): Promise<void> {
    await firestoreWrite(
      setDoc(this.ref(), { ...catalogue, updatedAt: new Date() }),
      'Saving class catalogue',
    );
  }
}
