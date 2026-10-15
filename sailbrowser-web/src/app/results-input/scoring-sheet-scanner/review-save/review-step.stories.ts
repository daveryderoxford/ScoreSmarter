import { computed, signal } from '@angular/core';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { AuthService } from 'app/auth/auth.service';
import { LinkSuggestion, needsAttention, ScanReviewStore } from '../review-save/scan-review.store';
import { ScanRunStore } from '../run-scan/scan-run.store';
import { ReviewStep, ScanGridRowVm, ScanReviewSummary } from './review-step';
import { ScanResponse, ScannedResultRow } from '../model/scan-model';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';

const displayedColumns = ['accept', 'rowIndex', 'sailNumber', 'boatClass', 'helm', 'time', 'status', 'laps', 'overall', 'actions'];

function mkRow(rowIndex: number, partial: Partial<ScannedResultRow>): ScannedResultRow {
  return {
    rowIndex,
    overallRowConfidence: 'HIGH',
    status: 'OK',
    time: { value: `14:${40 + rowIndex}:10`, confidence: 'HIGH' },
    laps: { value: 3, confidence: 'HIGH' },
    ...partial,
  };
}

function mkCompetitor(partial: { id: string; helm: string; boatClass: string; sailNumber: string }): ResolvedRaceCompetitor {
  return { ...partial, raceId: 'r1' } as unknown as ResolvedRaceCompetitor;
}

function vm(row: ScannedResultRow, partial: Partial<ScanGridRowVm> & Pick<ScanGridRowVm, 'status'>): ScanGridRowVm {
  return {
    row,
    lowConfidence: !row.accepted && row.overallRowConfidence !== 'HIGH',
    nearMissSail: false,
    helmOptions: [],
    canAccept: partial.status !== 'choose-helm' && partial.status !== 'no-match',
    canReplaceExisting: false,
    ...partial,
  };
}

const linkedRow = mkRow(1, {
  matchedCompetitorId: 'c1',
  accepted: true,
  sailNumber: { value: '1234', confidence: 'HIGH', alternatives: ['1235', '1284'] },
  boatClass: { value: 'ILCA 7', confidence: 'HIGH' },
  competitorName: { value: 'Alex', confidence: 'HIGH' },
  time: { value: '14:45:23', confidence: 'HIGH', alternatives: ['14:45:28'] },
});

const newEntryRow = mkRow(2, {
  accepted: true,
  sailNumber: { value: '2201', confidence: 'HIGH' },
  boatClass: { value: 'ILCA 6', confidence: 'HIGH' },
  competitorName: { value: 'C Jones', confidence: 'HIGH' },
  pendingEntry: { helm: 'Casey Jones', boatClass: 'ILCA 6', sailNumber: '2201' },
});

const chooseHelmRow = mkRow(3, {
  sailNumber: { value: '3300', confidence: 'HIGH' },
  boatClass: { value: 'RS Aero 7', confidence: 'HIGH' },
  competitorName: { value: 'Bob Brown', confidence: 'MANUAL_CHECK' },
});

const conflictRow = mkRow(4, {
  accepted: true,
  sailNumber: { value: '2201', confidence: 'HIGH' },
  boatClass: { value: 'ILCA 6', confidence: 'HIGH' },
  pendingEntry: { helm: 'Casey Jones', boatClass: 'ILCA 6', sailNumber: '2201' },
});

const noMatchRow = mkRow(5, {
  overallRowConfidence: 'AMBIGUOUS',
  sailNumber: { value: '777', confidence: 'AMBIGUOUS', alternatives: ['717', '177'] },
  boatClass: { value: 'Mirror', confidence: 'MANUAL_CHECK' },
});

const rows: ScanGridRowVm[] = [
  vm(linkedRow, {
    status: 'matched',
    competitor: mkCompetitor({ id: 'c1', helm: 'Alex Smith', boatClass: 'ILCA 7', sailNumber: '1234' }),
    identity: { helm: 'Alex Smith', boatClass: 'ILCA 7', sailNumber: '1234' },
  }),
  vm(newEntryRow, {
    status: 'new-entry',
    identity: { helm: 'Casey Jones', boatClass: 'ILCA 6', sailNumber: '2201' },
    pendingSource: 'boat',
    helmOptions: [
      { value: 'candidate:Casey Jones', label: 'Casey Jones' },
      { value: 'candidate:Dana Jones', label: 'Dana Jones' },
      { value: 'edit', label: 'New helm...' },
    ],
    selectedHelm: 'candidate:Casey Jones',
  }),
  vm(chooseHelmRow, {
    status: 'choose-helm',
    reason: 'Scanned helm "Bob Brown" is not entered for this boat',
    helmOptions: [
      { value: 'candidate:Jane Doe', label: 'Jane Doe' },
      { value: 'new:Bob Brown', label: 'New helm: Bob Brown' },
      { value: 'edit', label: 'New helm...' },
    ],
  }),
  vm(conflictRow, {
    status: 'conflict',
    reason: 'Same boat as row 2',
    identity: { helm: 'Casey Jones', boatClass: 'ILCA 6', sailNumber: '2201' },
    pendingSource: 'boat',
  }),
  vm(noMatchRow, { status: 'no-match', reason: 'Class not recognised' }),
];

const missingEntries = [
  mkCompetitor({ id: 'c7', helm: 'Pat Lee', boatClass: 'ILCA 7', sailNumber: '7771' }),
  mkCompetitor({ id: 'c8', helm: 'Robin Hill', boatClass: 'RS Aero 7', sailNumber: '3030' }),
];

const suggestions: LinkSuggestion[] = [
  { rowIndex: 5, label: 'Row 5: Mirror 777' },
  { rowIndex: 3, label: 'Row 3: RS Aero 7 3300 Bob Brown' },
];

function summaryOf(vms: ScanGridRowVm[]): ScanReviewSummary {
  const count = (status: ScanGridRowVm['status']) => vms.filter(v => v.status === status).length;
  return {
    matched: count('matched'),
    newEntries: count('new-entry'),
    chooseHelm: count('choose-helm'),
    noMatch: count('no-match'),
    conflicts: count('conflict'),
  };
}

interface ReviewState {
  rows?: ScanGridRowVm[];
  notOnSheet?: ResolvedRaceCompetitor[];
  running?: boolean;
}

/** Stub the area stores so the store-driven component renders in isolation. */
function storeProviders(state: ReviewState) {
  const vms = state.rows ?? [];
  const result: ScanResponse | null = state.running
    ? null
    : { scannedResults: vms.map(v => v.row), unreadableRowsCount: 0 };
  const snapshot = signal<ReadonlySet<number> | null>(null);
  const scanRunStub = {
    running: signal(state.running ?? false),
    scanResult: signal<ScanResponse | null>(result),
    scanStage: signal<string | null>('Scanning sheet…'),
    elapsedLabel: signal('0:00'),
    error: signal<string | null>(null),
    runScan: () => undefined,
  };
  const reviewStub = {
    displayedColumns: signal(displayedColumns),
    isLevelRatingScan: signal(false),
    gridRows: signal(vms),
    visibleRows: computed(() => {
      const s = snapshot();
      return s ? vms.filter(v => s.has(v.row.rowIndex)) : vms;
    }),
    summary: signal(summaryOf(vms)),
    needsAttentionOnly: computed(() => snapshot() !== null),
    setNeedsAttentionOnly: (on: boolean) =>
      snapshot.set(on ? new Set(vms.filter(needsAttention).map(v => v.row.rowIndex)) : null),
    notOnSheet: signal(state.notOnSheet ?? []),
    notOnSheetAction: () => 'none',
    linkSuggestionsById: signal(new Map((state.notOnSheet ?? []).map(c => [c.id, suggestions]))),
    canSave: signal(vms.some(v => v.canAccept && v.row.accepted)),
    error: signal<string | null>(null),
    saving: signal(false),
    raceLabel: () => 'R1',
    setAcceptance: () => undefined,
    promoteAlternative: () => undefined,
    chooseHelm: async () => undefined,
    editRow: async () => undefined,
    replaceExisting: async () => undefined,
    setNotOnSheetAction: () => undefined,
    markAllNotOnSheetDnc: () => undefined,
    linkEntryToRow: () => undefined,
    save: () => undefined,
  };
  const authStub = { isSysAdmin: signal(false) };
  return [
    { provide: ScanRunStore, useValue: scanRunStub },
    { provide: ScanReviewStore, useValue: reviewStub },
    { provide: AuthService, useValue: authStub },
  ];
}

const meta: Meta<ReviewStep> = {
  title: 'Results Input/Scoring Sheet Scanner/Review Step',
  component: ReviewStep,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<ReviewStep>;

/** Every row status in sheet order, with race entries that are not on the sheet. */
export const AllStatuses: Story = {
  decorators: [moduleMetadata({ providers: storeProviders({ rows, notOnSheet: missingEntries }) })],
};

export const AllMatched: Story = {
  decorators: [moduleMetadata({ providers: storeProviders({ rows: rows.slice(0, 2) }) })],
};

export const Loading: Story = {
  decorators: [moduleMetadata({ providers: storeProviders({ running: true }) })],
};
