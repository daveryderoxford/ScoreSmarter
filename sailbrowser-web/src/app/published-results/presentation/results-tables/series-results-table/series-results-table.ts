import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CdkTableModule } from '@angular/cdk/table';
import { PublishedSeries, PublishedSeriesResult } from 'app/published-results';
import { format } from 'date-fns';
import { competitorColumns, nameColumnWidth as computeNameColumnWidth, withOptionalClubColumn } from '../results-table-shared';
import { withOptionalDivisionColumn, publishedDivisionDefinitions, rowDivisionIds, markerDivisionIds, textDivisionNames } from 'app/race-calender/model/division';
import { HighlightPosition } from "../highlighted-position";
import { HorizontalScrollIndicator } from 'app/shared/components/horizontal-scroll-indicator/horizontal-scroll-indicator';
import { DivisionLegend } from '../division-legend';
import { DivisionMarkersCell } from '../division-markers-cell';
import { MERGED_BOAT_CLASS_SEPARATOR } from 'app/scoring/services/series-scorer';

export const seriesColumns = [...competitorColumns, 'total', 'net'] as const;
export type SeriesColumn = typeof seriesColumns[number];

@Component({
  selector: 'app-series-results-table',
  templateUrl: './series-results-table.html',
  styleUrls: ['../results-table-shared.scss', './series-results-table.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkTableModule, HighlightPosition, DivisionMarkersCell, DivisionLegend, HorizontalScrollIndicator]
})
export class SeriesResultsTable {

  series = input.required<PublishedSeries>();
  seriesColumns = input<SeriesColumn[]>([...seriesColumns]);
  showBoatClass = input(true);
  raceTitles = input.required<{ id: string; index: number; scheduledStart: Date; raceOfDay: number; }[]>();
  fontSize = input<string>('10pt');
  raceClicked = output<string>();

  /** Snapshot of division definitions for markers and the Division column. */
  protected readonly divisionDefinitions = computed(() =>
    publishedDivisionDefinitions(this.series() ?? {}),
  );

  protected markerIds(row: { divisions?: string[] }): string[] {
    return markerDivisionIds(rowDivisionIds(row), this.divisionDefinitions());
  }

  protected divisionLabel(row: { divisions?: string[] }): string {
    return textDivisionNames(rowDivisionIds(row), this.divisionDefinitions()).join(', ');
  }

  raceColumns = computed(() => {
    const scores = this.series()?.competitors[0]?.raceScores ?? [];

    // Creates an array of length n where each entry is it's index 
    return Array.from({ length: scores.length }, (_, i) => i.toString());

  });

  displayedColumns = computed(() => {
    const withClub = withOptionalClubColumn(
      this.seriesColumns(),
      this.series()?.competitors.map(c => c.club) ?? [],
    );
    return withOptionalDivisionColumn(
      [...withClub, ...this.raceColumns()],
      this.series()?.competitors ?? [],
      this.divisionDefinitions(),
    );
  });

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
