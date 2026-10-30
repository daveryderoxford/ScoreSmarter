import { inject, Injectable } from '@angular/core';
import type { BoatClass } from '../model/boat-class';
import { newClubClass, type NewClubClass } from '../model/club-class';
import { ClassCatalogueStore } from './class-catalogue-store';
import { ClubStore } from './club-store';
import { RatingListStore } from './rating-list-store';

/**
 * Adds classes to the club list. Race officers can add (Firestore rules let them append
 * one class) but not edit classes; the entry kiosk can't add.
 */
@Injectable({ providedIn: 'root' })
export class ClubClassService {
  private readonly clubStore = inject(ClubStore);
  private readonly catalogue = inject(ClassCatalogueStore);
  private readonly ratingLists = inject(RatingListStore);

  /** The added class. Rejects with a message saying why, e.g. when the class already exists. */
  async add(request: NewClubClass): Promise<BoatClass> {
    const ratingLists = await this.ratingLists.load();
    const boatClass = newClubClass(request, this.clubStore.club().classes, this.catalogue.classes(), ratingLists);
    if (typeof boatClass === 'string') throw new Error(boatClass);
    await this.clubStore.addClass(boatClass);
    return boatClass;
  }
}
