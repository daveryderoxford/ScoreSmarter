import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CdkTableModule } from '@angular/cdk/table';
import { PublishedSeries, PublishedSeriesResult } from 'app/published-results';
import { format } from 'date-fns';
import { competitorColumns, nameColumnWidth as computeNameColumnWidth } from '../results-table-shared';
import { HighlightPosition } from "../highlighted-position";
import { MERGED_BOAT_CLASS_SEPARATOR } from 'app/scoring/services/series-scorer';

export const seriesColumns = [...competitorColumns, 'total', 'net'] as const;
export type SeriesColumn = typeof seriesColumns[number];

@Component({
  selector: 'app-series-results-table',
  templateUrl: './series-results-table.html',
  styleUrls: ['../results-table-shared.scss', './series-results-table.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkTableModule, HighlightPosition]
})
export class SeriesResultsTable {

  series = input.required<PublishedSeries>();
  seriesColumns = input<SeriesColumn[]>([...seriesColumns]);
  showBoatClass = input(true);
  raceTitles = input.required<{ id: string; index: number; scheduledStart: Date; raceOfDay: number; }[]>();
  fontSize = input<string>('10pt');
  raceClicked = output<string>();

  raceColumns = computed(() => {
    const scores = this.series()?.competitors[0]?.raceScores ?? [];

    // Creates an array of length n where each entry is it's index 
    return Array.from({ length: scores.length }, (_, i) => i.toString());

  });

  displayedColumns = computed(() => [...this.seriesColumns(), ...this.raceColumns()]);

  tableData = computed(() => this.series()?.competitors || []);

  nameColumnWidth = computed(() => computeNameColumnWidth(this.series()?.competitors));

  raceTitle(index: number): string {
    const title = this.raceTitles()[index];
    let ret = 'Race ' + title.index.toString() + '<br>';
    if (title.scheduledStart) {
      ret = `${ret} ${format(title.scheduledStart, 'MMM dd')}`;
    }
    return ret;
  }

  isCompetitorSelected(comp: PublishedSeriesResult): boolean {
    return false;
  }

  updateSelectedCompetitor(comp: PublishedSeriesResult) {

  }

  trackByKey(index: number, item: PublishedSeriesResult) {
    return item.sailNumber.toString() + item.boatClass + item.helm;
  }

  boatClassLines(comp: PublishedSeriesResult): string[] {
    return comp.boatClass
      .split(MERGED_BOAT_CLASS_SEPARATOR)
      .map(s => s.trim())
      .filter(Boolean);
  }

  hideSailNumber(comp: PublishedSeriesResult): boolean {
    return this.boatClassLines(comp).length > 1;
  }

  onRaceHeaderClick(raceIndex: number) {
    const id = this.raceTitles()[raceIndex].id;
    this.raceClicked.emit(id);
  }
}
