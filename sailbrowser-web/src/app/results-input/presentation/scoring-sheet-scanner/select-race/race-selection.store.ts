import { computed, inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ClubStore } from 'app/club-tenant';
import { getFleetName } from 'app/club-tenant/model/fleet';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { format } from 'date-fns';
import { firstValueFrom } from 'rxjs';
import { CurrentRaces } from '../../../services/current-races-store';
import { ManualResultsService } from '../../../services/manual-results.service';
import { RaceStartTimeDialog, RaceStartTimeResult } from '../../handicap/race-start-time-dialog';
import { StartTimesSummary } from '../scan-model';

/**
 * Area 1 — owns the selected race and its start-time configuration (read + set).
 * Container-scoped; provided by the scanner container so all steps share one
 * instance and state resets when the scanner is left.
 */
@Injectable()
export class RaceSelectionStore {
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  private readonly clubStore = inject(ClubStore);
  private readonly currentRaces = inject(CurrentRaces);
  private readonly manualResults = inject(ManualResultsService);
  private readonly dialog = inject(MatDialog);

  private readonly _selectedRaceId = signal<string | null>(null);
  readonly selectedRaceId = this._selectedRaceId.asReadonly();
  readonly error = signal<string | null>(null);

  readonly raceOptions = computed<readonly Race[]>(() => this.raceCalendarStore.allRaces());

  readonly selectedRace = computed<Race | null>(() => {
    const id = this._selectedRaceId();
    if (!id) return null;
    return this.raceCalendarStore.allRaces().find((r: Race) => r.id === id) ?? null;
  });

  readonly hasConfiguredStartTimes = computed(() => {
    const race = this.selectedRace();
    return !!race && this.hasConfiguredStarts(race);
  });

  readonly startTimesSummary = computed<StartTimesSummary>(() => {
    const race = this.selectedRace();
    if (!race) {
      return {
        title: 'Start Times',
        configured: false,
        lines: ['Select a race to configure start times.'],
      };
    }
    const starts = race.starts ?? [];
    if (starts.length > 0) {
      return {
        title: 'Start Times',
        configured: true,
        lines: starts.map((start, index) => {
          const fleetLabel = start.fleetId ? this.getFleetName(start.fleetId) : `Start ${index + 1}`;
          return `${fleetLabel}: ${this.formatTimeOnly(start.timeOfDay)}`;
        }),
      };
    }
    if (race.actualStart) {
      return {
        title: 'Start Times',
        configured: true,
        lines: [`Actual start: ${this.formatTimeOnly(race.actualStart)}`],
      };
    }
    return {
      title: 'Start Times',
      configured: false,
      lines: ['No start times configured.'],
    };
  });

  select(raceId: string): void {
    this._selectedRaceId.set(raceId || null);
    if (raceId) this.currentRaces.addRaceId(raceId);
  }

  clear(): void {
    this._selectedRaceId.set(null);
  }

  async setStartTimes(): Promise<boolean> {
    const race = this.selectedRace();
    if (!race) {
      this.error.set('Select a race first.');
      return false;
    }
    const dialog = this.dialog.open<RaceStartTimeDialog, { race: Race }, RaceStartTimeResult>(
      RaceStartTimeDialog,
      { data: { race } },
    );
    const result = await firstValueFrom(dialog.afterClosed());
    if (!result) return false;
    await this.manualResults.setStartTime(race.id, result.starts, result.mode);
    this.error.set(null);
    return true;
  }

  async ensureStartTimesConfigured(): Promise<boolean> {
    const race = this.selectedRace();
    if (!race) {
      this.error.set('Select a race first.');
      return false;
    }
    if (this.hasConfiguredStarts(race)) return true;
    this.error.set('Set race start time(s) before saving accepted results.');
    return this.setStartTimes();
  }

  private hasConfiguredStarts(race: Race): boolean {
    return !!race.actualStart || !!race.starts?.length;
  }

  private getFleetName(fleetId: string): string {
    const fleet = this.clubStore.club().fleets.find(f => f.id === fleetId);
    return fleet ? getFleetName(fleet) : `Fleet ${fleetId}`;
  }

  private formatTimeOnly(value: Date): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Time unavailable';
    return format(date, 'HH:mm:ss');
  }
}
