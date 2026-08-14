import { Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { RacesPanel } from 'app/race-calender/presentation/races-panel/races-panel';
import type { RacesPanelFilter } from 'app/race-calender/presentation/races-panel/races-panel-utils';
import { ScanSelectedRace } from './race-selection.store';

const SCANNER_RACE_FILTERS: readonly RacesPanelFilter[] = ['past', 'hideCompleted'];

@Component({
  selector: 'app-race-step',
  imports: [MatCardModule, RacesPanel],
  template: `
    <mat-card appearance="outlined" class="form-card">
      <app-races-panel
        [races]="raceSelection.raceOptions()"
        [selectedRaceIds]="selectedRaceIds()"
        [maxSelections]="20"
        [availableFilters]="filters"
        (selectedRaceIdsChange)="onSelectionChange($event)" />
      @if (raceSelection.error()) {
        <p class="selection-error">{{ raceSelection.error() }}</p>
      }
      <p class="selection-hint">
        Select the race(s) on the scoring sheet.
        @if (raceSelection.isLevelRatingSelection()) {
          Level Rating sheets may include several races.
        }
      </p>
    </mat-card>
  `,
  styleUrl: './race-step.scss',
})
export class RaceStep {
  protected readonly raceSelection = inject(ScanSelectedRace);
  protected readonly filters = SCANNER_RACE_FILTERS;

  readonly selectedRaceIds = computed<readonly string[]>(() => this.raceSelection.selectedRaceIds());

  onSelectionChange(ids: string[]): void {
    this.raceSelection.selectMany(ids);
  }
}
