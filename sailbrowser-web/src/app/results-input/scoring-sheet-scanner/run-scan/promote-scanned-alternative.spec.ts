import {
  promoteRowAlternative,
  promoteScannedAlternative,
  replaceRowIdentity,
} from './promote-scanned-alternative';
import type { ScannedResultRow } from '../model/scan-model';

describe('promoteScannedAlternative', () => {
  it('promotes chosen alt and puts previous value first in alternatives', () => {
    const next = promoteScannedAlternative(
      { value: '14:45:23', confidence: 'HIGH', alternatives: ['14:45:28', '14:46:23'] },
      '14:45:28',
    );
    expect(next).toEqual({
      value: '14:45:28',
      confidence: 'HIGH',
      alternatives: ['14:45:23', '14:46:23'],
    });
  });

  it('no-ops when chosen equals current value', () => {
    const field = { value: '1234', confidence: 'HIGH' as const, alternatives: ['1235'] };
    expect(promoteScannedAlternative(field, '1234')).toBe(field);
  });

  it('returns undefined when field is missing', () => {
    expect(promoteScannedAlternative(undefined, 'x')).toBeUndefined();
  });
});

describe('promoteRowAlternative', () => {
  const baseRow: ScannedResultRow = {
    rowIndex: 1,
    overallRowConfidence: 'HIGH',
    status: 'OK',
    sailNumber: { value: '1234', confidence: 'HIGH', alternatives: ['1235', '1236'] },
    time: { value: '14:45:23', confidence: 'MANUAL_CHECK', alternatives: ['14:45:28'] },
    laps: { value: 3, confidence: 'HIGH', alternatives: [2, 4] },
  };

  it('swaps sailNumber on the row', () => {
    const next = promoteRowAlternative(baseRow, 'sailNumber', '1235');
    expect(next.sailNumber).toEqual({
      value: '1235',
      confidence: 'HIGH',
      alternatives: ['1234', '1236'],
    });
    expect(next.time).toBe(baseRow.time);
  });

  it('coerces laps to number', () => {
    const next = promoteRowAlternative(baseRow, 'laps', '2');
    expect(next.laps).toEqual({
      value: 2,
      confidence: 'HIGH',
      alternatives: [3, 4],
    });
  });

  it('no-ops when field missing', () => {
    const row = { ...baseRow, boatClass: undefined };
    expect(promoteRowAlternative(row, 'boatClass', 'ILCA 7')).toBe(row);
  });

  it('clears an earlier choice when the sail number changes', () => {
    const chosen: ScannedResultRow = {
      ...baseRow,
      matchedCompetitorId: 'c1',
      pendingEntry: { helm: 'Alex', boatClass: 'ILCA 7', sailNumber: '1234' },
    };
    const next = promoteRowAlternative(chosen, 'sailNumber', '1235');
    expect(next.matchedCompetitorId).toBeUndefined();
    expect(next.pendingEntry).toBeUndefined();
  });

  it('keeps an earlier choice when the time changes', () => {
    const chosen: ScannedResultRow = { ...baseRow, matchedCompetitorId: 'c1' };
    expect(promoteRowAlternative(chosen, 'time', '14:45:28').matchedCompetitorId).toBe('c1');
  });
});

describe('replaceRowIdentity', () => {
  it('uses the typed values and keeps the scanned ones as alternatives', () => {
    const row: ScannedResultRow = {
      rowIndex: 1,
      overallRowConfidence: 'MANUAL_CHECK',
      boatClass: { value: 'Lazer', confidence: 'AMBIGUOUS' },
      sailNumber: { value: '12E4', confidence: 'FAILED', alternatives: ['1234'] },
      matchedCompetitorId: 'c1',
    };
    const next = replaceRowIdentity(row, { boatClass: 'ILCA 7', sailNumber: '1234' });
    expect(next.boatClass).toEqual({ value: 'ILCA 7', confidence: 'HIGH', alternatives: ['Lazer'] });
    expect(next.sailNumber).toEqual({ value: '1234', confidence: 'HIGH', alternatives: ['12E4'] });
    expect(next.matchedCompetitorId).toBeUndefined();
  });
});
