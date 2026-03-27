import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FirebaseApp } from '@angular/fire/app';
import { collection, collectionData, CollectionReference, getFirestore } from '@angular/fire/firestore';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

export interface Club {
  id: string;
  name: string;
  email: string;
  contact: string;
  logoUrl?: string;
}

@Component({
  selector: 'app-clubs',
  imports: [CommonModule, MatIconModule, RouterLink],
  templateUrl: './clubs.html'
})
export class Clubs {
  private firestore = getFirestore(inject(FirebaseApp));
  
  clubs = rxResource<Club[], null>( {
    stream: () => {
    const clubsCollection = collection(this.firestore, 'clubs') as CollectionReference<Club>;
    return collectionData(clubsCollection, { idField: 'id' })
    },
    defaultValue: [],
  });
  
  /**  */
  clubResultsUrl(clubId: string): string {
    return `https://${clubId}.ro.scoresmarter.app/results/viewer`;
  }
}
