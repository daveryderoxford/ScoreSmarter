import { computed, inject, Injectable, signal } from '@angular/core';
import type { Race } from 'app/race-calender';
import { RaceCalendarStore } from '../../race-calender/services/full-race-calander';

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

  /** Stable ordered list of today's races (time/index), no manual extras. */
  readonly todaysRaces = computed(() => {
    return [...this.allRacesById().values()]
      .filter(isScheduledToday)
      .sort(sortRacesByTimeThenIndex);
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
    // Preserve deterministic order: today's races first, then manual extras by race time/index.
    const orderedToday = this.todaysRaces().map(race => race.id);
    const manualExtras = [...selected]
      .filter(id => !todayIds.has(id))
      .map(id => racesById.get(id))
      .filter((race): race is Race => race != null)
      .sort(sortRacesByTimeThenIndex)
      .map(race => race.id);

    return [...orderedToday, ...manualExtras];
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

  addRaceId = (raceId: string) =>
    this.manuallyAddedRaceIds.update(ids => {
      const next = new Set(ids);
      next.add(raceId);
      return next;
    });

  removeRaceId = (raceId: string) =>
    this.manuallyAddedRaceIds.update(ids => {
      const next = new Set(ids);
      next.delete(raceId);
      return next;
    });
}

function isScheduledToday(race: Race): boolean {
  return new Date(race.scheduledStart).toDateString() === new Date().toDateString();
}

function sortRacesByTimeThenIndex(a: Race, b: Race): number {
  return a.scheduledStart.getTime() - b.scheduledStart.getTime() || a.index - b.index;
}
