import { Component, input, output
 } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import type { Race } from 'app/race-calender';
import { RacesPanel } from 'app/race-calender/presentation/races-panel/races-panel';
import type { RacesPanelFilter } from 'app/race-calender/presentation/races-panel/races-panel-utils';

const SCANNER_RACE_FILTERS: readonly RacesPanelFilter[] = ['past', 'hideCompleted'];

@Component({
  selector: 'app-race-step',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    RacesPanel,
  ],
  template: `
    <mat-card appearance="outlined" class="form-card">
      <form [formGroup]="form()">
        <app-races-panel
          [races]="races()"
          [selectedRaceIds]="selectedRaceIds()"
          [maxSelections]="1"
          [availableFilters]="filters"
          (selectedRaceIdsChange)="raceSelectionChange.emit($event)" />
      </form>
    </mat-card>
  `,
  styleUrl: './race-step.scss',
})
export class RaceStep {
  form = input.required<FormGroup>();
  races = input.required<readonly Race[]>();
  selectedRaceIds = input<readonly string[]>([]);
  raceSelectionChange = output<string[]>();

  protected readonly filters = SCANNER_RACE_FILTERS;
}

