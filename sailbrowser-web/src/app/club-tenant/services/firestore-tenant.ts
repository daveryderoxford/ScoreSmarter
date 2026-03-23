import { inject, Injectable } from '@angular/core';
import { collection, CollectionReference, doc, DocumentReference, Firestore } from '@angular/fire/firestore';
import { classInstanceConverter, dataObjectConverter } from '../../shared/firebase/firestore-helper';
import { ClubTenant } from './club-tenant';

@Injectable({
  providedIn: 'root'
})
export class FirestoreTenantService {
  private firestore = inject(Firestore);
  private clubContext = inject(ClubTenant);

  private get clubId(): string {
    const clubId = this.clubContext.clubId;
    if (!clubId) {
      // This will provide a clearer error if the service is used before the club context is ready.
      throw new Error('FirestoreTenantService: Club ID not available in context.');
    }
    return clubId;
  }

  /** Creates a typed DocumentReference for a document within the current club's tenant space. 
   * @param path Path segments of the document
  */
  docRef<T>(...path: string[]): DocumentReference<T> {
    return doc(this.firestore, 'clubs', this.clubId, ...path).withConverter(dataObjectConverter<T>());
  }
  
  /** Creates a typed CollectionReference for a sub-collection within the current club's tenant space. 
   * @param path Path of Firestore collection
  */
  collectionRef<T>(...path: string[]): CollectionReference<T> {
    return collection(this.firestore, 'clubs', this.clubId, ...path)
       .withConverter(dataObjectConverter<T>());
  }

  /** Creates a typed CollectionReference for a sub-collection of class instances within the current club's tenant space.
   * @param constructor Constructor for the class
   * @param path Path of Firestore collection
   */
  collectionOf<T>(constructor: new (data: Partial<T>) => T, ...path: string[]): CollectionReference<T> {
    return collection(this.firestore, 'clubs', this.clubId, ...path)
      .withConverter(classInstanceConverter<T>(constructor));
  }
}
