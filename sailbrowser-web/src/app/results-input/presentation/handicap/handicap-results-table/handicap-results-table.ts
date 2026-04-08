import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RaceType } from 'app/race-calender';
import { ExtendedRaceCompetitor, manualRaceTableSort } from 'app/results-input/services/manual-results.service';
import { getHandicapValue } from 'app/scoring/model/handicap';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getCorrectedTime } from 'app/scoring/services/scorer-times';
import { DurationPipe } from 'app/shared/pipes/duration.pipe';
import { RaceCompetitor } from '../../../model/race-competitor';

@Component({
  selector: 'app-handicap-results-table',
  imports: [MatTableModule, DatePipe, DurationPipe, MatSortModule],
  styleUrl: './handicap-results-table.scss',
  templateUrl: './handicap-results-table.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HandicapResultsTable {
  competitors = input.required<RaceCompetitor[]>();
  handicapScheme = input<HandicapScheme>('PY');
  /** Highlight row matching handicap input panel selection (handicap results entry). */
  selectedCompetitorId = input<string | null>(null);

  rowClicked = output<RaceCompetitor>();

  sortState = linkedSignal<Sort>(() => 
    ({ active: 'correctedTime', direction: 'asc' })
  );

  private baseColumns = ['boatClass', 'sailNumber', 'helm', 'finishTime', 'elapsedTime'];

  displayedColumns = computed(() => 
    ([...this.baseColumns, 'correctedTime', 'averageLapTime'])
);  

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
