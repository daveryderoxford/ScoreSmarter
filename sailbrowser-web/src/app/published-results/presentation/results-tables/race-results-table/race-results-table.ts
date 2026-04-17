import { CdkTableModule } from '@angular/cdk/table';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { doesRaceRequireHandicap, type RaceType } from 'app/race-calender/model/race-type';
import { RaceResult } from 'app/published-results/model/published-race';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { competitorColumns, nameColumnWidth as computeNameColumnWidth } from '../results-table-shared';
import { DurationPipe } from 'app/shared/pipes/duration.pipe';

export const raceColumns = [...competitorColumns, 'elapsed', 'corrected', 'points'] as const;
export type RaceColumn = (typeof raceColumns)[number];

@Component({
  selector: 'app-race-results-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkTableModule, DurationPipe],
  templateUrl: './race-results-table.html',
  styleUrls: ['../results-table-shared.scss', './race-results-table.scss'],
})
export class RaceResultsTable {
  results = input.required<RaceResult[]>();
  columns = input<RaceColumn[]>([...raceColumns]);
  /** When set and not a handicap-time race, elapsed/corrected/rating columns are hidden. */
  raceType = input<RaceType | undefined>(undefined);
  /** Series scoring scheme (used to show personal handicap band under rating). */
  scoringHandicapScheme = input<HandicapScheme | undefined>(undefined);
  showBoatClass = input(true);
  fontSize = input(10);

  displayedColumns = computed(() => {
    const cols = this.columns();
    const rt = this.raceType();
    if (rt !== undefined && !doesRaceRequireHandicap(rt)) {
      return cols.filter(c => c !== 'elapsed' && c !== 'corrected' && c !== 'handicap');
    }
    return [...cols];
  });

  nameColumnWidth = computed(() => computeNameColumnWidth(this.results()));

  /** Add additonal composite fields to competitor */
  tableData = computed(() => {
    return (
      this.results().map(c => ({
        ...c,
        helmCrew: c.crew ? `${c.helm} <br> ${c.crew}` : c.helm,
        boat: this.showBoatClass() ? `${c.boatClass} <br> ${c.sailNumber}` : c.sailNumber,
      })) || []
    );
  });

  trackByKey(index: number, item: RaceResult) {
    return item.sailNumber.toString() + item.boatClass + item.helm;
  }

  isCompetitorSelected(comp: RaceResult): boolean {
    return false;
  }

  updateSelectedCompetitor(comp: RaceResult) {}
}
