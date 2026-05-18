import { inject, Injectable } from '@angular/core';
import { Firestore, writeBatch } from '@angular/fire/firestore';
import { ClubStore } from 'app/club-tenant/services/club-store';
import { RaceCalendarStore } from 'app/race-calender/services/full-race-calander';
import { SeriesEntryStore } from './series-entry-store';
import {
  planSeriesEntryHandicapSync,
  type SeriesEntryHandicapSyncPlan,
} from './series-entry-handicap-sync';

const BATCH_WRITE_LIMIT = 450;

@Injectable({
  providedIn: 'root',
})
export class SeriesEntryHandicapSyncService {
  private readonly firestore = inject(Firestore);
  private readonly raceCalendar = inject(RaceCalendarStore);
  private readonly seriesEntries = inject(SeriesEntryStore);
  private readonly clubStore = inject(ClubStore);

  async plan(seriesId: string): Promise<SeriesEntryHandicapSyncPlan | null> {
    const series = await this.raceCalendar.getSeriesById(seriesId);
    if (!series) return null;

    const entries = await this.seriesEntries.getSeriesEntries(seriesId);
    const clubClasses = this.clubStore.club().classes;
    return planSeriesEntryHandicapSync(series, entries, clubClasses);
  }

  async apply(seriesId: string): Promise<SeriesEntryHandicapSyncPlan | null> {
    const syncPlan = await this.plan(seriesId);
    if (!syncPlan) return null;

    await this.writeHandicapUpdates(syncPlan);
    await this.markSeriesAndRacesDirty(seriesId);
    return syncPlan;
  }

  private async writeHandicapUpdates(syncPlan: SeriesEntryHandicapSyncPlan): Promise<void> {
    const { updated } = syncPlan;
    for (let i = 0; i < updated.length; i += BATCH_WRITE_LIMIT) {
      const chunk = updated.slice(i, i + BATCH_WRITE_LIMIT);
      const batch = writeBatch(this.firestore);
      for (const { entry, handicaps } of chunk) {
        batch.set(this.seriesEntries.seriesEntryDocRef(entry.id), { handicaps }, { merge: true });
      }
      await batch.commit();
    }
  }

  private async markSeriesAndRacesDirty(seriesId: string): Promise<void> {
    await this.raceCalendar.updateSeries(seriesId, { dirty: true });
    const races = await this.raceCalendar.getSeriesRacesById(seriesId);
    for (const race of races) {
      await this.raceCalendar.ensureRaceDirty(race.id);
    }
  }
}
