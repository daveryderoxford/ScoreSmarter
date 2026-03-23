
import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FirebaseApp } from '@angular/fire/app';
import { arrayRemove, arrayUnion, doc, docData, DocumentReference, getFirestore, setDoc, updateDoc, } from '@angular/fire/firestore';
import { firstValueFrom, filter } from 'rxjs';
import { Club } from '../model/club';
import { Fleet } from 'app/club-tenant/model/fleet';
import { BoatClass } from '../model/boat-class';
import { Season } from 'app/race-calender/model/season';
import { dataObjectConverter } from 'app/shared/firebase/firestore-helper';

@Injectable({
  providedIn: 'root',
})
export class ClubStore {
  private readonly firestore = getFirestore(inject(FirebaseApp));

  private _confirmedId = signal<string | undefined>(undefined);

  clubDoc = computed(() => {
    if (this._confirmedId()) {
      return doc(this.firestore, 'clubs', this._confirmedId()!)
        .withConverter(dataObjectConverter<Club>());
    } else
      return undefined;
  });

  private _clubResource = rxResource<Club, DocumentReference<Club> | undefined>({
    params: () => this.clubDoc(),
    stream: () => {
      return docData(this.clubDoc()!).pipe(
        filter(data => !!data) // Ensure nulls are not emitted
      );
    },
    defaultValue: { 
      id: '', 
      name: '', 
      shortName: '', 
      contactEmail: '', 
      contactName: '', 
      fleets: [], 
      classes: [], 
      seasons: [],
      supportedHandicapSchemes: []
    }
  });

  public club = computed(() => {
    const club = this._clubResource.value();
    if (!club) return club;

    const systemFleets: Fleet[] = [
      { 
        id: 'all', 
        type: 'All',
        name: 'All competitors'
      }
    ];

    // Combine system fleets with club fleets, avoiding duplicates by id
    const allFleets = [...systemFleets];
    club.fleets.forEach(f => {
      if (!allFleets.find(sf => sf.id === f.id)) {
        allFleets.push(f);
      }
    });

    return { ...club, fleets: allFleets };
  });
  public isLoading = this._clubResource.isLoading;
  public error = this._clubResource.error;

  /**
   * Sychranously retrive club data to ensure and 
   * start monitoring for changed to the club's data 
   */
  async initialize(id: string): Promise<Club | undefined> {
    const clubDocRef = doc(this.firestore, 'clubs', id).withConverter(dataObjectConverter<Club>());

    const club = await firstValueFrom(docData(clubDocRef));

    // Start monitoring for edit to club's data 
    this._confirmedId.set(id);

    return club;
  }

  async update(update: Partial<Club>) {
    return await setDoc(this.clubDoc()!, update);
  }

  async addFleet(fleet: Fleet) {
    await updateDoc(this.clubDoc()!, { fleets: arrayUnion(fleet) });
  }

  async updateFleet(newFleet: Fleet) {
    const currentFleets = this._clubResource.value().fleets;
    const updatedFleets = currentFleets.map(f => f.id === newFleet.id ? newFleet : f);
    await updateDoc(this.clubDoc()!, { fleets: updatedFleets });
  }

  async removeFleet(fleet: Fleet) {
    const currentFleets = this._clubResource.value()!.fleets;
    const updatedFleets = currentFleets.filter(f => f.id !== fleet.id);
    await updateDoc(this.clubDoc()!, { fleets: updatedFleets });
  }

  async addClass(boatClass: BoatClass) {
    await updateDoc(this.clubDoc()!, { classes: arrayUnion(boatClass) });
  }

  async updateClass(oldClass: BoatClass, newClass: BoatClass) {
    const currentClasses = this.club().classes;
    const updatedClasses = currentClasses.map(c => c.id === oldClass.id ? newClass : c);
    await updateDoc(this.clubDoc()!, { classes: updatedClasses });
  }

  async removeClass(boatClass: BoatClass) {
    await updateDoc(this.clubDoc()!, { classes: arrayRemove(boatClass) });
  }

  async addSeason(season: Season) {
    await updateDoc(this.clubDoc()!, { seasons: arrayUnion(season) });
  }

  async updateSeason(oldSeason: Season, newSeason: Season) {
    const currentSeasons = this.club().seasons;
    const updatedSeasons = currentSeasons.map(s => s.id === oldSeason.id ? newSeason : s);
    await updateDoc(this.clubDoc()!, { seasons: updatedSeasons });
  }

  async removeSeason(season: Season) {
    await updateDoc(this.clubDoc()!, { seasons: arrayRemove(season) });
  }

  /** Find fleet  by id */
  findFleet(id: string): Signal<Fleet | undefined> {
    return computed(() => this.club().fleets.find(f => f.id === id));
  }

  /** Find season  by id */
  findSeason(id: string): Signal<Season | undefined> {
    return computed(() => this.club().seasons.find(s => s.id === id));
  }

  /** Find season  by id */
  findClass(id: string): Signal<BoatClass | undefined> {
    return computed(() => this.club().classes.find(c => c.id === id));
  }
}
