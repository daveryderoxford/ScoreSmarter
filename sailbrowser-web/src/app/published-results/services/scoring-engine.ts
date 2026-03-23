import { Injectable, inject } from '@angular/core';
import { Firestore, getDocs, writeBatch, WriteBatch, getDoc } from '@angular/fire/firestore';
import { RaceCalendarStore, Series } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { SeriesEntryStore, SeriesEntry, RaceCompetitor } from 'app/results-input';
import { RaceCompetitorStore } from 'app/results-input/services/race-competitor-store';
import { score } from 'app/scoring';
import { ScoringConfiguration } from 'app/scoring/model/scoring-configuration';
import { getFleetName } from 'app/club-tenant/model/fleet';
import { isInFleet } from 'app/scoring/services/fleet-scoring';
import { PublishedRace } from '../model/published-race';
import { PublishedSeason, SeriesInfo } from '../model/published-season';
import { PublishedSeries } from '../model/published-series';
import { PUBLISHED_SEASONS_PATH, PUBLISHED_SERIES_PATH } from './published-results-store';

import { ClubStore, FirestoreTenantService } from 'app/club-tenant';

@Injectable({ providedIn: 'root' })
export class ScoringEngine {
   private firestore = inject(Firestore);
   private tenant = inject(FirestoreTenantService);
   private rcs = inject(RaceCompetitorStore);
   private seriesEntryStore = inject(SeriesEntryStore);
   private raceCalendarStore = inject(RaceCalendarStore);
   private clubStore = inject(ClubStore);

   /**
    * Publishes the results of a single race to the public results area.
    * This involves:
    * 1. Scoring the series including the new race.
    * 2. Saving the updated series results.
    * 3. Saving the results of the published race.
    * 4. Updating the season index.
    */
   async publishRace(race: Race): Promise<void> {
      const series = this.raceCalendarStore.allSeries().find(s => s.id === race.seriesId);
      if (!series) throw new Error('Series not found');

      const competitors = this.rcs.selectedCompetitors().filter(c => c.raceId === race.id);
      const seriesEntries = this.seriesEntryStore.selectedEntries().filter( s => s.seriesId === race.seriesId)

      const configsToScore = [series.primaryScoringConfiguration, ...(series.secondaryScoringConfigurations || [])];

      const batch = writeBatch(this.firestore);
      const seasonUpdates = new Map<string, PublishedSeason>();

      for (const config of configsToScore) {
         const isPrimary = config.id === series.primaryScoringConfiguration.id;
         const publishedSeriesId = isPrimary ? series.id : `${series.id}_${config.id}`;
         const publishedSeriesName = isPrimary ? series.name : `${series.name} - ${config.name}`;
         
         // Filter entries and competitors
         const filteredSeriesEntries = seriesEntries.filter(e => isInFleet(e, config.fleet));
             
         const filteredCompetitors = competitors.filter(c => {
                 const entry = seriesEntries.find(e => e.id === c.seriesEntryId);
                 return entry ? isInFleet(entry, config.fleet) : false;
             });

         // 1. Fetch all existing data required for scoring.
         const existingRaces = await this.readPublishedRaces(publishedSeriesId);
         const raceCount = existingRaces.filter(r => r.id !== race.id).length + 1;

         // 2. Perform the scoring.
         const { scoredRaces, seriesResults } = score(race, filteredCompetitors, existingRaces, filteredSeriesEntries, {
            seriesType: series.scoringAlgorithm,
            discards: this.calculateDiscards(series, raceCount),
         }, config);

         // Update seriesId and seriesName in scoredRaces
         scoredRaces.forEach((r: PublishedRace) => {
             r.seriesId = publishedSeriesId;
             r.seriesName = publishedSeriesName;
         });

         // 3. Add to batch.
         this.batchSavePublishedSeries(batch, publishedSeriesId, publishedSeriesName, config.fleet.id, seriesResults);
         this.batchSavePublishedRaces(batch, publishedSeriesId, scoredRaces, existingRaces);
         await this.prepareSeasonUpdate(seasonUpdates, series, publishedSeriesId, publishedSeriesName, config.fleet.id, raceCount);
      }

      // Apply season updates to batch
      for (const [seasonId, seasonData] of seasonUpdates) {
         const seasonDoc = this.tenant.docRef<PublishedSeason>(PUBLISHED_SEASONS_PATH, seasonId);
         batch.set(seasonDoc, seasonData);
      }

      // Clear dirty flag if it was set
      if (series.dirty) {
         const seriesDoc = this.tenant.docRef<Series>('series', series.id);
         batch.update(seriesDoc, { dirty: false });
      }

      await batch.commit();
   }

   /**
    * Recalculates the complete series scores from scratch.
    * This handles changes to series configurations after races have been published.
    */
   async scoreCompleteSeries(seriesId: string): Promise<void> {
      const series = this.raceCalendarStore.allSeries().find(s => s.id === seriesId);
      if (!series) throw new Error('Series not found');

      // 1. Fetch all races and filter for those that are "run"
      const allRaces = this.raceCalendarStore.allRaces()
         .filter(r => r.seriesId === seriesId && (r.status === 'Published' || r.status === 'Verified'));
      
      if (allRaces.length === 0) return;

      // 2. Sort races chronologically (Actual Start)
      allRaces.sort((a, b) => {
         const timeA = (a.actualStart || a.scheduledStart).getTime();
         const timeB = (b.actualStart || b.scheduledStart).getTime();
         return timeA - timeB;
      });

      // 3. Fetch all competitors for the series
      const allSeriesCompetitors = await this.rcs.getSeriesCompetitors(seriesId);
      const seriesEntries = this.seriesEntryStore.selectedEntries().filter(s => s.seriesId === seriesId);

      const configsToScore = [series.primaryScoringConfiguration, ...(series.secondaryScoringConfigurations || [])];
      const batch = writeBatch(this.firestore);
      const seasonUpdates = new Map<string, PublishedSeason>();

      for (const config of configsToScore) {
         const isPrimary = config.id === series.primaryScoringConfiguration.id;
         const publishedSeriesId = isPrimary ? series.id : `${series.id}_${config.id}`;
         const publishedSeriesName = isPrimary ? series.name : `${series.name} - ${config.name}`;

         await this.rescoreAllRacesForConfig(batch, seasonUpdates, series, config, publishedSeriesId, publishedSeriesName, allRaces, allSeriesCompetitors, seriesEntries);
      }

      // Apply season updates to batch
      for (const [seasonId, seasonData] of seasonUpdates) {
         const seasonDoc = this.tenant.docRef<PublishedSeason>(PUBLISHED_SEASONS_PATH, seasonId);
         batch.set(seasonDoc, seasonData);
      }

      // 4. Clear the Series.dirty flag
      const seriesDoc = this.tenant.docRef<Series>('series', seriesId);
      batch.update(seriesDoc, { dirty: false });

      await batch.commit();
   }

   private calculateDiscards(series: Series, raceCount: number): number {
      const { initialDiscardAfter, subsequentDiscardsEveryN } = series;
      if (raceCount < initialDiscardAfter) return 0;
      return 1 + Math.floor((raceCount - initialDiscardAfter) / subsequentDiscardsEveryN);
   }

   private async rescoreAllRacesForConfig(
      batch: WriteBatch,
      seasonUpdates: Map<string, PublishedSeason>,
      series: Series,
      config: ScoringConfiguration,
      publishedSeriesId: string,
      publishedSeriesName: string,
      allRaces: Race[],
      allSeriesCompetitors: RaceCompetitor[],
      seriesEntries: SeriesEntry[]
   ): Promise<void> {
      if (allRaces.length === 0) return;

      const filteredSeriesEntries = seriesEntries.filter(e => isInFleet(e, config.fleet));
          
      let existingPublishedRaces: PublishedRace[] = [];
      let currentSeriesResults: any[] = [];
      
      for (let i = 0; i < allRaces.length; i++) {
         const race = allRaces[i];
         
         const filteredCompetitors = allSeriesCompetitors.filter(c => {
            if (c.raceId !== race.id) return false;
            const entry = seriesEntries.find(e => e.id === c.seriesEntryId);
            return entry ? isInFleet(entry, config.fleet) : false;
         });
             
         const raceCount = i + 1;
         
         const { scoredRaces, seriesResults } = score(race, filteredCompetitors, existingPublishedRaces, filteredSeriesEntries, {
            seriesType: series.scoringAlgorithm,
            discards: this.calculateDiscards(series, raceCount),
         }, config);
         
         scoredRaces.forEach((r: PublishedRace) => {
             r.seriesId = publishedSeriesId;
             r.seriesName = publishedSeriesName;
         });
         
         existingPublishedRaces = scoredRaces;
         currentSeriesResults = seriesResults;
      }
      
      this.batchSavePublishedSeries(batch, publishedSeriesId, publishedSeriesName, config.fleet.id, currentSeriesResults);
      const existingRaces = await this.readPublishedRaces(publishedSeriesId);
      this.batchSavePublishedRaces(batch, publishedSeriesId, existingPublishedRaces, existingRaces);
      await this.prepareSeasonUpdate(seasonUpdates, series, publishedSeriesId, publishedSeriesName, config.fleet.id, allRaces.length);
   }

   private async readPublishedRaces(publishedSeriesId: string): Promise<PublishedRace[]> {
      const racesCol = this.tenant.collectionRef<PublishedRace>(PUBLISHED_SERIES_PATH, publishedSeriesId, 'races');
      const snapshot = await getDocs(racesCol);
      return snapshot.docs.map(doc => doc.data());
   }

   private batchSavePublishedSeries(batch: WriteBatch, publishedSeriesId: string, publishedSeriesName: string, fleetId: string, results: any[]): void {
      const seriesDoc = this.tenant.docRef<PublishedSeries>(PUBLISHED_SERIES_PATH, publishedSeriesId);
      const publishedSeries: PublishedSeries = {
         id: publishedSeriesId,
         name: publishedSeriesName,
         fleetId: fleetId,
         competitors: results,
      };
      batch.set(seriesDoc, publishedSeries);
   }

   private batchSavePublishedRaces(batch: WriteBatch, publishedSeriesId: string, scoredRaces: PublishedRace[], existingRaces: PublishedRace[]): void {
      // Save all scored races
      scoredRaces.forEach(race => {
         const raceDoc = this.tenant.docRef<PublishedRace>(PUBLISHED_SERIES_PATH, publishedSeriesId, 'races', race.id);
         batch.set(raceDoc, race);
      });

      // Delete orphans (simple diff)
      const scoredIds = new Set(scoredRaces.map(r => r.id));
      existingRaces.forEach(existing => {
         if (!scoredIds.has(existing.id)) {
            const raceDoc = this.tenant.docRef<PublishedRace>(PUBLISHED_SERIES_PATH, publishedSeriesId, 'races', existing.id);
            batch.delete(raceDoc);
         }
      });
   }

   private async prepareSeasonUpdate(
      updates: Map<string, PublishedSeason>,
      series: Series,
      publishedSeriesId: string,
      publishedSeriesName: string,
      fleetId: string,
      raceCount: number
   ): Promise<void> {
      const seasonId = series.seasonId;
      let seasonData = updates.get(seasonId);
      
      if (!seasonData) {
         seasonData = (await this.readPublishedSeason(seasonId)) ?? undefined;
         if (!seasonData) {
            const seasonName = this.clubStore.club().seasons.find(s => s.id === seasonId)?.name || 'Unknown Season';
            seasonData = { id: seasonId, name: seasonName, series: [] };
         }
         updates.set(seasonId, seasonData);
      }

      const seriesInfo: SeriesInfo = {
         id: publishedSeriesId,
         baseSeriesId: series.id,
         name: publishedSeriesName,
         fleetId: fleetId,
         startDate: series.startDate || new Date(),
         endDate: series.endDate || new Date(),
         raceCount: raceCount,
      };

      const existingIndex = seasonData.series.findIndex(s => s.id === publishedSeriesId);
      if (existingIndex === -1) {
         seasonData.series.push(seriesInfo);
      } else {
         seasonData.series[existingIndex] = seriesInfo;
      }
   }

   private async readPublishedSeason(seasonId: string): Promise<PublishedSeason | null> {
      const seasonDoc = this.tenant.docRef<PublishedSeason>(PUBLISHED_SEASONS_PATH, seasonId);
      const docSnap = await getDoc(seasonDoc);
      return docSnap.exists() ? docSnap.data() : null;
   }
}
