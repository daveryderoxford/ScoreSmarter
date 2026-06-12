import { Component, inject, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { AuthService } from 'app/auth/auth.service';
import { RaceCompetitor } from '../../../model/race-competitor';
import { ScannedResultRow } from '../scan-model';
import { formatScanMetricsSummary } from '../scan-metrics-format';
import { ScanRunStore } from '../run-scan/scan-run.store';
import { ScanReviewStore } from '../review-save/scan-review.store';

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
  protected readonly scanRun = inject(ScanRunStore);
  protected readonly review = inject(ScanReviewStore);
  protected readonly auth = inject(AuthService);
  protected readonly formatScanMetricsSummary = formatScanMetricsSummary;

  backRequested = output<void>();

  onAcceptanceChanged(rowIndex: number, event: MatCheckboxChange): void {
    this.review.setAcceptance({ rowIndex, accepted: event.checked });
  }
}
