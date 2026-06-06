import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { AuthService } from 'app/auth/auth.service';
import { RaceCompetitor } from '../../../model/race-competitor';
import { ScannedResultRow, ScanExecutionMetrics, ScanResponse } from '../scan-model';
import { formatScanMetricsSummary } from '../scan-metrics-format';

export interface MatchedRowVm {
  row: ScannedResultRow;
  helm?: string;
  competitor?: RaceCompetitor;
}

export interface UnmatchedRowVm {
  row: ScannedResultRow;
  matchedBoat: boolean;
  matchedClass: boolean;
  possibleHelms: string[];
}

export interface AcceptanceChangedEvent {
  rowIndex: number;
  accepted: boolean;
}

@Component({
  selector: 'app-review-step',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
  ],
  templateUrl: './review-step.html',
  styleUrl: './review-step.scss',
})
export class ReviewStep {
  protected auth = inject(AuthService);
  protected formatScanMetricsSummary = formatScanMetricsSummary;

  result = input<ScanResponse | null>(null);
  metrics = input<ScanExecutionMetrics | null>(null);
  matchedRows = input.required<MatchedRowVm[]>();
  unmatchedRows = input.required<UnmatchedRowVm[]>();
  loading = input.required<boolean>();
  scanStage = input<string | null>(null);
  error = input<string | null>(null);

  displayedColumns = input.required<string[]>();
  unmatchedColumns = input.required<string[]>();
  readonly acceptedMatchedCount = computed(() => this.matchedRows().filter(vm => !!vm.row.accepted).length);

  backRequested = output<void>();
  saveRequested = output<void>();
  retryRequested = output<void>();
  acceptanceChanged = output<AcceptanceChangedEvent>();
  knownBoatEntryRequested = output<ScannedResultRow>();
  newEntryRequested = output<ScannedResultRow>();

  onAcceptanceChanged(rowIndex: number, event: MatCheckboxChange): void {
    this.acceptanceChanged.emit({ rowIndex, accepted: event.checked });
  }
}
