import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { DatePipe } from '@angular/common';
import { RaceCalendarStore } from 'app/race-calender';
import { CurrentRaces } from 'app/results-input';

@Component({
  selector: 'app-more-races-dialog',
  template: `
    <h2 mat-dialog-title>Select Races</h2>
    <mat-dialog-content>
      <mat-list>
        @for (race of raceStore.allRaces(); track race.id) {
          <mat-list-item (click)="selectRace(race.id)">
            <div matListItemTitle>{{ race.seriesName }} - Race {{ race.raceOfDay }}</div>
            <div matListItemLine>{{ race.scheduledStart | date: "dd/MM/yy HH:mm" }}</div>
          </mat-list-item>
        }
      </mat-list>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-list-item { cursor: pointer; }
    mat-list-item:hover { background-color: rgba(0,0,0,0.04); }
  `],
  imports: [MatDialogModule, MatButtonModule, MatListModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoreRacesDialog {
  private dialogRef = inject(MatDialogRef<MoreRacesDialog>);
  protected readonly raceStore = inject(RaceCalendarStore);
  private readonly currentRacesStore = inject(CurrentRaces);

  selectRace(raceId: string) {
    this.currentRacesStore.addRaceId(raceId);
    this.dialogRef.close(raceId);
  }
}
