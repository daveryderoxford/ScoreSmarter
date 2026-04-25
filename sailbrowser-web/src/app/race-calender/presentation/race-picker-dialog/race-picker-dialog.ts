import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import type { Race } from '../../model/race';
import { RaceCalendarStore } from '../../services/full-race-calander';
import { RaceTitlePipe } from 'app/shared/pipes/race-title-pipe';
import { groupBy } from 'app/shared/utils/group-by';

export interface RacePickerDialogData {
  title: string;
  /** Ids selected when the dialog opens. */
  preselectedRaceIds?: string[];
  /** At most this many races (e.g. `1` for scoring sheet). Omit for unlimited. */
  maxSelections?: number;
  /** If true (default), OK stays disabled until at least one race is selected. */
  requireSelection?: boolean;
}

interface DayGroup {
  readonly dateKey: string;
  readonly heading: string;
  readonly races: Race[];
}

function isScheduledToday(race: Race): boolean {
  return new Date(race.scheduledStart).toDateString() === new Date().toDateString();
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
      @if (todayRaces().length === 0 && !showMoreDays() && otherDayGroups().length === 0) {
        <p class="hint">No upcoming races in calendar.</p>
      } @else if (todayRaces().length === 0 && !showMoreDays()) {
        <p class="hint">No races scheduled today.</p>
      }

      @if (todayRaces().length > 0) {
        <h3 class="group-heading">{{ todayHeading() }}</h3>
        @for (race of todayRaces(); track race.id) {
          <mat-checkbox
            class="race-option"
            [checked]="isSelected(race.id)"
            (change)="onToggle(race.id, $event.checked)">
            {{ race | racetitle }}
          </mat-checkbox>
        }
      }

      @if (showMoreDays()) {
        @for (group of otherDayGroups(); track group.dateKey) {
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

      @if (!showMoreDays() && otherDayGroups().length > 0) {
        <button type="button" mat-button class="more-dates" (click)="showMoreDays.set(true)">
          More races…
        </button>
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
      gap: 8px;
      max-height: min(60vh, 520px);
      min-width: min(92vw, 420px);
      overflow-y: auto;
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
    .more-dates {
      align-self: flex-start;
      margin-top: 4px;
    }
  `,
  imports: [MatDialogModule, MatButtonModule, MatCheckboxModule, RaceTitlePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RacePickerDialog {
  protected readonly data = inject<RacePickerDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RacePickerDialog, string[] | undefined>);
  protected readonly raceStore = inject(RaceCalendarStore);

  protected readonly showMoreDays = signal(false);

  private readonly maxSelections = this.data.maxSelections;
  private readonly requireSelection = this.data.requireSelection ?? true;

  private readonly selectedIds = signal<Set<string>>(
    new Set(this.data.preselectedRaceIds?.filter(Boolean) ?? []),
  );

  protected readonly todayRaces = computed(() =>
    this.raceStore.allRaces().filter(isScheduledToday).sort(sortRacesByTimeThenIndex),
  );

  protected readonly todayHeading = computed(() => dayHeading(new Date()));

  protected readonly otherDayGroups = computed((): DayGroup[] => {
    const races = this.raceStore
      .allRaces()
      .filter(r => !isScheduledToday(r))
      .sort(sortRacesByTimeThenIndex);

    const byDay = groupBy(races, race => new Date(race.scheduledStart).toDateString());

    return [...byDay.entries()]
      .sort((a, b) => new Date(a[1][0].scheduledStart).getTime() - new Date(b[1][0].scheduledStart).getTime())
      .map(([dateKey, dayRaces]) => ({
        dateKey,
        heading: dayHeading(dayRaces[0].scheduledStart),
        races: dayRaces,
      }));
  });

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
