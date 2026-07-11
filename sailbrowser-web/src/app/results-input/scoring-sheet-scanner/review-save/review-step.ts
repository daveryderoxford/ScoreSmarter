import { Component, inject, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { sailNumbersEqual } from 'app/boats/model/sail-number';
import { AuthService } from 'app/auth/auth.service';
import { normaliseString } from 'app/shared/utils/string-utils';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';
import { ScannedResultRow } from '../model/scan-model';
import { formatScanMetricsSummary } from '../model/scan-metrics-format';
import type { ScannedValueField } from '../run-scan/promote-scanned-alternative';
import { ScanRunStore } from '../run-scan/scan-run.store';
import { ScanAlternatePicker } from './scan-alternate-picker';
import { ScanReviewStore } from './scan-review.store';

export interface MatchedRowVm {
  row: ScannedResultRow;
  helm?: string;
  competitor?: ResolvedRaceCompetitor;
}

interface MatchedIdentityOpts {
  compareSail?: boolean;
}

/** Linked race-entry value shown in the matched grid. */
export function matchedEntryText(linked: string | undefined | null): string {
  return linked?.trim() || '-';
}

/** Scan-reported value when it differs from the linked entry; otherwise null. */
export function matchedScanText(
  linked: string | undefined | null,
  reported: string | undefined | null,
  opts?: MatchedIdentityOpts,
): string | null {
  const reportedTrimmed = reported?.trim() ?? '';
  if (!reportedTrimmed) return null;

  const linkedTrimmed = linked?.trim() ?? '';
  if (!linkedTrimmed) return reportedTrimmed;

  const equal = opts?.compareSail
    ? sailNumbersEqual(linkedTrimmed, reportedTrimmed)
    : normaliseString(linkedTrimmed) === normaliseString(reportedTrimmed);

  return equal ? null : reportedTrimmed;
}

export interface UnmatchedRowVm {
  row: ScannedResultRow;
  matchedBoat: boolean;
  matchedClass: boolean;
  /** True when Create is safe to offer (class + sail present and class known or boat matched). */
  canCreate: boolean;
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
    MatTooltipModule,
    ScanAlternatePicker,
  ],
  templateUrl: './review-step.html',
  styleUrl: './review-step.scss',
})
export class ReviewStep {
  protected readonly scanRun = inject(ScanRunStore);
  protected readonly review = inject(ScanReviewStore);
  protected readonly auth = inject(AuthService);
  protected readonly formatScanMetricsSummary = formatScanMetricsSummary;
  protected readonly matchedEntryText = matchedEntryText;
  protected readonly matchedScanText = matchedScanText;

  backRequested = output<void>();

  onAcceptanceChanged(rowIndex: number, event: MatCheckboxChange): void {
    this.review.setAcceptance({ rowIndex, accepted: event.checked });
  }

  promoteAlternative(rowIndex: number, field: ScannedValueField, chosen: string | number): void {
    this.review.promoteAlternative(rowIndex, field, chosen);
  }
}
