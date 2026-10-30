import { Component, computed, inject, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
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
import { needsAttention, NotOnSheetAction, ScanReviewStore } from './scan-review.store';

export type ScanRowStatus = 'matched' | 'new-entry' | 'choose-helm' | 'no-match' | 'conflict';

/** Helm select option. `value` is `candidate:<helm>`, `new:<helm>` or `edit`. */
export interface HelmOption {
  value: string;
  label: string;
}

export interface ScanGridRowVm {
  row: ScannedResultRow;
  status: ScanRowStatus;
  /** Why the row needs attention; shown in the status tooltip. */
  reason?: string;
  /** The cell that stops the row matching, marked with an error icon. */
  problem?: { field: 'boatClass' | 'sailNumber'; message: string };
  /** Not accepted and the scan was not confident about the row. */
  lowConfidence: boolean;
  /** The staged sail number is one character away from a race entry that is not on the sheet. */
  nearMissSail: boolean;
  competitor?: ResolvedRaceCompetitor;
  /** Identity shown in the grid: the linked competitor, or the staged entry. */
  identity?: { helm: string; boatClass: string; sailNumber: string };
  /** Where a staged entry comes from. */
  pendingSource?: 'series-entry' | 'boat' | 'new';
  /** Options for the helm select. Empty when the helm cannot be changed in the grid. */
  helmOptions: HelmOption[];
  selectedHelm?: string;
  canAccept: boolean;
  /** The staged entry clashes with an existing race entry, which the user may replace. */
  canReplaceExisting: boolean;
}

export interface ScanReviewSummary {
  matched: number;
  newEntries: number;
  chooseHelm: number;
  noMatch: number;
  conflicts: number;
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

/**
 * Icon for a row that needs the user to act; undefined for rows that simply match a race
 * entry or will be entered from a series entry, a boat or a fixed row.
 */
export function scanRowStatusIcon(vm: Pick<ScanGridRowVm, 'status' | 'lowConfidence' | 'nearMissSail'>): string | undefined {
  switch (vm.status) {
    case 'matched':
    case 'new-entry':
      return vm.nearMissSail || vm.lowConfidence ? 'warning' : undefined;
    case 'choose-helm':
      return 'person_search';
    case 'conflict':
      return 'error';
    case 'no-match':
      return 'help';
  }
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
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
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

  protected readonly summaryText = computed(() => {
    const s = this.review.summary();
    return [
      [s.matched, 'matched'],
      [s.newEntries, s.newEntries === 1 ? 'new entry' : 'new entries'],
      [s.chooseHelm, 'choose helm'],
      [s.conflicts, s.conflicts === 1 ? 'conflict' : 'conflicts'],
      [s.noMatch, 'no match'],
    ]
      .filter(([count]) => count !== 0)
      .map(([count, label]) => `${count} ${label}`)
      .join(', ');
  });

  onAcceptanceChanged(rowIndex: number, event: MatCheckboxChange): void {
    this.review.setAcceptance({ rowIndex, accepted: event.checked });
  }

  promoteAlternative(rowIndex: number, field: ScannedValueField, chosen: string | number): void {
    this.review.promoteAlternative(rowIndex, field, chosen);
  }

  /** The select shows the row's actual helm again if the user cancels a dialog or prompt. */
  async onHelmSelected(select: MatSelect, vm: ScanGridRowVm, option: string): Promise<void> {
    await this.review.chooseHelm(vm.row, option);
    const current = this.review.gridRows().find(r => r.row.rowIndex === vm.row.rowIndex);
    select.value = current?.selectedHelm;
  }

  onNotOnSheetAction(competitorId: string, value: string): void {
    if (value.startsWith('link:')) {
      this.review.linkEntryToRow(competitorId, Number(value.slice('link:'.length)));
      return;
    }
    this.review.setNotOnSheetAction(competitorId, value as NotOnSheetAction);
  }

  statusIcon(vm: ScanGridRowVm): string | undefined {
    return scanRowStatusIcon(vm);
  }

  statusTone(vm: ScanGridRowVm): 'ok' | 'warn' | 'error' {
    if (vm.status === 'no-match') return 'error';
    return needsAttention(vm) ? 'warn' : 'ok';
  }

  statusTooltip(vm: ScanGridRowVm): string {
    const notes = [
      STATUS_LABELS[vm.status],
      vm.reason,
      vm.pendingSource ? this.pendingNote(vm) : undefined,
      vm.nearMissSail ? 'Sail number is one character away from a race entry that is not on the sheet' : undefined,
      vm.lowConfidence ? 'Low scan confidence' : undefined,
    ];
    return notes.filter(Boolean).join('. ');
  }

  confidenceLabel(confidence: string): string {
    return confidence === 'MANUAL_CHECK' ? 'CHECK' : confidence;
  }

  acceptTooltip(vm: ScanGridRowVm): string {
    if (vm.status === 'choose-helm') return 'Choose a helm first';
    if (vm.status === 'no-match') return 'Fix the row first';
    return '';
  }

  private pendingNote(vm: ScanGridRowVm): string {
    const created = vm.pendingSource === 'series-entry'
      ? 'A race entry is created'
      : 'A series entry and race entry are created';
    return `${created} when you save the scan. Untick the row to leave it out`;
  }
}

const STATUS_LABELS: Record<ScanRowStatus, string> = {
  'matched': 'Matched to race entry',
  'new-entry': 'New entry',
  'choose-helm': 'Choose a helm',
  'conflict': 'Conflict',
  'no-match': 'No match',
};
