import { inject, Injectable } from '@angular/core';
import { generateSecureID } from 'app/shared/firebase/firestore-helper';
import { deleteDoc, getDocs, query, setDoc, where, writeBatch, Firestore } from '@angular/fire/firestore';
import { FIRESTORE_BULK_WRITE_TIMEOUT_MS, firestoreWrite, withTimeout } from 'app/shared/utils/with-timeout';
import { Race } from '../model/race';
import { Series } from '../model/series';
import { FirestoreTenantService } from 'app/club-tenant';

export interface RaceSeriesDetails {
  id: string;
  name: string;
  fleetId: string;
}

@Injectable({
  providedIn: 'root',
})
export class RaceCalendarStoreBase {
  protected readonly firestore = inject(Firestore);
  private readonly tenant = inject(FirestoreTenantService);

  protected ref = (id: string) => this.tenant.docRef<Series>('series', id);
  protected seriesCollection = this.tenant.collectionRef<Series>('series');

  protected raceRef = (id: string) => this.tenant.docRef<Race>('races', id);
  protected racesCollection = this.tenant.collectionRef<Race>('races');

  /** Add a series retruning a document Id */
  async addSeries(series: Partial<Series>): Promise<string> {
    series.archived = false;
    const id = generateSecureID(1000, `S-${series.name}`);
    await firestoreWrite(setDoc(this.ref(id), series), 'Saving series');
    return id;
  }

  async updateSeries(id: string, data: Partial<Series>) {
    const scoringCriticalFields: (keyof Series)[] = [
      'scoringAlgorithm',
      'entryAlgorithm',
      'discards',
      'primaryScoringConfiguration',
      'secondaryScoringConfigurations',
      'divisions',
    ];

    const hasScoringChange = scoringCriticalFields.some(field => field in data);
    if (hasScoringChange) {
      data.dirty = true;
    }

    await firestoreWrite(setDoc(this.ref(id), data, { merge: true }), 'Updating series');
  }

  async deleteSeries(id: string) {
    // Delete races for the series. 
    const racesSnapshot = await firestoreWrite(
      getDocs(query(this.racesCollection, where('seriesId', '==', id))),
      'Loading series races',
    );

    const batch = writeBatch(this.firestore);
    racesSnapshot.forEach(doc => batch.delete(doc.ref));
    
    // Delete the series in the batch
    batch.delete(this.ref(id));
    await withTimeout(batch.commit(), FIRESTORE_BULK_WRITE_TIMEOUT_MS, 'Deleting series');
  }

  async addRace(seriesDetails: RaceSeriesDetails, race: Partial<Race>): Promise<void> {
    race.seriesId = seriesDetails.id;
    race.seriesName = seriesDetails.name;
    race.fleetId = seriesDetails.fleetId;
    race.status = 'Future';
    const id = generateSecureID(10000, `R-${seriesDetails.name}`);
    await firestoreWrite(setDoc(this.raceRef(id), race), 'Saving race');
  }

  async updateRace(raceId: string, data: Partial<Race>): Promise<void> {
    await firestoreWrite(setDoc(this.raceRef(raceId), data, { merge: true }), 'Updating race');
  }

  async deleteRace(race: Race): Promise<void> {
    await firestoreWrite(deleteDoc(this.raceRef(race.id)), 'Deleting race');
  }
}

export function seriesSort(a: Series, b: Series): number {
  if (!a.startDate) {
    return !b.startDate ? 1 : 0;
  }

  if (!b.startDate) {
    return -1;
  }

  const ret = a.startDate.getTime() - b.startDate.getTime();
  if (ret !== 0) {
    return ret;
  } else {
    return a.name.localeCompare(b.name);
  }
}

/** Date, scheduled start, race of day, then series name. `scheduledStart` covers date then time. */
export function sortRaces(a: Race, b: Race): number {
  return (
    new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime() ||
    (a.raceOfDay ?? 0) - (b.raceOfDay ?? 0) ||
    (a.seriesName ?? '').localeCompare(b.seriesName ?? '')
  );
}