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
        [maxSelections]="1"
        [availableFilters]="filters"
        (selectedRaceIdsChange)="onSelectionChange($event)" />
    </mat-card>
  `,
  styleUrl: './race-step.scss',
})
export class RaceStep {
  protected readonly raceSelection = inject(ScanSelectedRace);
  protected readonly filters = SCANNER_RACE_FILTERS;

  readonly selectedRaceIds = computed<readonly string[]>(() => {
    const id = this.raceSelection.selectedRaceId();
    return id ? [id] : [];
  });

  onSelectionChange(ids: string[]): void {
    this.raceSelection.select(ids[0] ?? '');
  }
}
