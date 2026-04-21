import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { ExtendedRaceCompetitor, manualRaceTableSort } from 'app/results-input/services/manual-results.service';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getCorrectedTime } from 'app/scoring/services/scorer-times';
import { DurationPipe } from 'app/shared/pipes/duration.pipe';
import { ResolvedRaceCompetitor } from '../../../model/resolved-race-competitor';
import { ClubStore } from 'app/club-tenant';
import { isSuspectIncludingCorrected, resolveSuspectTimeRules } from 'app/results-input/services/suspect-time-rules';

@Component({
  selector: 'app-handicap-results-table',
  imports: [MatTableModule, DatePipe, DurationPipe, MatSortModule],
  styleUrl: './handicap-results-table.scss',
  templateUrl: './handicap-results-table.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HandicapResultsTable {
  private readonly clubStore = inject(ClubStore);

  competitors = input.required<ResolvedRaceCompetitor[]>();
  handicapScheme = input.required<HandicapScheme>();
  /** Highlight row matching handicap input panel selection (handicap results entry). */
  selectedCompetitorId = input<string | null>(null);

  rowClicked = output<ResolvedRaceCompetitor>();

  sortState = linkedSignal<Sort>(() => 
    ({ active: 'correctedTime', direction: 'asc' })
  );

  displayedColumns = 
    ['boatClass', 'sailNumber', 'helm', 'finishTime', 'elapsedTime', 'correctedTime', 'averageLapTime'];  

  maxLaps = computed(() => this.competitors().reduce((max, comp) => {
    return (comp.numLaps > max) ? comp.numLaps : max;
  }, 0));

  onRowClick(row: ResolvedRaceCompetitor) {
    this.rowClicked.emit(row);
  }

  corrected(comp: ResolvedRaceCompetitor, maxLaps: number): number | undefined {
    if (!comp.finishTime || comp.numLaps <= 0 || !comp.elapsedTime) {
      return undefined;
    }

    const elapsedSeconds = comp.elapsedTime * maxLaps / comp.numLaps;

    const scheme = this.handicapScheme();
    const handicap = comp.handicapForScheme(scheme);

    // For Level Rating, handicap is not used for corrected time.
    if (scheme !== 'Level Rating' && !handicap) {
      return undefined;
    }

    return getCorrectedTime(elapsedSeconds, handicap ?? 1, scheme);
  }

  displayHandicap(comp: ResolvedRaceCompetitor): number | undefined {
    return comp.handicapForScheme(this.handicapScheme());
  }

  tabledata = computed(() => {
    const maxLaps = this.maxLaps();
    const sort = this.sortState();
    const rules = resolveSuspectTimeRules(this.clubStore.club().suspectTimeThresholds);

    return this.competitors().map(c => {
      const data = new ExtendedRaceCompetitor(c, c.entry);
      const scheme = this.handicapScheme();
      data.correctedTime = this.corrected(data, maxLaps);
      data.isSuspect = isSuspectIncludingCorrected(
        data.elapsedTime,
        data.averageLapTime,
        scheme === 'Level Rating' ? undefined : data.correctedTime,
        rules,
      );
      return data;
    }).sort((a, b) =>
      manualRaceTableSort(a, b, sort.active as keyof ExtendedRaceCompetitor, sort.direction));
  });

}
