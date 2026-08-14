import { computed, inject, Injectable, signal } from '@angular/core';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { CurrentRaces } from '../../services/current-races-store';

/**
 * Area 1 — owns selected race(s) for the scanner flow.
 * Container-scoped; provided by the scanner container so all steps share one
 * instance and state resets when the scanner is left.
 *
 * Any number of races may be selected for both Level Rating and handicap scans
 * (`races` is always populated). Handicap multi-race parsing may come later.
 */
@Injectable()
export class ScanSelectedRace {
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  private readonly currentRaces = inject(CurrentRaces);

  private readonly _selectedRaceIds = signal<string[]>([]);
  readonly selectedRaceIds = this._selectedRaceIds.asReadonly();
  readonly error = signal<string | null>(null);

  readonly raceOptions = computed<readonly Race[]>(() => this.raceCalendarStore.allRaces());

  /** First selected race id — session key for sheet storage / stored scan. */
  readonly selectedRaceId = computed(() => this._selectedRaceIds()[0] ?? null);

  readonly selectedRaces = computed<readonly Race[]>(() => {
    const ids = this._selectedRaceIds();
    if (ids.length === 0) return [];
    const byId = new Map(this.raceCalendarStore.allRaces().map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is Race => !!r);
  });

  readonly selectedRace = computed<Race | null>(() => this.selectedRaces()[0] ?? null);

  /** True when every selected race is Level Rating (drives LR scan mode / prompt). */
  readonly isLevelRatingSelection = computed(() => {
    const races = this.selectedRaces();
    return races.length > 0 && races.every((r) => r.type === 'Level Rating');
  });

  selectMany(raceIds: string[]): void {
    const unique = [...new Set(raceIds.filter(Boolean))];
    this.error.set(null);
    this._selectedRaceIds.set(unique);
    for (const id of unique) {
      this.currentRaces.addRaceId(id);
    }
  }

  select(raceId: string): void {
    this.selectMany(raceId ? [raceId] : []);
  }

  clear(): void {
    this._selectedRaceIds.set([]);
    this.error.set(null);
  }
}
