import { matchedEntryText, matchedScanText, scanRowStatusIcon } from './review-step';

describe('matchedEntryText', () => {
  it('returns linked value or dash when empty', () => {
    expect(matchedEntryText('ILCA 7')).toBe('ILCA 7');
    expect(matchedEntryText('')).toBe('-');
    expect(matchedEntryText(null)).toBe('-');
  });
});

describe('matchedScanText', () => {
  it('returns null when reported matches or is empty', () => {
    expect(matchedScanText('ILCA 7', 'ilca 7')).toBeNull();
    expect(matchedScanText('ILCA 7', '')).toBeNull();
    expect(matchedScanText('', '')).toBeNull();
  });

  it('returns reported when class differs', () => {
    expect(matchedScanText('ILCA 6', 'Laser R')).toBe('Laser R');
  });

  it('returns reported when only scan has a value', () => {
    expect(matchedScanText('', 'Laser R')).toBe('Laser R');
  });

  it('normalizes sail numbers when compareSail is true', () => {
    expect(matchedScanText('12345', '12345', { compareSail: true })).toBeNull();
    expect(matchedScanText('12345', '1234S', { compareSail: true })).toBe('1234S');
  });
});

describe('scanRowStatusIcon', () => {
  const row = (status: Parameters<typeof scanRowStatusIcon>[0]['status'], flags: { lowConfidence?: boolean; nearMissSail?: boolean } = {}) =>
    scanRowStatusIcon({ status, lowConfidence: false, nearMissSail: false, ...flags });

  it('shows no icon for rows that simply match or will be entered', () => {
    expect(row('matched')).toBeUndefined();
    expect(row('new-entry')).toBeUndefined();
  });

  it('warns about matches with low confidence or a near-miss sail number', () => {
    expect(row('matched', { lowConfidence: true })).toBe('warning');
    expect(row('new-entry', { nearMissSail: true })).toBe('warning');
  });

  it('keeps icons for rows the user must fix', () => {
    expect(row('choose-helm')).toBe('person_search');
    expect(row('conflict')).toBe('error');
    expect(row('no-match')).toBe('help');
  });
});
