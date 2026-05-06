import { describe, expect, it } from 'vitest';
import { countableSeriesEntryIds, isCountingCompetitorResultCode } from './counting-policy';

describe('counting-policy', () => {
  it('treats OOD as non-counting while normal codes count', () => {
    expect(isCountingCompetitorResultCode('OOD')).toBe(false);
    expect(isCountingCompetitorResultCode('OK')).toBe(true);
    expect(isCountingCompetitorResultCode('DNC')).toBe(true);
  });

  it('excludes entries that only have OOD rows', () => {
    const ids = countableSeriesEntryIds([
      { seriesEntryId: 'ood-only', resultCode: 'OOD' },
      { seriesEntryId: 'ood-only', resultCode: 'OOD' },
      { seriesEntryId: 'raced', resultCode: 'OK' },
    ]);
    expect(ids.has('ood-only')).toBe(false);
    expect(ids.has('raced')).toBe(true);
  });
});
