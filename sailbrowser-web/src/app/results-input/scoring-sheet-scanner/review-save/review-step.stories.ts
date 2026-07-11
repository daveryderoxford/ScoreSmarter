import { signal } from '@angular/core';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { AuthService } from 'app/auth/auth.service';
import { ScanReviewStore } from '../review-save/scan-review.store';
import { ScanRunStore } from '../run-scan/scan-run.store';
import { MatchedRowVm, ReviewStep, UnmatchedRowVm } from './review-step';
import { ScanResponse, ScannedResultRow } from '../model/scan-model';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';

const displayedColumns = ['accept', 'rowIndex', 'sailNumber', 'boatClass', 'helm', 'time', 'status', 'laps', 'overall'];
const unmatchedColumns = ['rowIndex', 'sailNumber', 'boatClass', 'time', 'status', 'laps', 'helms', 'enter'];

function mkRow(
  rowIndex: number,
  partial: Partial<ScannedResultRow>,
): ScannedResultRow {
  return {
    rowIndex,
    overallRowConfidence: 'HIGH',
    status: 'OK',
    ...partial,
  };
}

const matchedRows: ScannedResultRow[] = [
  mkRow(1, {
    matchedCompetitorId: 'c1',
    accepted: true,
    overallRowConfidence: 'HIGH',
    sailNumber: { value: '1234', confidence: 'HIGH', alternatives: ['1235', '1284'] },
    boatClass: { value: 'ILCA 7', confidence: 'HIGH' },
    competitorName: { value: 'Alex', confidence: 'HIGH' },
    time: { value: '14:45:23', confidence: 'HIGH', alternatives: ['14:45:28', '14:46:23'] },
    laps: { value: 3, confidence: 'HIGH' },
  }),
  mkRow(2, {
    matchedCompetitorId: 'c2',
    accepted: false,
    overallRowConfidence: 'MANUAL_CHECK',
    sailNumber: { value: '9988', confidence: 'MANUAL_CHECK' },
    boatClass: { value: 'ILCA 6', confidence: 'HIGH' },
    time: { value: '14:49:03', confidence: 'MANUAL_CHECK' },
    laps: { value: 3, confidence: 'HIGH' },
  }),
];

const unmatchedRows: ScannedResultRow[] = [
  mkRow(3, {
    overallRowConfidence: 'AMBIGUOUS',
    sailNumber: { value: '777', confidence: 'AMBIGUOUS', alternatives: ['717', '177'] },
    boatClass: { value: 'RS Aero 7', confidence: 'MANUAL_CHECK' },
    time: { value: '15:01:12', confidence: 'HIGH', alternatives: ['15:01:17'] },
    laps: { value: 2, confidence: 'HIGH', alternatives: [3] },
  }),
  mkRow(4, {
    overallRowConfidence: 'FAILED',
    sailNumber: { value: '???', confidence: 'FAILED' },
    boatClass: { value: 'Unknown', confidence: 'FAILED' },
    time: { value: '15:07:30', confidence: 'MANUAL_CHECK' },
    laps: { value: 2, confidence: 'MANUAL_CHECK' },
  }),
];

/** Unmatched rows covering Create+Link, Create-only, and Link-only action states. */
const createVsLinkRows: ScannedResultRow[] = [
  mkRow(10, {
    overallRowConfidence: 'HIGH',
    sailNumber: { value: '12345', confidence: 'HIGH' },
    boatClass: { value: 'ILCA 7', confidence: 'HIGH' },
    time: { value: '14:52:10', confidence: 'HIGH' },
    laps: { value: 3, confidence: 'HIGH' },
  }),
  mkRow(11, {
    overallRowConfidence: 'MANUAL_CHECK',
    sailNumber: { value: '888', confidence: 'MANUAL_CHECK' },
    boatClass: { value: 'ILCA 6', confidence: 'HIGH' },
    time: { value: '14:55:00', confidence: 'HIGH' },
    laps: { value: 3, confidence: 'HIGH' },
  }),
  mkRow(12, {
    overallRowConfidence: 'FAILED',
    sailNumber: { value: '', confidence: 'FAILED' },
    boatClass: { value: '', confidence: 'FAILED' },
    time: { value: '15:02:44', confidence: 'HIGH' },
    laps: { value: 2, confidence: 'HIGH' },
  }),
];

function mkCompetitor(partial: { helm: string; boatClass: string; sailNumber: string }): ResolvedRaceCompetitor {
  return {
    helm: partial.helm,
    boatClass: partial.boatClass,
    sailNumber: partial.sailNumber,
  } as ResolvedRaceCompetitor;
}

const matchedRowVms: MatchedRowVm[] = [
  {
    row: matchedRows[0],
    helm: 'Alex',
    competitor: mkCompetitor({ helm: 'Alex', boatClass: 'ILCA 7', sailNumber: '1234' }),
  },
  {
    row: matchedRows[1],
    helm: 'Blake',
    competitor: mkCompetitor({ helm: 'Blake', boatClass: 'ILCA 6', sailNumber: '9988' }),
  },
];

const identityMismatchRow = mkRow(5, {
  matchedCompetitorId: 'c3',
  accepted: true,
  overallRowConfidence: 'HIGH',
  sailNumber: { value: '1234S', confidence: 'HIGH' },
  boatClass: { value: 'Laser R', confidence: 'HIGH' },
  competitorName: { value: 'Sam S', confidence: 'MANUAL_CHECK' },
  time: { value: '15:10:00', confidence: 'HIGH' },
  laps: { value: 3, confidence: 'HIGH' },
});

const identityMismatchVm: MatchedRowVm = {
  row: identityMismatchRow,
  helm: 'Sam Smith',
  competitor: mkCompetitor({ helm: 'Sam Smith', boatClass: 'ILCA 6', sailNumber: '12345' }),
};

const unmatchedRowVms: UnmatchedRowVm[] = [
  { row: unmatchedRows[0], matchedBoat: true, possibleHelms: ['Dana', 'Chris'], matchedClass: true, canCreate: true },
  { row: unmatchedRows[1], matchedBoat: false, possibleHelms: [], matchedClass: false, canCreate: false },
];

const createVsLinkUnmatchedVms: UnmatchedRowVm[] = [
  {
    row: createVsLinkRows[0],
    matchedBoat: true,
    matchedClass: true,
    canCreate: true,
    possibleHelms: ['Alex', 'Chris'],
  },
  {
    row: createVsLinkRows[1],
    matchedBoat: false,
    matchedClass: true,
    canCreate: true,
    possibleHelms: [],
  },
  {
    row: createVsLinkRows[2],
    matchedBoat: false,
    matchedClass: false,
    canCreate: false,
    possibleHelms: [],
  },
];

function responseFor(rows: ScannedResultRow[]): ScanResponse {
  return {
    scannedResults: rows,
    unreadableRowsCount: rows.filter(r => r.overallRowConfidence === 'FAILED').length,
    pageNotes: 'Strong wind shift near finish.',
  };
}

interface ReviewState {
  result?: ScanResponse | null;
  matchedRows?: MatchedRowVm[];
  unmatchedRows?: UnmatchedRowVm[];
  running?: boolean;
  canLink?: boolean;
}

/** Stub the area stores so the store-driven component renders in isolation. */
function storeProviders(state: ReviewState) {
  const scanRunStub = {
    running: signal(state.running ?? false),
    scanResult: signal<ScanResponse | null>(state.result ?? null),
    scanStage: signal<string | null>('Scanning sheet…'),
    error: signal<string | null>(null),
    runScan: () => undefined,
  };
  const reviewStub = {
    displayedColumns,
    unmatchedColumns,
    matchedRows: signal(state.matchedRows ?? []),
    unmatchedRows: signal(state.unmatchedRows ?? []),
    acceptedMatchedCount: signal((state.matchedRows ?? []).filter(vm => !!vm.row.accepted).length),
    canLink: signal(state.canLink ?? true),
    linkableCompetitors: signal([]),
    error: signal<string | null>(null),
    saving: signal(false),
    setAcceptance: () => undefined,
    promoteAlternative: () => undefined,
    enterKnownBoat: () => undefined,
    enterUnmatched: () => undefined,
    linkScanRow: () => undefined,
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

export const MixedMatchedAndUnmatched: Story = {
  decorators: [
    moduleMetadata({
      providers: storeProviders({
        result: responseFor([...matchedRows, ...unmatchedRows]),
        matchedRows: matchedRowVms,
        unmatchedRows: unmatchedRowVms,
        canLink: true,
      }),
    }),
  ],
};

/** Matched + unmatched rows with sail/time (and laps) alternatives — swap_horiz icons visible. */
export const AlternateValuePicker: Story = {
  decorators: [
    moduleMetadata({
      providers: storeProviders({
        result: responseFor([matchedRows[0], unmatchedRows[0]]),
        matchedRows: [matchedRowVms[0]],
        unmatchedRows: [unmatchedRowVms[0]],
        canLink: true,
      }),
    }),
  ],
};

export const MatchedOnly: Story = {
  decorators: [
    moduleMetadata({
      providers: storeProviders({
        result: responseFor(matchedRows),
        matchedRows: matchedRowVms,
        unmatchedRows: [],
        canLink: false,
      }),
    }),
  ],
};

export const LinkedVsReportedIdentity: Story = {
  decorators: [
    moduleMetadata({
      providers: storeProviders({
        result: responseFor([identityMismatchRow]),
        matchedRows: [identityMismatchVm],
        unmatchedRows: [],
        canLink: false,
      }),
    }),
  ],
};

export const UnmatchedOnly: Story = {
  decorators: [
    moduleMetadata({
      providers: storeProviders({
        result: responseFor(unmatchedRows),
        matchedRows: [],
        unmatchedRows: unmatchedRowVms,
        canLink: true,
      }),
    }),
  ],
};

/**
 * Create vs Link actions on unmatched rows:
 * - row 10: Create + Link (known club boat)
 * - row 11: Create + Link (known class, new helm)
 * - row 12: Link only (class/sail unreadable)
 */
export const CreateVsLinkActions: Story = {
  decorators: [
    moduleMetadata({
      providers: storeProviders({
        result: responseFor(createVsLinkRows),
        matchedRows: [],
        unmatchedRows: createVsLinkUnmatchedVms,
        canLink: true,
      }),
    }),
  ],
};

/** Same unmatched rows but no unlinked race entries — Create only where eligible. */
export const CreateWithoutLinkableEntries: Story = {
  decorators: [
    moduleMetadata({
      providers: storeProviders({
        result: responseFor(createVsLinkRows),
        matchedRows: [],
        unmatchedRows: createVsLinkUnmatchedVms,
        canLink: false,
      }),
    }),
  ],
};

export const Loading: Story = {
  decorators: [
    moduleMetadata({
      providers: storeProviders({ running: true, result: null, matchedRows: [], unmatchedRows: [], canLink: false }),
    }),
  ],
};
