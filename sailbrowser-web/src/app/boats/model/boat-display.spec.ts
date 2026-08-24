import { describe, expect, it } from 'vitest';
import {
  entrySearchHaystack,
  formatBoatOptionLabel,
  formatEntrySearchLabel,
  trimBoatName,
} from './boat-display';

describe('boat-display', () => {
  it('trimBoatName returns undefined for blank values', () => {
    expect(trimBoatName(undefined)).toBeUndefined();
    expect(trimBoatName('   ')).toBeUndefined();
    expect(trimBoatName('Flying Fish')).toBe('Flying Fish');
  });

  it('formatEntrySearchLabel includes boat name when set', () => {
    expect(
      formatEntrySearchLabel({
        boatName: 'Flying Fish',
        boatClass: 'J/109',
        sailNumber: 'GBR1234',
        helm: 'Sam Helm',
      }),
    ).toBe('Flying Fish · J/109 · GBR1234 - Sam Helm');
  });

  it('formatEntrySearchLabel omits boat name when absent', () => {
    expect(
      formatEntrySearchLabel({
        boatClass: 'ILCA 7',
        sailNumber: '1234',
        helm: 'Alice',
      }),
    ).toBe('ILCA 7 1234 - Alice');
  });

  it('formatBoatOptionLabel matches entry plan example', () => {
    expect(
      formatBoatOptionLabel({
        boatName: 'Flying Fish',
        boatClass: 'J/109',
        sailNumber: 'GBR1234',
      }),
    ).toBe('Flying Fish · J/109 · GBR1234');
  });

  it('entrySearchHaystack includes boat name for filtering', () => {
    const haystack = entrySearchHaystack({
      boatName: 'Flying Fish',
      boatClass: 'J/109',
      sailNumber: 'GBR1234',
      helm: 'Sam',
    });
    expect(haystack).toContain('flying fish');
    expect(haystack).toContain('j/109');
  });
});
