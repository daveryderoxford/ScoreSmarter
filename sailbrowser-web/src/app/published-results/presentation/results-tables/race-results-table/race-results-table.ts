import { CdkTableModule } from '@angular/cdk/table';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ClubTagDefinition } from 'app/club-tenant/model/club-tag';
import { doesRaceRequireHandicap, type RaceType } from 'app/race-calender/model/race-type';
import { isRankedRaceResult, RaceResult } from 'app/published-results/model/published-race';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { competitorColumns, nameColumnWidth as computeNameColumnWidth, withOptionalClubColumn } from '../results-table-shared';
import { DurationPipe } from 'app/shared/pipes/duration.pipe';
import { HorizontalScrollIndicator } from 'app/shared/components/horizontal-scroll-indicator/horizontal-scroll-indicator';
import { TagLegend } from '../tag-legend';
import { TagsCell } from '../tags-cell';

export const raceColumns = [...competitorColumns, 'elapsed', 'corrected', 'points'] as const;
export type RaceColumn = (typeof raceColumns)[number];

@Component({
  selector: 'app-race-results-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkTableModule, DurationPipe, TagsCell, TagLegend, HorizontalScrollIndicator],
  templateUrl: './race-results-table.html',
  styleUrls: ['../results-table-shared.scss', './race-results-table.scss'],
})
export class RaceResultsTable {
  protected readonly isRankedRaceResult = isRankedRaceResult;

  results = input.required<RaceResult[]>();
  columns = input<RaceColumn[]>([...raceColumns]);
  /** When set and not a handicap-time race, elapsed/corrected/rating columns are hidden. */
  raceType = input<RaceType | undefined>(undefined);
  /** Series scoring scheme (used to show personal handicap band under rating). */
  scoringHandicapScheme = input<HandicapScheme | undefined>(undefined);
  /** Snapshot of tag definitions for resolving tag colours beside the helm name. */
  tagDefinitions = input<readonly ClubTagDefinition[]>([]);
  showBoatClass = input(true);
  fontSize = input(10);

  displayedColumns = computed(() => {
    const cols = this.columns();
    const rt = this.raceType();
    let filtered = cols;
    if (rt !== undefined && !doesRaceRequireHandicap(rt)) {
      filtered = filtered.filter(c => c !== 'elapsed' && c !== 'corrected' && c !== 'handicap');
    }
    return withOptionalClubColumn(
      filtered,
      this.results().map(r => r.club),
    );
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
