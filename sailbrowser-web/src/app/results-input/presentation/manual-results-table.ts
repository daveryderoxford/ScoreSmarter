import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RaceType } from 'app/race-calender';
import { getHandicapValue } from 'app/scoring/model/handicap';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getCorrectedTime } from 'app/scoring/services/scorer-times';
import { DurationPipe } from 'app/shared/pipes/duration.pipe';
import { RaceCompetitor } from '../model/race-competitor';
import { ExtendedRaceCompetitor, manualRaceTableSort } from '../services/manual-results.service';

@Component({
  selector: 'app-manual-results-table',
  imports: [MatTableModule, DatePipe, DurationPipe, MatSortModule],
  styleUrl: './manual-results-table.scss',
  template: `
    <table mat-table matSort [dataSource]="tabledata()"
    (matSortChange)="this.sortState.set($event)" class="mat-elevation-z0">

      <ng-container matColumnDef="position">
        <th mat-header-cell mat-sort-header="manualPosition" *matHeaderCellDef>Pos</th>
        <td mat-cell *matCellDef="let element">
          {{element.manualPosition}}
        </td>
      </ng-container>
      
      <ng-container matColumnDef="boatClass">
        <th mat-header-cell mat-sort-header *matHeaderCellDef>Class<br>H'Cap</th>
        <td mat-cell *matCellDef="let element">
          {{element.boatClass}}<br>
          {{displayHandicap(element)}}
        </td>
      </ng-container>

      <ng-container matColumnDef="sailNumber">
        <th mat-header-cell mat-sort-header *matHeaderCellDef>Sail No</th>
        <td mat-cell *matCellDef="let element"> <b>{{element.sailNumber}} </b></td>
      </ng-container>

      <ng-container matColumnDef="helm">
        <th mat-header-cell mat-sort-header *matHeaderCellDef>Helm</th>
        <td mat-cell *matCellDef="let element"> {{element.helm}} </td>
      </ng-container>

      <ng-container matColumnDef="finishTime">
        <th mat-header-cell mat-sort-header="manualFinishTime" *matHeaderCellDef>Finish Time</th>
        <td mat-cell *matCellDef="let element"> {{element.manualFinishTime | date:'HH:mm:ss'}} </td>
      </ng-container>

      <ng-container matColumnDef="elapsedTime">
        <th mat-header-cell mat-sort-header *matHeaderCellDef>Elapsed</th>
        <td mat-cell *matCellDef="let element"> 
          {{element.elapsedTime | duration}}
          @if (element.resultCode !== 'OK' && element.resultCode !== 'NOT FINISHED') {
            <br>{{ element.resultCode }}
          }
        </td>
      </ng-container>

      <ng-container matColumnDef="correctedTime">
        <th mat-header-cell mat-sort-header *matHeaderCellDef>Corrected</th>
        <td mat-cell *matCellDef="let element">
          {{element.correctedTime | duration}}
        </td>
      </ng-container>

      <ng-container matColumnDef="averageLapTime">
        <th mat-header-cell *matHeaderCellDef>Avg Lap</th>
        <td mat-cell *matCellDef="let element"> 
          @if (element.finishTime) {
            {{element.averageLapTime | duration}} <br>
            {{element.numLaps}} {{element.numLaps == 1 ? 'lap' : 'laps'}}
          }
        </td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayedColumns()"></tr>
      <tr mat-row *matRowDef="let row; columns: displayedColumns();" 
          [class.row-has-result]="row.resultCode !== 'NOT FINISHED'"
          [class.row-selected]="row.id === selectedCompetitorId()"
          (click)="onRowClick(row)">
      </tr>
    </table>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualResultsTable {
  competitors = input.required<RaceCompetitor[]>();
  type = input<RaceType>('Handicap');
  handicapScheme = input<HandicapScheme>('PY');
  /** Highlight row matching handicap input panel selection (handicap results entry). */
  selectedCompetitorId = input<string | null>(null);

  rowClicked = output<RaceCompetitor>();

  sortState = linkedSignal<Sort>(() => (this.type() === 'Handicap') ?
    { active: 'correctedTime', direction: 'asc'} :
    { active: 'manualPosition', direction: 'asc' });

  private baseColumns = ['boatClass', 'sailNumber', 'helm', 'finishTime', 'elapsedTime'];
 
  displayedColumns = computed(() => (this.type() ==='Handicap') ?
        [...this.baseColumns, 'correctedTime', 'averageLapTime'] :
        ['position', ...this.baseColumns]);

  maxLaps = computed(() => this.competitors().reduce((max, comp) => {
    return (comp.numLaps > max) ? comp.numLaps : max;
  }, 0));

  onRowClick(row: RaceCompetitor) {
    this.rowClicked.emit(row);
  }

  corrected(comp: RaceCompetitor, maxLaps: number): number | undefined {
    if (!comp.finishTime || comp.numLaps <= 0 || !comp.elapsedTime) {
      return undefined;
    }

    const elapsedSeconds = comp.elapsedTime * maxLaps / comp.numLaps;

    const scheme = this.handicapScheme();
    const handicap = getHandicapValue(comp.handicaps, scheme);

    // For Level Rating, handicap is not used for corrected time.
    if (scheme !== 'Level Rating' && !handicap) {
      return undefined;
    }

    return getCorrectedTime(elapsedSeconds, handicap ?? 1, scheme);
  }

  displayHandicap(comp: RaceCompetitor): number | undefined {
    return getHandicapValue(comp.handicaps, this.handicapScheme());
  }

  tabledata = computed(() => {
    const maxLaps = this.maxLaps();
    const sort = this.sortState();

    return this.competitors().map(c => {
      const data = new ExtendedRaceCompetitor(c);
      data.correctedTime = this.corrected(data, maxLaps);
      return data;
    }).sort((a, b) =>
      manualRaceTableSort(a, b, sort.active as keyof ExtendedRaceCompetitor, sort.direction));
  });

}
