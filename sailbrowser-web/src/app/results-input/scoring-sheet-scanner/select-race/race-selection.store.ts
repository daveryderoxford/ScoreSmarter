import { computed, inject, Injectable, signal } from '@angular/core';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { CurrentRaces } from '../../services/current-races-store';

/**
 * Area 1 — owns the selected race for the scanner flow.
 * Container-scoped; provided by the scanner container so all steps share one
 * instance and state resets when the scanner is left.
 */
@Injectable()
export class RaceSelectionStore {
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  private readonly currentRaces = inject(CurrentRaces);

  private readonly _selectedRaceId = signal<string | null>(null);
  readonly selectedRaceId = this._selectedRaceId.asReadonly();
  readonly error = signal<string | null>(null);

  readonly raceOptions = computed<readonly Race[]>(() => this.raceCalendarStore.allRaces());

  readonly selectedRace = computed<Race | null>(() => {
    const id = this._selectedRaceId();
    if (!id) return null;
    return this.raceCalendarStore.allRaces().find((r: Race) => r.id === id) ?? null;
  });

  select(raceId: string): void {
    this._selectedRaceId.set(raceId || null);
    if (raceId) this.currentRaces.addRaceId(raceId);
  }

  clear(): void {
    this._selectedRaceId.set(null);
  }
}
