import { Meta, StoryObj } from '@storybook/angular';
import { MatchedRowVm, ReviewStep, UnmatchedRowVm } from './review-step';
import { ScanResponse, ScannedResultRow } from './scan-model';

const displayedColumns = ['accept', 'sailNumber', 'boatClass', 'time', 'status', 'laps', 'overall'];
const unmatchedColumns = ['sailNumber', 'boatClass', 'time', 'status', 'laps', 'enter'];

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
    sailNumber: { value: '1234', confidence: 'HIGH' },
    boatClass: { value: 'ILCA 7', confidence: 'HIGH' },
    time: { value: '14:45:23', confidence: 'HIGH' },
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
    sailNumber: { value: '777', confidence: 'AMBIGUOUS' },
    boatClass: { value: 'RS Aero 7', confidence: 'MANUAL_CHECK' },
    time: { value: '15:01:12', confidence: 'HIGH' },
    laps: { value: 2, confidence: 'HIGH' },
  }),
  mkRow(4, {
    overallRowConfidence: 'FAILED',
    sailNumber: { value: '???', confidence: 'FAILED' },
    boatClass: { value: 'Unknown', confidence: 'FAILED' },
    time: { value: '15:07:30', confidence: 'MANUAL_CHECK' },
    laps: { value: 2, confidence: 'MANUAL_CHECK' },
  }),
];

const matchedRowVms: MatchedRowVm[] = [
  { row: matchedRows[0], helm: 'Alex' },
  { row: matchedRows[1], helm: 'Blake' },
];

const unmatchedRowVms: UnmatchedRowVm[] = [
  { row: unmatchedRows[0], hasKnownBoat: true, possibleHelms: ['Dana', 'Chris'] },
  { row: unmatchedRows[1], hasKnownBoat: false, possibleHelms: [] },
];

function responseFor(rows: ScannedResultRow[]): ScanResponse {
  return {
    scannedResults: rows,
    unreadableRowsCount: rows.filter(r => r.overallRowConfidence === 'FAILED').length,
    pageNotes: 'Strong wind shift near finish.',
  };
}

const meta: Meta<ReviewStep> = {
  title: 'Results Input/Scoring Sheet Scanner/Review Step',
  component: ReviewStep,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    loading: false,
    displayedColumns,
    unmatchedColumns,
    backRequested: () => undefined,
    saveRequested: () => undefined,
    retryRequested: () => undefined,
    knownBoatEntryRequested: () => undefined,
    newEntryRequested: () => undefined,
  },
};

export default meta;
type Story = StoryObj<ReviewStep>;

export const MixedMatchedAndUnmatched: Story = {
  args: {
    result: responseFor([...matchedRows, ...unmatchedRows]),
    matchedRows: matchedRowVms,
    unmatchedRows: unmatchedRowVms,
  },
};

export const MatchedOnly: Story = {
  args: {
    result: responseFor(matchedRows),
    matchedRows: matchedRowVms,
    unmatchedRows: [],
  },
};

export const UnmatchedOnly: Story = {
  args: {
    result: responseFor(unmatchedRows),
    matchedRows: [],
    unmatchedRows: unmatchedRowVms,
  },
};

export const Loading: Story = {
  args: {
    loading: true,
    result: null,
    matchedRows: [],
    unmatchedRows: [],
  },
};
