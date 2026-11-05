import { computed, inject, Injectable, signal } from '@angular/core';
import { sortRaces, type Race } from 'app/race-calendar';
import { isWithinNextDays } from 'app/race-calendar/presentation/races-panel/races-panel-utils';
import { RaceCalendarStore } from '../../race-calendar/services/full-race-calendar';

/** Inclusive window matching self-entry eligibility (today through today + N days). */
export const UPCOMING_RACE_DAYS = 7;

/** Manages a list of 'currect races'
 * All information for currect races is held in memory
 */
@Injectable({
  providedIn: 'root',
})
export class CurrentRaces {
  private readonly raceStore = inject(RaceCalendarStore);

  /** Races opened explicitly (e.g. historical race from results viewer), not part of "today" auto-selection. */
  private readonly manuallyAddedRaceIds = signal<Set<string>>(new Set<string>());

  /** Fast lookups for races currently present in calendar cache (`allRaces` ids are unique). */
  private readonly allRacesById = computed(
    () => new Map(this.raceStore.allRaces().map(race => [race.id, race] as const)),
  );

  /** Today's race ids from calendar (set for uniqueness + quick union). */
  private readonly todaysRaceIds = computed(() => {
    const ids = new Set<string>();
    for (const race of this.allRacesById().values()) {
      if (isScheduledToday(race)) ids.add(race.id);
    }
    return ids;
  });

  /** Stable ordered list of today's races (date, start, race of day, series name). */
  readonly todaysRaces = computed(() => {
    return [...this.allRacesById().values()]
      .filter(isScheduledToday)
      .sort(sortRaces);
  });

  /** Races from today through the next {@link UPCOMING_RACE_DAYS} days (same window as self-entry). */
  readonly upcomingRaces = computed(() => {
    const now = new Date();
    return [...this.allRacesById().values()]
      .filter(race => isWithinNextDays(race, now, UPCOMING_RACE_DAYS))
      .sort(sortRaces);
  });

  /** Today's races (from calendar) plus any manual extras still present in `allRaces`. */
  readonly selectedRaceIds = computed(() => {
    const racesById = this.allRacesById();
    const todayIds = this.todaysRaceIds();
    const selected = new Set<string>(todayIds);
    for (const id of this.manuallyAddedRaceIds()) {
      if (!racesById.has(id)) continue; // ignore stale ids
      selected.add(id);
    }
    // Preserve deterministic order: today's races first, then manual extras by the shared race order.
    const orderedToday = this.todaysRaces().map(race => race.id);
    const manualExtras = [...selected]
      .filter(id => !todayIds.has(id))
      .map(id => racesById.get(id))
      .filter((race): race is Race => race != null)
      .sort(sortRaces)
      .map(race => race.id);

    return [...orderedToday, ...manualExtras];
  });

  /** Order-independent key; changes only when the selected race id set changes. */
  readonly selectedRaceIdsKey = computed(() => {
    const ids = this.selectedRaceIds();
    return ids.length === 0 ? '' : ids.slice().sort().join('\0');
  });

  readonly selectedRaces = computed(() => {
    const racesById = this.allRacesById();
    return this.selectedRaceIds()
      .map(id => racesById.get(id))
      .filter((race): race is Race => race != null);
  });

  readonly selectedSeries = computed(() => {
    const selectedRaces = this.selectedRaces();
    const seriesIds = [...new Set(selectedRaces.map(race => race.seriesId))];
    const allSeries = this.raceStore.allSeries();
    return allSeries.filter(series => seriesIds.includes(series.id));
  });

  /**
   * Selected plus upcoming races, sorted by id. Competitor rows and series entries are
   * kept in memory for these races so entry lists and duplicate checks see future entries.
   */
  readonly loadedRaces = computed(() => {
    const byId = new Map<string, Race>();
    for (const race of [...this.selectedRaces(), ...this.upcomingRaces()]) byId.set(race.id, race);
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  });

  readonly loadedRaceIds = computed(() => this.loadedRaces().map(race => race.id));

  /** Changes only when the loaded race id set changes. */
  readonly loadedRaceIdsKey = computed(() => this.loadedRaceIds().join('\0'));

  /** Series owning {@link loadedRaces}, sorted. */
  readonly loadedSeriesIds = computed(() =>
    [...new Set(this.loadedRaces().map(race => race.seriesId))].sort(),
  );

  /** Changes only when the loaded series id set changes. */
  readonly loadedSeriesIdsKey = computed(() => this.loadedSeriesIds().join('\0'));

  addRaceId = (raceId: string) =>
    this.manuallyAddedRaceIds.update(ids => {
      if (ids.has(raceId)) return ids;
      const next = new Set(ids);
      next.add(raceId);
      return next;
    });

  removeRaceId = (raceId: string) =>
    this.manuallyAddedRaceIds.update(ids => {
      if (!ids.has(raceId)) return ids;
      const next = new Set(ids);
      next.delete(raceId);
      return next;
    });
}

function isScheduledToday(race: Race): boolean {
  return new Date(race.scheduledStart).toDateString() === new Date().toDateString();
}
