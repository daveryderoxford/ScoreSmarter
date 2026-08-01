
import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import {
  arrayRemove,
  arrayUnion,
  doc,
  docData,
  DocumentReference,
  Firestore,
  setDoc,
} from '@angular/fire/firestore';
import { firstValueFrom, filter } from 'rxjs';
import { Club, ScoringDefaults } from '../model/club';
import { Fleet, getFleetName } from 'app/club-tenant/model/fleet';
import { BoatClass } from '../model/boat-class';
import { Season, SeasonStatus } from 'app/race-calender/model/season';

function normalizeSeasonStatus(value: SeasonStatus | string | undefined): SeasonStatus {
  return value === 'archived' ? 'archived' : 'current';
}
import { dataObjectConverter } from 'app/shared/firebase/firestore-helper';
import { firestoreListenerResource } from 'app/shared/firebase/firestore-listener-resource';
import { DEFAULT_SUSPECT_TIME_THRESHOLDS_MINUTES } from 'app/results-input/services/suspect-time-rules';


const DEFAULT_LONG_SERIES_DEFAULTS: ScoringDefaults = {
  discards: [3, 5, 7, 9, 11, 13, 15],
  dncCalculation: {
    basis: 'SeriesEntries',
    offset: 1,
    excludeNeverRaced: true,
  },
};

const DEFAULT_SHORT_SERIES_DEFAULTS: ScoringDefaults = {
  discards: [3, 5, 7, 9, 11, 13, 15],
  dncCalculation: {
    basis: 'SeriesEntries',
    offset: 1,
    excludeNeverRaced: false,
  },
};

const EMPTY_CLUB: Club = {
  id: '',
  name: '',
  shortName: '',
  contactEmail: '',
  contactName: '',
  fleets: [],
  classes: [],
  seasons: [],
  supportedHandicapSchemes: [],
  laps: false,
  oodScoring: { calculationCode: 'AvgAll', maxDuties: 1 },
  suspectTimeThresholds: DEFAULT_SUSPECT_TIME_THRESHOLDS_MINUTES,
  longSeriesDefaults: DEFAULT_LONG_SERIES_DEFAULTS,
  shortSeriesDefaults: DEFAULT_SHORT_SERIES_DEFAULTS,
  tagDefinitions: [],
};

@Injectable({
  providedIn: 'root',
})
export class ClubStore {
  private readonly firestore = inject(Firestore);

  private _confirmedId = signal<string | undefined>(undefined);

  clubDoc = computed(() => {
    if (this._confirmedId()) {
      return doc(this.firestore, 'clubs', this._confirmedId()!)
        .withConverter(dataObjectConverter<Club>());
    } else
      return undefined;
  });

  private _clubResource = firestoreListenerResource({
    name: 'club',
    params: () => this.clubDoc(),
    stream: ({ params: clubDoc }) => {
      return docData(clubDoc!).pipe(
        filter(data => !!data) // Ensure nulls are not emitted
      );
    },
    defaultValue: EMPTY_CLUB,
  });

  public club = computed(() => {
    const club = this._clubResource.value();
    if (!club) return club;

    const systemFleets: Fleet[] = [
      { 
        id: 'general-handicap', 
        type: 'GeneralHandicap',
        name: 'General Handicap'
      }
    ];

    // Combine system fleets with club fleets, avoiding duplicates by id
    const allFleets = [...systemFleets];
    club.fleets.forEach(f => {
      if (!allFleets.find(sf => sf.id === f.id)) {
        allFleets.push(f);
      }
    });

    const sortedFleets = [...allFleets].sort((a, b) =>
      getFleetName(a).localeCompare(getFleetName(b)),
    );
    const sortedClasses = [...club.classes].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const seasons = club.seasons.map((s) => ({
      ...s,
      status: normalizeSeasonStatus(s.status as SeasonStatus | string | undefined),
    }));

    return {
      ...club,
      laps: club.laps ?? false,
      oodScoring: club.oodScoring ?? { calculationCode: 'AvgAll', maxDuties: 1 },
      fleets: sortedFleets,
      classes: sortedClasses,
      seasons,
      longSeriesDefaults: club.longSeriesDefaults ?? DEFAULT_LONG_SERIES_DEFAULTS,
      shortSeriesDefaults: club.shortSeriesDefaults ?? DEFAULT_SHORT_SERIES_DEFAULTS,
      tagDefinitions: club.tagDefinitions ?? [],
      suspectTimeThresholds: {
        ...DEFAULT_SUSPECT_TIME_THRESHOLDS_MINUTES,
        ...(club.suspectTimeThresholds ?? {}),
      },
    };
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
    return await setDoc(this.clubDoc()!, update, { merge: true });
  }

  // All club-doc mutators route through `setDoc({ merge: true })` rather than
  // `updateDoc` so the typed `dataObjectConverter` is invoked (the Firestore
  // SDK skips converters on `updateDoc`). The converter handles undefined →
  // omit, null → deleteField(), Date → Timestamp, etc.; `arrayUnion`/
  // `arrayRemove` sentinels pass through untouched.

  async addFleet(fleet: Fleet) {
    await setDoc(this.clubDoc()!, { fleets: arrayUnion(fleet) }, { merge: true });
  }

  async updateFleet(newFleet: Fleet) {
    const currentFleets = this._clubResource.value().fleets;
    const updatedFleets = currentFleets.map(f => f.id === newFleet.id ? newFleet : f);
    await setDoc(this.clubDoc()!, { fleets: updatedFleets }, { merge: true });
  }

  async removeFleet(fleet: Fleet) {
    const currentFleets = this._clubResource.value()!.fleets;
    const updatedFleets = currentFleets.filter(f => f.id !== fleet.id);
    await setDoc(this.clubDoc()!, { fleets: updatedFleets }, { merge: true });
  }

  async addClass(boatClass: BoatClass) {
    await setDoc(this.clubDoc()!, { classes: arrayUnion(boatClass) }, { merge: true });
  }

  async updateClass(oldClass: BoatClass, newClass: BoatClass) {
    const currentClasses = this.club().classes;
    const updatedClasses = currentClasses.map(c => c.id === oldClass.id ? newClass : c);
    await setDoc(this.clubDoc()!, { classes: updatedClasses }, { merge: true });
  }

  async removeClass(boatClass: BoatClass) {
    await setDoc(this.clubDoc()!, { classes: arrayRemove(boatClass) }, { merge: true });
  }

  async addSeason(season: Season) {
    await setDoc(this.clubDoc()!, { seasons: arrayUnion(season) }, { merge: true });
  }

  async updateSeason(oldSeason: Season, newSeason: Season) {
    const currentSeasons = this.club().seasons;
    const updatedSeasons = currentSeasons.map(s => s.id === oldSeason.id ? newSeason : s);
    await setDoc(this.clubDoc()!, { seasons: updatedSeasons }, { merge: true });
  }

  async removeSeason(season: Season) {
    await setDoc(this.clubDoc()!, { seasons: arrayRemove(season) }, { merge: true });
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
