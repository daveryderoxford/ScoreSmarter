import { describe, expect, it } from 'vitest';
import { HANDICAP_SCHEMES } from './handicap-scheme';
import {
  getHandicapSchemeMetadata,
  getSchemesForTarget,
  handicapControlName,
} from './handicap-scheme-metadata';
import { UNKNOWN_HANDICAP_VALUE_BY_SCHEME } from './personal-handicap';

describe('handicap-scheme-metadata', () => {
  it('includes YTC schemes as boat-level with expected ranges', () => {
    for (const scheme of ['YTC', 'YTC Spinnaker'] as const) {
      expect(HANDICAP_SCHEMES).toContain(scheme);
      const meta = getHandicapSchemeMetadata(scheme);
      expect(meta.appliesTo).toBe('boat');
      expect(meta.min).toBe(700);
      expect(meta.max).toBe(1400);
      expect(meta.step).toBe(1);
      expect(meta.defaultValue).toBe(1000);
      expect(handicapControlName(scheme)).toBeTruthy();
      expect(UNKNOWN_HANDICAP_VALUE_BY_SCHEME[scheme]).toBeGreaterThan(900000);
    }
  });

  it('returns YTC schemes from getSchemesForTarget when supported', () => {
    const schemes = getSchemesForTarget(['YTC', 'PY', 'IRC'], 'boat');
    expect(schemes).toEqual(['YTC', 'IRC']);
  });
});
