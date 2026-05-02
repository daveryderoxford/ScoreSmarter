import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from "@angular/material/icon";
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from "@angular/router";
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { CenteredText } from "app/shared/components/centered-text";
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { Toolbar } from 'app/shared/components/toolbar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { RaceTitlePipe } from "app/shared/pipes/race-title-pipe";
import { RaceCompetitor } from '../../results-input/model/race-competitor';
import { ResolvedRaceCompetitor } from '../../results-input/model/resolved-race-competitor';
import { CurrentRaces } from '../../results-input/services/current-races-store';
import { RaceCompetitorMutator } from '../../results-input/services/race-competitor-mutator';
import { RaceCompetitorReader } from '../../results-input/services/race-competitor-reader';
import { BoatEntrySummaryComponent } from "./entry-summary";

@Component({
  selector: 'app-entries-list-page',
  imports: [
    Toolbar,
    MatListModule,
    MatSelectModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    LoadingCentered,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    CenteredText,
    BoatEntrySummaryComponent,
    RaceTitlePipe
  ],
  template: `
    <app-toolbar title="Entries"></app-toolbar>
    <div class="content">
       <a matFab extended class="entry-button"  [routerLink]="['/entry', 'enter']">
          Enter Races
        </a>
        <mat-form-field class=search>
          <mat-label>View</mat-label>
          <mat-select [formControl]="raceSelector">
            <mat-option [value]="'all'">All Races</mat-option>
            @for (race of currentRaces.selectedRaces(); track race.id) {
              <mat-option [value]="race.id">
                {{ race | racetitle}}
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

      @if (reader.loading()) {
        <app-loading-centered/>
      } @else if (filtered().length === 0) {
          <app-centered-text>No entries for this selection</app-centered-text>
      } @else {
        @if (raceFilter() === 'all') {
          <app-boat-entry-summary [competitors]="resolved()" [races]="currentRaces.selectedRaces()"/>
        } @else {
          <mat-list class="dense-list">
            @for (comp of filtered(); track comp.id) {
              <mat-list-item>
                 <span matListItemTitle>
                      <span class=gap>{{ comp.boatClass }} {{ comp.sailNumber }}</span>
                        <span>{{ comp.helm }}</span>
                  </span>
                <span matListItemLine>
                    <span class=gap>Handicap: {{displayHandicap(comp)}}</span>
                  @if (comp.resultCode !== 'NOT FINISHED') { 
                     Finished
                  }
              </span>
                <span matListItemMeta>
                  <button matIconButton (click)="delete(comp)">
                    <mat-icon class="warning">delete</mat-icon>
                  </button>
                </span>
                <mat-divider />
              </mat-list-item>
            }
          </mat-list>
        }
      }
    </div>
  `,
  styles: [`
    @use "mixins" as mix;

    @include mix.centered-column-page(".content", 400px);

    .entry-button {
      margin-top: 16px;
      align-self: center;
    }

    .search {
      margin-top: 16px;
      width: 300px;
    }

    h2 {
      margin-top: 24px;
      margin-bottom: 8px;
    }

    .warning {
      color: var(--mat-sys-error);
    }

    .gap {
      margin-right: 12px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntriesListPage {
  protected readonly reader = inject(RaceCompetitorReader);
  private readonly mutator = inject(RaceCompetitorMutator);
  protected currentRaces = inject(CurrentRaces);
  protected ds = inject(DialogsService);
  protected snackbar = inject(MatSnackBar);

  raceSelector = new FormControl<string>('all');

  private readonly displayScheme: HandicapScheme = 'PY';

  raceFilter = toSignal(this.raceSelector.valueChanges, { initialValue: 'all' });

  resolved = this.reader.selectedResolvedCompetitors;

  filtered = computed(() =>
    this.resolved().filter(c => filter(c, this.raceFilter()!))
  );

  displayHandicap(comp: ResolvedRaceCompetitor): number | undefined {
    return comp.handicapForScheme(this.displayScheme);
  }

  async delete(comp: RaceCompetitor) {
    if (comp.manualFinishTime || comp.recordedFinishTime) {
      this.snackbar.open('Cannot delete an entry who has finished', "Dismiss", { duration: 3000 });
      return;
    }
    const confirmed = await this.ds.confirm("Delete competitor", "Delete competitor");
    if (confirmed) {
      try {
        await this.mutator.deleteRaceCompetitor(comp);
      } catch (error: any) {
        this.snackbar.open("Error encountered deleting entry", "Dismiss", { duration: 3000 });
        console.log('EntriesListPage. Error deleting entry: ' + error.toString());
      }
    }
  }
}

function filter(comp: ResolvedRaceCompetitor, filter: string) {
  return (filter === 'all') || filter === comp.raceId;
}
