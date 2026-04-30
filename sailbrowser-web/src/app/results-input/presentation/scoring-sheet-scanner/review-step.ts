import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RaceCompetitor } from '../../model/race-competitor';
import { ScannedResultRow, ScanResponse } from './scan-model';

export interface MatchedRowVm {
  row: ScannedResultRow;
  helm?: string;
  competitor?: RaceCompetitor;
}

export interface UnmatchedRowVm {
  row: ScannedResultRow;
  hasKnownBoat: boolean;
  possibleHelms: string[];
}

@Component({
  selector: 'app-review-step',
  imports: [
    FormsModule,
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
  result = input<ScanResponse | null>(null);
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
  knownBoatEntryRequested = output<ScannedResultRow>();
  newEntryRequested = output<ScannedResultRow>();
}
