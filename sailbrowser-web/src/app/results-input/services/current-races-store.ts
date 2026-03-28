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
  private readonly manuallyAddedRaceIds = signal<string[]>([]);

  /** Today's races (from calendar) plus any manual extras still present in `allRaces`. */
  readonly selectedRaceIds = computed(() => {
    const allRaces = this.raceStore.allRaces();
    const todayIds = raceIdsScheduledToday(allRaces);
    const manual = this.manuallyAddedRaceIds();
    const selected: string[] = [...todayIds];
    for (const id of manual) {
      if (!allRaces.some(r => r.id === id)) continue;
      if (todayIds.includes(id)) continue;
      if (!selected.includes(id)) selected.push(id);
    }
    return selected;
  });

  readonly selectedRaces = computed(() => {
    const races = this.raceStore.allRaces();
    const selectedIds = this.selectedRaceIds();
    return races.filter(race => selectedIds.includes(race.id));
  });

  readonly selectedSeries = computed(() => {
    const selectedRaces = this.selectedRaces();
    const seriesIds = [...new Set(selectedRaces.map(race => race.seriesId))];
    const allSeries = this.raceStore.allSeries();
    return allSeries.filter(series => seriesIds.includes(series.id));
  });

  addRaceId = (raceId: string) =>
    this.manuallyAddedRaceIds.update(ids => (ids.includes(raceId) ? ids : [...ids, raceId]));

  removeRaceId = (raceId: string) =>
    this.manuallyAddedRaceIds.update(ids => ids.filter(id => id !== raceId));
}

function raceIdsScheduledToday(allRaces: Race[]): string[] {
  const todayStr = new Date().toDateString();
  return allRaces
    .filter(race => new Date(race.scheduledStart).toDateString() === todayStr)
    .map(race => race.id);
}
