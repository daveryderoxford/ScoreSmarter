import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import { Race, RaceCalendarStore } from 'app/race-calender';
import { RaceTitlePipe } from 'app/shared/pipes/race-title-pipe';

export interface ScoringSheetRacePickerDialogData {
  preselectedRaceId?: string | null;
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
  selector: 'app-scoring-sheet-race-picker-dialog',
  template: `
    <h2 mat-dialog-title>Select races on Scoring Sheet</h2>
    <mat-dialog-content class="picker-content">
      @if (todayRaces().length === 0 && !showMoreDays()) {
        <p class="hint">No races scheduled today.</p>
      }

      <mat-radio-group
        class="race-radio-group"
        [value]="selectedId()"
        (change)="onRadioChange($event)">
        @if (todayRaces().length > 0) {
          <h3 class="group-heading">{{ todayHeading() }}</h3>
          @for (race of todayRaces(); track race.id) {
            <mat-radio-button class="race-option" [value]="race.id">
              {{ race | racetitle }}
            </mat-radio-button>
          }
        }

        @if (showMoreDays()) {
          @for (group of otherDayGroups(); track group.dateKey) {
            <h3 class="group-heading">{{ group.heading }}</h3>
            @for (race of group.races; track race.id) {
              <mat-radio-button class="race-option" [value]="race.id">
                {{ race | racetitle }}
              </mat-radio-button>
            }
          }
        }
      </mat-radio-group>

      @if (!showMoreDays() && otherDayGroups().length > 0) {
        <button type="button" mat-button class="more-dates" (click)="showMoreDays.set(true)">
          More dates…
        </button>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="selectedId()" [disabled]="!selectedId()">
        OK
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
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
      color: rgba(0, 0, 0, 0.6);
    }
    .group-heading {
      margin: 12px 0 4px;
      font-size: 0.875rem;
      font-weight: 500;
      color: rgba(0, 0, 0, 0.7);
    }
    .group-heading:first-of-type {
      margin-top: 0;
    }
    .race-radio-group {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 4px;
    }
    .race-option {
      margin: 2px 0;
      white-space: normal;
      line-height: 1.35;
    }
    .more-dates {
      align-self: flex-start;
      margin-top: 4px;
    }
  `],
  imports: [MatDialogModule, MatButtonModule, MatRadioModule, RaceTitlePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoringSheetRacePickerDialog {
  protected readonly raceStore = inject(RaceCalendarStore);
  private readonly data = inject(MAT_DIALOG_DATA, { optional: true }) as ScoringSheetRacePickerDialogData | null;

  protected readonly showMoreDays = signal(false);

  protected readonly selectedId = signal<string | null>(this.data?.preselectedRaceId ?? null);

  protected readonly todayRaces = computed(() =>
    this.raceStore.allRaces().filter(isScheduledToday).sort(sortRacesByTimeThenIndex),
  );

  protected readonly todayHeading = computed(() => dayHeading(new Date()));

  protected readonly otherDayGroups = computed((): DayGroup[] => {
    const races = this.raceStore
      .allRaces()
      .filter(r => !isScheduledToday(r))
      .sort(sortRacesByTimeThenIndex);

    const byDay = new Map<string, Race[]>();
    for (const race of races) {
      const key = new Date(race.scheduledStart).toDateString();
      const list = byDay.get(key);
      if (list) {
        list.push(race);
      } else {
        byDay.set(key, [race]);
      }
    }

    return [...byDay.entries()]
      .sort((a, b) => new Date(a[1][0].scheduledStart).getTime() - new Date(b[1][0].scheduledStart).getTime())
      .map(([dateKey, dayRaces]) => ({
        dateKey,
        heading: dayHeading(dayRaces[0].scheduledStart),
        races: dayRaces,
      }));
  });

  protected onRadioChange(event: MatRadioChange): void {
    this.selectedId.set(event.value ?? null);
  }
}
