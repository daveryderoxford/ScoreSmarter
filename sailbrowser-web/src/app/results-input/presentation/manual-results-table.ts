import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { RaceCompetitor } from '../model/race-competitor';
import { MatSortModule, Sort } from '@angular/material/sort';
import { ExtendedRaceCompetitor, manualRaceTableSort } from '../services/manual-results.service';
import { DurationPipe } from 'app/shared/pipes/duration.pipe';
import { RaceType } from 'app/race-calender';

@Component({
  selector: 'app-manual-results-table',
  imports: [MatTableModule, DatePipe, DurationPipe, MatSortModule],
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
          {{element.handicap}}
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
          [class.processed]="!(row.resultCode === 'NOT FINISHED')"
          (click)="onRowClick(row)">
      </tr>
    </table>
  `,
  styles: [`
    :host {
      display: block;
    }
    table {
      width: 100%;
    }
    tr.processed {
      background-color: #f5f5f5;
      color: rgba(0,0,0,0.38);
      
      td {
        color: inherit;
      }
    }

    tr.mat-mdc-row:hover {
      background-color: rgba(0,0,0,0.04);
      cursor: pointer;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualResultsTable {
  competitors = input.required<RaceCompetitor[]>();
  type = input<RaceType>('Handicap');

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
    if (comp.finishTime && comp.numLaps > 0 && comp.handicap > 0) {
      return comp.elapsedTime! * maxLaps / comp.numLaps * 1000 / comp.handicap;
    }
    return undefined;
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
