import { Injectable, inject } from '@angular/core';
import { Firestore, WriteBatch, getDoc, getDocs, writeBatch } from '@angular/fire/firestore';
import { RaceCalendarStore, Series } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { RaceCompetitor, SeriesEntry, SeriesEntryStore } from 'app/results-input';
import { RaceCompetitorStore } from 'app/results-input/services/race-competitor-store';
import { score } from 'app/scoring';
import { ScoringConfiguration } from 'app/scoring/model/scoring-configuration';
import { getHandicapValue } from 'app/scoring/model/handicap';
import { isInFleet } from 'app/scoring/services/fleet-scoring';
import { PublishedRace } from '../model/published-race';
import { PublishedSeason, SeriesInfo } from '../model/published-season';
import { PublishedSeries } from '../model/published-series';
import { PUBLISHED_SEASONS_PATH, PUBLISHED_SERIES_PATH } from './published-results-store';

import { ClubStore, FirestoreTenantService } from 'app/club-tenant';
import { competitorsForConfigRace, isRaceScorable } from './scoring-publish-filters';

const SCORING_CANDIDATE_STATUSES = new Set<Race['status']>([
  'In progress',
  'Completed',
  'Published',
  'Verified',
]);

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
   */
  async publishRace(race: Race): Promise<void> {
    await this.publishRaces([race]);
  }

  /**
   * Publishes multiple races at once, grouping them by series for efficiency and to avoid race conditions.
   */
  async publishRaces(races: Race[]): Promise<void> {
    if (races.length === 0) return;

    console.log(`ScoringEngine.publishRaces: Publishing ${races.length} races: ${races.map(r => r.id).join(', ')}`);

    const batch = writeBatch(this.firestore);
    const seasonUpdates = new Map<string, PublishedSeason>();
    const seriesIds = new Set(races.map(r => r.seriesId));

    for (const seriesId of seriesIds) {
      const seriesRaces = races.filter(r => r.seriesId === seriesId).map(r => r.id);
      await this.publishSeriesInternal(batch, seasonUpdates, seriesId, seriesRaces);
    }

    // Apply season updates to batch
    for (const [seasonId, seasonData] of seasonUpdates) {
      const seasonDoc = this.tenant.docRef<PublishedSeason>(PUBLISHED_SEASONS_PATH, seasonId);
      batch.set(seasonDoc, seasonData);
    }

    await batch.commit();
  }

  /**
   * Recalculates the complete series scores from scratch.
   */
  async scoreCompleteSeries(seriesId: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    const seasonUpdates = new Map<string, PublishedSeason>();

    await this.publishSeriesInternal(batch, seasonUpdates, seriesId);

    // Apply season updates to batch
    for (const [seasonId, seasonData] of seasonUpdates) {
      const seasonDoc = this.tenant.docRef<PublishedSeason>(PUBLISHED_SEASONS_PATH, seasonId);
      batch.set(seasonDoc, seasonData);
    }

    // Clear the Series dirty flag
    const seriesDoc = this.tenant.docRef<Series>('series', seriesId);
    batch.update(seriesDoc, { dirty: false });

    await batch.commit();
  }

  /**
   * Internal method to publish a series. 
   * If additionalRaceIds is provided, it ensures those races are included even if not yet Published/Verified.
   */
  private async publishSeriesInternal(
    batch: WriteBatch,
    seasonUpdates: Map<string, PublishedSeason>,
    seriesId: string,
    additionalRaceIds: string[] = []
  ): Promise<void> {
    const series = await this.raceCalendarStore.getSeriesById(seriesId);
    if (!series) {
      console.error(`ScoringEngine: Series ${seriesId} not found in Firestore.`);
      throw new Error('Series not found');
    }

    // 1. Races to score are chosen by race status. Manual results entry sets status to
    //    In progress / Completed as competitors are recorded, so we do not also require
    //    "has competitor rows" or other heuristics here.
    const racesForSeries = await this.raceCalendarStore.getSeriesRacesById(seriesId);

    let candidateRaces = racesForSeries.filter(r => SCORING_CANDIDATE_STATUSES.has(r.status));

    // Ensure explicitly published race ids are included when they match the same status rules.
    for (const raceId of additionalRaceIds) {
      const race = racesForSeries.find(r => r.id === raceId);
      if (race && SCORING_CANDIDATE_STATUSES.has(race.status) && !candidateRaces.some(r => r.id === raceId)) {
        candidateRaces = [...candidateRaces, race];
      }
    }

    if (candidateRaces.length === 0) {
      console.log(`ScoringEngine: No races to publish for series ${seriesId}`);
      return;
    }

    // 2. Sort races chronologically
    candidateRaces.sort((a, b) => {
      const timeA = (a.actualStart || a.scheduledStart).getTime();
      const timeB = (b.actualStart || b.scheduledStart).getTime();
      return timeA - timeB;
    });

    // 3. Fetch all competitors and entries (needed for scoring and per-fleet filters).
    const allSeriesCompetitors = await this.rcs.getSeriesCompetitors(seriesId);
    const seriesEntries = await this.seriesEntryStore.getSeriesEntries(seriesId);

    const allRaces = candidateRaces;

    console.log(`ScoringEngine: Series ${seriesId} - Races: ${allRaces.length}, Competitors: ${allSeriesCompetitors.length}, Entries: ${seriesEntries.length}`);

    const configsToScore = [series.primaryScoringConfiguration, ...(series.secondaryScoringConfigurations || [])];

    for (const config of configsToScore) {
      const isPrimary = config.id === series.primaryScoringConfiguration.id;
      const publishedSeriesId = isPrimary ? series.id : `${series.id}_${config.id}`;
      const publishedSeriesName = isPrimary ? series.name : `${series.name} - ${config.name}`;

      const scorableRaces = allRaces.filter(race =>
        isRaceScorable(race, config, allSeriesCompetitors, seriesEntries),
      );

      await this.rescoreAllRacesForConfig(batch, seasonUpdates, series, config, publishedSeriesId, publishedSeriesName, scorableRaces, allSeriesCompetitors, seriesEntries);
    }

    this.cleanupStaleSeries(batch, seasonUpdates, series, configsToScore);

    // 4. Clear dirty for every race in this publish pass, so the series
    // does not stay perpetually "needs publish" for those races. New edits (e.g. fixing a result or
    // moving someone back to NOT FINISHED to unscore) will set dirty again via the results workflow.
    for (const race of allRaces) {
      if (race.dirty) {
        const raceDoc = this.tenant.docRef<Race>('races', race.id);
        batch.update(raceDoc, { dirty: false });
      }
    }
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
    racesToScore: Race[],
    allSeriesCompetitors: RaceCompetitor[],
    seriesEntries: SeriesEntry[]
  ): Promise<void> {
    if (racesToScore.length === 0) {
      this.batchSavePublishedSeries(batch, publishedSeriesId, publishedSeriesName, config.fleet.id, []);
      const existingRaces = await this.readPublishedRaces(publishedSeriesId);
      this.batchSavePublishedRaces(batch, publishedSeriesId, [], existingRaces);
      await this.prepareSeasonUpdate(seasonUpdates, series, publishedSeriesId, publishedSeriesName, config.fleet.id, 0);
      return;
    }

    const handicapScheme = config.handicapScheme;

    const filteredSeriesEntries = seriesEntries.filter(e =>
      isInFleet(e, config.fleet) && getHandicapValue(e.handicaps, handicapScheme) != null
    );

    let existingPublishedRaces: PublishedRace[] = [];
    let currentSeriesResults: any[] = [];

    for (let i = 0; i < racesToScore.length; i++) {
      const race = racesToScore[i];

      const filteredCompetitors = competitorsForConfigRace(race, config, allSeriesCompetitors, seriesEntries);

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
    await this.prepareSeasonUpdate(seasonUpdates, series, publishedSeriesId, publishedSeriesName, config.fleet.id, racesToScore.length);
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

  private cleanupStaleSeries(
    batch: WriteBatch,
    seasonUpdates: Map<string, PublishedSeason>,
    series: Series,
    configsToScore: ScoringConfiguration[]
  ): void {
    const currentConfigIds = new Set(configsToScore.map(c => c.id === series.primaryScoringConfiguration.id ? series.id : `${series.id}_${c.id}`));
    for (const [seasonId, seasonData] of seasonUpdates) {
      const staleSeries = seasonData.series.filter(s => s.baseSeriesId === series.id && !currentConfigIds.has(s.id));
      for (const stale of staleSeries) {
        console.log(`ScoringEngine: Cleaning up stale series ${stale.id}`);
        // Remove from season index
        seasonData.series = seasonData.series.filter(s => s.id !== stale.id);
        // Delete published series document
        const seriesDoc = this.tenant.docRef(PUBLISHED_SERIES_PATH, stale.id);
        batch.delete(seriesDoc);
      }
    }
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
