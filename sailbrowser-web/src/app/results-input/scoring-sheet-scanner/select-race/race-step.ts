import { Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { RacesPanel } from 'app/race-calender/presentation/races-panel/races-panel';
import type { RacesPanelFilter } from 'app/race-calender/presentation/races-panel/races-panel-utils';
import { RaceTitlePipe } from 'app/shared/pipes/race-title-pipe';
import { ScanSelectedRace } from './race-selection.store';

const SCANNER_RACE_FILTERS: readonly RacesPanelFilter[] = ['past', 'hideCompleted'];

@Component({
  selector: 'app-race-step',
  imports: [MatCardModule, MatChipsModule, MatIconModule, RacesPanel, RaceTitlePipe],
  template: `
    @if (raceSelection.isLevelRatingSelection()) {
      <mat-chip-set class="selected-races" aria-label="Races on the scoring sheet">
        @for (race of raceSelection.selectedRaces(); track race.id) {
          <mat-chip-row removable (removed)="remove(race.id)">
            <span matChipContent>{{ race | racetitle }}</span>
            <button matChipRemove type="button" [attr.aria-label]="'Remove ' + (race | racetitle)">
              <mat-icon>cancel</mat-icon>
            </button>
          </mat-chip-row>
        }
      </mat-chip-set>
    }
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
    </mat-card>
    <p class="selection-hint">
      Selection of multiple Level Rating races, or a single handicap or pursuit race, is supported.
    </p>
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

  protected remove(raceId: string): void {
    this.raceSelection.selectMany(this.raceSelection.selectedRaceIds().filter(id => id !== raceId));
  }
}
