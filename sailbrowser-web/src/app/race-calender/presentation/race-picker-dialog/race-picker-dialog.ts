import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import type { Race } from '../../model/race';
import type { RaceStatus } from '../../model/race-status';
import { RaceCalendarStore } from '../../services/full-race-calander';
import { RaceTitlePipe } from 'app/shared/pipes/race-title-pipe';
import { groupBy } from 'app/shared/utils/group-by';
import {
  dayGroupSortDirection,
  DEFAULT_PERIODS_BY_MODE,
  DEFAULT_PERIOD_BY_MODE,
  includesRace,
  pickInitialPeriod,
  type RacePickerMode,
  type RacePickerPeriod,
} from './race-picker-filters';

export interface RacePickerDialogData {
  title: string;
  /** Ids selected when the dialog opens. */
  preselectedRaceIds?: string[];
  /** At most this many races (e.g. `1` for scoring sheet). Omit for unlimited. */
  maxSelections?: number;
  /** If true (default), OK stays disabled until at least one race is selected. */
  requireSelection?: boolean;
  mode?: RacePickerMode;
  defaultPeriod?: RacePickerPeriod;
  availablePeriods?: RacePickerPeriod[];
  hideIncompleteDefault?: boolean;
  /** Explicit status allow-list (overrides statusFilter mapping when provided). */
  includeStatuses?: RaceStatus[];
}

interface DayGroup {
  readonly dateKey: string;
  readonly heading: string;
  readonly races: Race[];
}

function sortRacesByTimeThenIndex(a: Race, b: Race): number {
  return a.scheduledStart.getTime() - b.scheduledStart.getTime() || a.index - b.index;
}

function dayHeading(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

@Component({
  selector: 'app-race-picker-dialog',
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content class="picker-content">
      @if (availablePeriods().length > 0) {
        <div class="chip-row">
          <mat-chip-listbox class="period-chips" [multiple]="false">
            @for (period of availablePeriods(); track period) {
              <mat-chip-option
                [selected]="selectedPeriod() === period"
                (selectionChange)="onPeriodChipChange(period, $event.selected)">
                {{ periodLabel(period) }}
              </mat-chip-option>
            }
          </mat-chip-listbox>
          @if (showHideIncompleteToggle()) {
            <mat-chip-listbox class="single-chip" [multiple]="false">
              <mat-chip-option
                [selected]="hideIncomplete()"
                (selectionChange)="onHideIncompleteChipChange($event.selected)">
                Hide complete
              </mat-chip-option>
            </mat-chip-listbox>
          }
        </div>
      }

      @if (dayGroups().length === 0) {
        <p class="hint">No races found for the selected filters.</p>
      } @else {
        @for (group of dayGroups(); track group.dateKey) {
          <h3 class="group-heading">{{ group.heading }}</h3>
          @for (race of group.races; track race.id) {
          <mat-checkbox
            class="race-option"
            [checked]="isSelected(race.id)"
            (change)="onToggle(race.id, $event.checked)">
            {{ race | racetitle }}
          </mat-checkbox>
        }
      }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancel()">Cancel</button>
      <button matButton="filled" type="button" [disabled]="!canConfirm()" (click)="confirm()">
        OK
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .picker-content {
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: min(60vh, 520px);
      min-width: min(92vw, 420px);
      overflow-y: auto;
    }
    .period-chips {
      width: 100%;
    }
    .chip-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .period-chips {
      flex: 1 1 auto;
      min-width: 0;
    }
    .single-chip {
      flex: 0 0 auto;
    }
    .hint {
      margin: 0 0 4px;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
    }
    .group-heading {
      margin: 12px 0 4px;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.7));
    }
    .group-heading:first-of-type {
      margin-top: 0;
    }
    .race-option {
      margin: 2px 0;
      white-space: normal;
      line-height: 1.35;
      display: block;
    }
  `,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    RaceTitlePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RacePickerDialog {
  protected readonly data = inject<RacePickerDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RacePickerDialog, string[] | undefined>);
  protected readonly raceStore = inject(RaceCalendarStore);
  private readonly maxSelections = this.data.maxSelections;
  private readonly requireSelection = this.data.requireSelection ?? true;
  private readonly mode: RacePickerMode = this.data.mode ?? 'results';
  private readonly now = signal(new Date());

  private readonly selectedIds = signal<Set<string>>(
    new Set(this.data.preselectedRaceIds?.filter(Boolean) ?? []),
  );
  protected readonly availablePeriods = computed(() => {
    return this.data.availablePeriods ?? DEFAULT_PERIODS_BY_MODE[this.mode];
  });
  protected readonly showHideIncompleteToggle = computed(() => this.mode === 'results' || this.mode === 'scanner');
  protected readonly hideIncomplete = signal<boolean>(this.data.hideIncompleteDefault ?? this.showHideIncompleteToggle());
  protected readonly selectedPeriod = signal<RacePickerPeriod>(
    pickInitialPeriod(
      this.availablePeriods(),
      this.data.defaultPeriod ?? DEFAULT_PERIOD_BY_MODE[this.mode],
      this.raceStore.allRaces(),
      this.data.preselectedRaceIds ?? [],
      this.now(),
    ),
  );

  protected readonly filteredRaces = computed(() => {
    const period = this.selectedPeriod();
    return this.raceStore
      .allRaces()
      .filter(race =>
        includesRace(
          race,
          period,
          this.now(),
          this.showHideIncompleteToggle() ? this.hideIncomplete() : false,
          this.data.includeStatuses,
        ),
      )
      .sort(sortRacesByTimeThenIndex);
  });

  protected readonly dayGroups = computed((): DayGroup[] => {
    const byDay = groupBy(this.filteredRaces(), race => new Date(race.scheduledStart).toDateString());
    const direction = dayGroupSortDirection(this.selectedPeriod());
    return [...byDay.entries()]
      .sort((a, b) => {
        const diff = new Date(a[1][0].scheduledStart).getTime() - new Date(b[1][0].scheduledStart).getTime();
        return direction === 'asc' ? diff : -diff;
      })
      .map(([dateKey, dayRaces]) => ({
        dateKey,
        heading: dayHeading(dayRaces[0].scheduledStart),
        races: dayRaces,
      }));
  });

  protected periodLabel(period: RacePickerPeriod): string {
    switch (period) {
      case 'today': return 'Today';
      case 'last7Days': return 'Last 7 days';
      case 'next7Days': return 'Next 7 days';
      case 'future': return 'Future';
      case 'past': return 'Past';
      case 'all': return 'All';
    }
  }

  protected onPeriodChipChange(period: RacePickerPeriod, selected: boolean): void {
    if (!selected) return;
    this.selectedPeriod.set(period);
  }

  protected onHideIncompleteChipChange(selected: boolean): void {
    this.hideIncomplete.set(selected);
  }

  protected isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  protected onToggle(id: string, checked: boolean): void {
    this.selectedIds.update(prev => {
      const next = new Set(prev);
      if (this.maxSelections === 1) {
        next.clear();
        if (checked) {
          next.add(id);
        }
        return next;
      }
      if (checked) {
        if (this.maxSelections != null && next.size >= this.maxSelections) {
          return prev;
        }
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  protected canConfirm(): boolean {
    if (!this.requireSelection) {
      return true;
    }
    return this.selectedIds().size > 0;
  }

  protected cancel(): void {
    this.dialogRef.close(undefined);
  }

  protected confirm(): void {
    if (!this.canConfirm()) {
      return;
    }
    this.dialogRef.close([...this.selectedIds()]);
  }
}
