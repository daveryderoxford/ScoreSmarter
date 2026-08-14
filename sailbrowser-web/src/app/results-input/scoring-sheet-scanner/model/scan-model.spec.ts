import { applyAutoAccept, assignLevelRatingPositions, type ScannedResultRow } from './scan-model';

function row(partial: Partial<ScannedResultRow> & Pick<ScannedResultRow, 'rowIndex'>): ScannedResultRow {
  return {
    overallRowConfidence: 'HIGH',
    status: 'OK',
    sailNumber: { value: `${partial.rowIndex}`, confidence: 'HIGH' },
    ...partial,
  };
}

describe('assignLevelRatingPositions', () => {
  it('ranks independently per raceId by rowIndex', () => {
    const ranked = assignLevelRatingPositions([
      row({ rowIndex: 3, raceId: 'a' }),
      row({ rowIndex: 1, raceId: 'b' }),
      row({ rowIndex: 2, raceId: 'a' }),
      row({ rowIndex: 4, raceId: 'b' }),
    ]);
    expect(ranked.find(r => r.rowIndex === 2)?.position).toEqual({ value: 1, confidence: 'HIGH' });
    expect(ranked.find(r => r.rowIndex === 3)?.position).toEqual({ value: 2, confidence: 'HIGH' });
    expect(ranked.find(r => r.rowIndex === 1)?.position).toEqual({ value: 1, confidence: 'HIGH' });
    expect(ranked.find(r => r.rowIndex === 4)?.position).toEqual({ value: 2, confidence: 'HIGH' });
  });

  it('skips DNF so it does not consume a place', () => {
    const ranked = assignLevelRatingPositions([
      row({ rowIndex: 1, raceId: 'a' }),
      row({ rowIndex: 2, raceId: 'a', status: 'DNF' }),
      row({ rowIndex: 3, raceId: 'a' }),
    ]);
    expect(ranked.find(r => r.rowIndex === 1)?.position?.value).toBe(1);
    expect(ranked.find(r => r.rowIndex === 2)?.position).toBeUndefined();
    expect(ranked.find(r => r.rowIndex === 3)?.position?.value).toBe(2);
  });

  it('uses swappedRowIndex for arrow swaps', () => {
    const ranked = assignLevelRatingPositions([
      row({ rowIndex: 3, raceId: 'a', swappedRowIndex: 4 }),
      row({ rowIndex: 4, raceId: 'a', swappedRowIndex: 3 }),
    ]);
    expect(ranked.find(r => r.rowIndex === 4)?.position?.value).toBe(1);
    expect(ranked.find(r => r.rowIndex === 3)?.position?.value).toBe(2);
  });

  it('falls back to rowIndex when swappedRowIndex is omitted', () => {
    const ranked = assignLevelRatingPositions([
      row({ rowIndex: 5, raceId: 'a' }),
      row({ rowIndex: 2, raceId: 'a' }),
    ]);
    expect(ranked.find(r => r.rowIndex === 2)?.position?.value).toBe(1);
    expect(ranked.find(r => r.rowIndex === 5)?.position?.value).toBe(2);
  });

  it('still places unmatched rows that have raceId from class', () => {
    const ranked = assignLevelRatingPositions([
      row({ rowIndex: 1, raceId: 'a', matchedCompetitorId: 'c1' }),
      row({ rowIndex: 2, raceId: 'a' }),
    ]);
    expect(ranked.find(r => r.rowIndex === 2)?.position?.value).toBe(2);
  });

  it('leaves handicap rows without raceId unchanged', () => {
    const input = [row({ rowIndex: 1, time: { value: '12:00:00', confidence: 'HIGH' } })];
    expect(assignLevelRatingPositions(input)).toBe(input);
  });
});

describe('applyAutoAccept', () => {
  it('auto-accepts level-rating rows on overall + sail HIGH with raceId', () => {
    const result = applyAutoAccept({
      scannedResults: [
        row({ rowIndex: 1, raceId: 'a' }),
        row({ rowIndex: 2, raceId: 'a', overallRowConfidence: 'MANUAL_CHECK' }),
      ],
      unreadableRowsCount: 0,
    });
    expect(result.scannedResults[0].accepted).toBe(true);
    expect(result.scannedResults[0].position?.value).toBe(1);
    expect(result.scannedResults[1].accepted).toBe(false);
    expect(result.scannedResults[1].position?.value).toBe(2);
  });

  it('still requires time HIGH for handicap rows', () => {
    const result = applyAutoAccept({
      scannedResults: [
        row({ rowIndex: 1, time: { value: '12:00:00', confidence: 'HIGH' } }),
        row({ rowIndex: 2, time: { value: '12:01:00', confidence: 'MANUAL_CHECK' } }),
      ],
      unreadableRowsCount: 0,
    });
    expect(result.scannedResults[0].accepted).toBe(true);
    expect(result.scannedResults[1].accepted).toBe(false);
    expect(result.scannedResults[0].position).toBeUndefined();
  });
});
