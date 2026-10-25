import { Injectable, inject } from '@angular/core';
import { Firestore, WriteBatch, getDoc, getDocs, writeBatch } from '@angular/fire/firestore';
import { RaceCalendarStore, Series } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { resultsStateOf, type ResultsState } from 'app/race-calender/model/results-state';
import { RaceCompetitor, SeriesEntry, SeriesEntryStore } from 'app/results-input';
import { RaceCompetitorStore } from 'app/results-input/services/race-competitor-store';
import { scoreSeriesSnapshot } from 'app/scoring/core/public-api';
import { ScoringConfiguration } from 'app/scoring/model/scoring-configuration';
import { discardsForRaceIndex } from 'app/scoring/model/discard-profile';
import { doesRaceRequireHandicap } from 'app/race-calender/model/race-type';
import {
  buildDivisionSnapshot,
  rowDivisionIds,
} from 'app/race-calender/model/division';
import type { Division } from 'app/race-calender/model/division';
import { groupBy } from 'app/shared/utils/group-by';
import { PublishedRace } from '../model/published-race';
import { PublishedSeason, SeriesInfo } from '../model/published-season';
import { PublishedCancelledRace, PublishedRaceStart, PublishedSeries } from '../model/published-series';
import { PUBLISHED_SEASONS_PATH, PUBLISHED_SERIES_PATH } from './published-results-store';
import { samePublishedContent } from './published-content';
import { compactSeriesResults, type StoredPublishedSeries } from '../model/published-series-storage';

import { ClubStore, FirestoreTenantService } from 'app/club-tenant';
import { competitorsForConfigRace, isRaceScorable, seriesEntriesForConfig, type EntryMembership } from 'app/scoring/core/rules/eligibility';
import { startOfDay, subDays } from 'date-fns';
import { buildDncContext, DEFAULT_DNC_POLICY } from 'app/scoring/core/rules/dnc-context';
type PublishedSeriesInfo = Required<Pick<PublishedSeries, 'racesSailed' | 'discards' | 'cancelledRaces' | 'resultsState' | 'raceStarts'>> &
  Pick<PublishedSeries, 'scoringAlgorithm'>;

/** A published series is final only when every race in it is final. */
export function publishedSeriesResultsState(races: readonly Race[]): ResultsState {
  return races.length > 0 && races.every(r => resultsStateOf(r) === 'final') ? 'final' : 'provisional';
}

/** Number and start of each published race, in race order (standings headings). */
export function publishedRaceStarts(races: readonly Race[]): PublishedRaceStart[] {
  return races
    .map(r => ({ index: r.index, scheduledStart: r.scheduledStart }))
    .sort((a, b) => a.index - b.index);
}

/** Cancelled races in start order, for display on the published series. */
export function publishedCancelledRaces(races: readonly Race[]): PublishedCancelledRace[] {
  return races
    .filter(r => r.status === 'Canceled')
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime())
    .map(r => ({ raceId: r.id, index: r.index, scheduledStart: r.scheduledStart }));
}

/** A published series built from a calendar series: one per scoring configuration, plus separately scored divisions. */
export interface PublishedSeriesTarget {
  config: ScoringConfiguration;
  publishedSeriesId: string;
  publishedSeriesName: string;
  membership: EntryMembership;
}

export function publishedSeriesTargets(series: Series, configs: ScoringConfiguration[]): PublishedSeriesTarget[] {
  const primary = series.primaryScoringConfiguration;
  return [
    ...configs.map(config => {
      const isPrimary = config.id === primary.id;
      return {
        config,
        publishedSeriesId: isPrimary ? series.id : `${series.id}_${config.id}`,
        publishedSeriesName: isPrimary ? series.name : `${series.name} - ${config.name}`,
        membership: { kind: 'fleet' } as EntryMembership,
      };
    }),
    ...(series.divisions ?? [])
      .filter(division => division.scoreAs === 'separateSeries')
      .map(division => ({
        config: primary,
        publishedSeriesId: `${series.id}_div_${division.id}`,
        publishedSeriesName: `${series.name} - ${division.name}`,
        membership: { kind: 'division', divisionId: division.id } as EntryMembership,
      })),
  ];
}

const SCORING_CANDIDATE_STATUSES = new Set<Race['status']>([
  'In progress',
  'Completed',
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
    const racesBySeries = groupBy(races, race => race.seriesId);

    for (const [seriesId, seriesRaces] of racesBySeries) {
      const raceIds = seriesRaces.map(r => r.id);
      await this.publishSeriesInternal(batch, seasonUpdates, seriesId, raceIds);
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
    const [series, racesForSeries] = await Promise.all([
      this.raceCalendarStore.getSeriesById(seriesId),
      this.raceCalendarStore.getSeriesRacesById(seriesId),
    ]);
    if (!series) {
      console.error(`ScoringEngine: Series ${seriesId} not found in Firestore.`);
      throw new Error('Series not found');
    }

    // 1. Races to score are chosen by race status. The server (`raceResultsChanged`) sets
    //    In progress / Completed from the recorded results, so we do not also require
    //    "has competitor rows" or other heuristics here.

    let candidateRaces = racesForSeries.filter(r => SCORING_CANDIDATE_STATUSES.has(r.status));

    // Ensure explicitly published race ids are included when they match the same status rules.
    for (const raceId of additionalRaceIds) {
      const race = racesForSeries.find(r => r.id === raceId);
      if (race && SCORING_CANDIDATE_STATUSES.has(race.status) && !candidateRaces.some(r => r.id === raceId)) {
        candidateRaces = [...candidateRaces, race];
      }
    }

    const cancelledRaces = publishedCancelledRaces(racesForSeries);

    if (candidateRaces.length === 0 && cancelledRaces.length === 0) {
      console.log(`ScoringEngine: No races to publish for series ${seriesId}`);
    } else {
      // 2. Sort races chronologically
      candidateRaces.sort((a, b) => {
        const timeA = (a.actualStart || a.scheduledStart).getTime();
        const timeB = (b.actualStart || b.scheduledStart).getTime();
        return timeA - timeB;
      });

      const configsToScore = [series.primaryScoringConfiguration, ...(series.secondaryScoringConfigurations || [])];
      const targets = publishedSeriesTargets(series, configsToScore);

      // 3. Read everything scoring needs at once: competitors and entries (scoring and
      //    per-fleet filters), the currently published races of each target, and the season.
      const [allSeriesCompetitors, seriesEntries, storedRaces] = await Promise.all([
        this.rcs.getSeriesCompetitors(seriesId),
        this.seriesEntryStore.getSeriesEntries(seriesId),
        Promise.all(targets.map(t => this.readPublishedRaces(t.publishedSeriesId))),
        this.loadSeason(seasonUpdates, series.seasonId),
      ]);

      console.log(`ScoringEngine: Series ${seriesId} - Races: ${candidateRaces.length}, Competitors: ${allSeriesCompetitors.length}, Entries: ${seriesEntries.length}`);

      targets.forEach((target, i) => {
        const scorableRaces = candidateRaces.filter(race =>
          isRaceScorable(race, target.config, allSeriesCompetitors, seriesEntries, target.membership),
        );
        this.rescoreAllRacesForConfig(
          batch,
          seasonUpdates,
          series,
          target,
          scorableRaces,
          allSeriesCompetitors,
          seriesEntries,
          cancelledRaces,
          storedRaces[i],
        );
      });

      this.cleanupStaleSeries(batch, seasonUpdates, series, configsToScore);
    }

    // 4. Clear dirty for every race in the series. 
    for (const race of racesForSeries) {
      if (race.dirty) {
        const raceDoc = this.tenant.docRef<Race>('races', race.id);
        batch.update(raceDoc, { dirty: false });
      }
    }
  }

  private calculateDiscards(series: Series, raceCount: number): number {
    return discardsForRaceIndex(series, raceCount);
  }

  private rescoreAllRacesForConfig(
    batch: WriteBatch,
    seasonUpdates: Map<string, PublishedSeason>,
    series: Series,
    target: PublishedSeriesTarget,
    racesToScore: Race[],
    allSeriesCompetitors: RaceCompetitor[],
    seriesEntries: SeriesEntry[],
    cancelledRaces: PublishedCancelledRace[],
    storedRaces: PublishedRace[],
  ): void {
    const { config, publishedSeriesId, publishedSeriesName, membership } = target;
    const catalog: Division[] = series.divisions ?? [];
    const seriesInfo: PublishedSeriesInfo = {
      scoringAlgorithm: series.scoringAlgorithm,
      racesSailed: racesToScore.length,
      discards: this.calculateDiscards(series, racesToScore.length),
      cancelledRaces,
      resultsState: publishedSeriesResultsState(racesToScore),
      raceStarts: publishedRaceStarts(racesToScore),
    };

    if (racesToScore.length === 0) {
      this.savePublishedSeries(batch, publishedSeriesId, publishedSeriesName, config.fleet.id, [], [], seriesInfo);
      this.savePublishedRaces(batch, publishedSeriesId, [], storedRaces);
      this.prepareSeasonUpdate(
        seasonUpdates,
        series,
        publishedSeriesId,
        publishedSeriesName,
        config,
        0,
        0,
        undefined,
      );
      return;
    }

    const anyRaceRequiresHandicap = racesToScore.some(race => doesRaceRequireHandicap(race.type));
    const filteredSeriesEntries = seriesEntriesForConfig(
      seriesEntries,
      config,
      anyRaceRequiresHandicap,
      membership,
    );

    let existingPublishedRaces: PublishedRace[] = [];
    let currentSeriesResults: PublishedSeries['competitors'] = [];

    const mergeStrategy = series.entryAlgorithm;
    const club = this.clubStore.club();
    const seriesDefaults = series.scoringAlgorithm === 'long'
      ? club?.longSeriesDefaults
      : club?.shortSeriesDefaults;
    const dncPolicy = seriesDefaults?.dncCalculation ?? DEFAULT_DNC_POLICY;
    const { dncPoints } = buildDncContext({
      racesToScore,
      config,
      seriesEntries: filteredSeriesEntries,
      allSeriesCompetitors,
      mergeStrategy,
      dncPolicy,
      membership,
    });

    for (let i = 0; i < racesToScore.length; i++) {
      const race = racesToScore[i];

      const filteredCompetitors = competitorsForConfigRace(
        race,
        config,
        allSeriesCompetitors,
        seriesEntries,
        membership,
      );

      const raceIndex = i + 1;

      const { scoredRaces, seriesResults } = scoreSeriesSnapshot({
        raceToScore: race,
        competitorsInRace: filteredCompetitors,
        existingScoredRaces: existingPublishedRaces,
        seriesEntries: filteredSeriesEntries,
        config: {
          seriesType: series.scoringAlgorithm,
          discards: this.calculateDiscards(series, raceIndex),
          dncPoints,
          excludeNeverRaced: dncPolicy.excludeNeverRaced,
        },
        scoringConfiguration: config,
        mergeStrategy,
      });

      scoredRaces.forEach((r: PublishedRace) => {
        r.seriesId = publishedSeriesId;
        r.seriesName = publishedSeriesName;
      });

      existingPublishedRaces = scoredRaces;
      currentSeriesResults = seriesResults;
    }

    for (const race of existingPublishedRaces) {
      for (const result of race.results) {
        result.divisions = rowDivisionIds(result);
      }
      const ids = race.results.flatMap(r => r.divisions);
      race.divisionDefinitions = buildDivisionSnapshot(ids, catalog);
      const source = racesToScore.find(r => r.id === race.id);
      if (source?.raceOfficer) race.raceOfficer = source.raceOfficer;
      if (source?.wind) race.wind = source.wind;
      race.resultsState = source ? resultsStateOf(source) : 'provisional';
    }
    for (const competitor of currentSeriesResults) {
      competitor.divisions = rowDivisionIds(competitor);
    }
    const seriesDivisionIds = currentSeriesResults.flatMap(c => c.divisions);
    const seriesDivisionDefinitions = buildDivisionSnapshot(seriesDivisionIds, catalog);

    this.savePublishedSeries(
      batch,
      publishedSeriesId,
      publishedSeriesName,
      config.fleet.id,
      currentSeriesResults,
      seriesDivisionDefinitions,
      seriesInfo,
    );
    this.savePublishedRaces(batch, publishedSeriesId, existingPublishedRaces, storedRaces);
    this.prepareSeasonUpdate(
      seasonUpdates,
      series,
      publishedSeriesId,
      publishedSeriesName,
      config,
      racesToScore.length,
      this.recentRaceCount(racesToScore, 6),
      this.latestScheduledStart(racesToScore),
    );
  }

  private async readPublishedRaces(publishedSeriesId: string): Promise<PublishedRace[]> {
    const racesCol = this.tenant.collectionRef<PublishedRace>(PUBLISHED_SERIES_PATH, publishedSeriesId, 'races');
    const snapshot = await getDocs(racesCol);
    return snapshot.docs.map(doc => {
      const race = doc.data();
      return {
        ...race,
        results: race.results.map(r => Array.isArray(r.divisions) ? r : { ...r, divisions: [] }),
        divisionDefinitions: Array.isArray(race.divisionDefinitions) ? race.divisionDefinitions : [],
      };
    });
  }

  private savePublishedSeries(
    batch: WriteBatch,
    publishedSeriesId: string,
    publishedSeriesName: string,
    fleetId: string,
    results: PublishedSeries['competitors'],
    divisionDefinitions: Division[],
    info: PublishedSeriesInfo,
  ): void {
    const seriesDoc = this.tenant.docRef<StoredPublishedSeries>(PUBLISHED_SERIES_PATH, publishedSeriesId);
    const publishedSeries: StoredPublishedSeries = {
      id: publishedSeriesId,
      name: publishedSeriesName,
      fleetId: fleetId,
      competitors: compactSeriesResults(results),
      divisionDefinitions,
      racesSailed: info.racesSailed,
      discards: info.discards,
      cancelledRaces: info.cancelledRaces,
      resultsState: info.resultsState,
      raceStarts: info.raceStarts,
      ...(info.scoringAlgorithm ? { scoringAlgorithm: info.scoringAlgorithm } : {}),
    };
    batch.set(seriesDoc, publishedSeries);
  }

  /**
   * Writes scored races whose content differs from the stored copy. Every race is rescored
   * because some points depend on the whole series (e.g. DNC points grow with entries), so
   * races other than the edited one can change too.
   */
  private savePublishedRaces(batch: WriteBatch, publishedSeriesId: string, scoredRaces: PublishedRace[], existingRaces: PublishedRace[]): void {
    const storedById = new Map(existingRaces.map(r => [r.id, r] as const));
    scoredRaces.forEach(race => {
      const stored = storedById.get(race.id);
      if (stored && samePublishedContent(race, stored)) return;
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
    const currentConfigIds = new Set([
      ...configsToScore.map(c => c.id === series.primaryScoringConfiguration.id ? series.id : `${series.id}_${c.id}`),
      ...(series.divisions ?? [])
        .filter(d => d.scoreAs === 'separateSeries')
        .map(d => `${series.id}_div_${d.id}`),
    ]);
    for (const [, seasonData] of seasonUpdates) {
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

  /** Reads the published season into `updates` (once per publish) so series can be added to it. */
  private async loadSeason(updates: Map<string, PublishedSeason>, seasonId: string): Promise<void> {
    if (updates.has(seasonId)) return;
    const stored = await this.readPublishedSeason(seasonId);
    if (updates.has(seasonId)) return;
    const seasonName = this.clubStore.club().seasons.find(s => s.id === seasonId)?.name || 'Unknown Season';
    updates.set(seasonId, stored ?? { id: seasonId, name: seasonName, series: [] });
  }

  private prepareSeasonUpdate(
    updates: Map<string, PublishedSeason>,
    series: Series,
    publishedSeriesId: string,
    publishedSeriesName: string,
    config: ScoringConfiguration,
    raceCount: number,
    recentRaceCount6d: number,
    lastPublishedRaceStart: Date | undefined,
  ): void {
    const seasonData = updates.get(series.seasonId);
    if (!seasonData) throw new Error(`ScoringEngine: season ${series.seasonId} not loaded`);

    const seriesInfo: SeriesInfo = {
      id: publishedSeriesId,
      baseSeriesId: series.id,
      name: publishedSeriesName,
      fleetId: config.fleet.id,
      handicapScheme: config.handicapScheme,
      startDate: series.startDate || new Date(),
      endDate: series.endDate || new Date(),
      raceCount: raceCount,
      recentRaceCount6d,
    };
    if (lastPublishedRaceStart) {
      seriesInfo.lastPublishedRaceStart = lastPublishedRaceStart;
    }

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

  /** Counts races whose local race-date falls in the rolling N-day window (inclusive). */
  private recentRaceCount(races: Race[], days: number): number {
    const cutoffDay = startOfDay(subDays(new Date(), days)).getTime();
    return races.filter(r => startOfDay(r.actualStart ?? r.scheduledStart).getTime() >= cutoffDay).length;
  }

  /** Returns the latest scheduledStart across the supplied races, or undefined. */
  private latestScheduledStart(races: Race[]): Date | undefined {
    if (races.length === 0) return undefined;
    let latest = races[0].scheduledStart;
    for (const r of races) {
      if (r.scheduledStart > latest) {
        latest = r.scheduledStart;
      }
    }
    return latest;
  }
}
