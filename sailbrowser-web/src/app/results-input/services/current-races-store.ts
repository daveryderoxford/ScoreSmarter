import { computed, inject, Injectable, signal, effect } from '@angular/core';
import { RaceCalendarStore } from '../../race-calender/services/full-race-calander';

/** Manages a list of 'currect races'
 * All information for currect races is held in memory
 */
@Injectable({
   providedIn: 'root',
})
export class CurrentRaces {
  private readonly raceStore = inject(RaceCalendarStore);
  readonly selectedRaceIds = signal<string[]>([]);

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

  constructor() {
    effect(() => {
      // Initialize with today's races
      const todayStr = new Date().toDateString();
      const todaysRaceIds = this.raceStore.allRaces()
        .filter(race => new Date(race.scheduledStart).toDateString() === todayStr)
        .map(race => race.id);
      this.selectedRaceIds.set(todaysRaceIds);
    });
  }

  addRaceId = (raceId: string) => this.selectedRaceIds.update(races => {
    if (races.includes(raceId)) return races;
    return [...races, raceId];
  });
  removeRaceId = (raceId: string) => this.selectedRaceIds.update(races => races.filter(id => id !== raceId));
}
