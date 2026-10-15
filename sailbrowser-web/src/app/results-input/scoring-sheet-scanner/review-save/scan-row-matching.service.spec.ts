import { boatClassesMatch, GridRowContext, ScanRowMatchingService } from './scan-row-matching.service';
import type { HelmCandidate, ScanRowIdentityPlan } from './scan-row-provision';
import { ScannedResultRow } from '../model/scan-model';
import { Race } from 'app/race-calender/model/race';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';
import { RaceCompetitor } from '../../model/race-competitor';
import { SeriesEntry } from '../../model/series-entry';

function row(partial: Partial<ScannedResultRow>): ScannedResultRow {
  return { rowIndex: 0, overallRowConfidence: 'HIGH', ...partial };
}

describe('boatClassesMatch', () => {
  it('is case and whitespace insensitive', () => {
    expect(boatClassesMatch(' ILCA 7 ', 'ilca7')).toBe(true);
    expect(boatClassesMatch('ILCA 7', 'ILCA 6')).toBe(false);
  });

  it('matches sheet aliases to canonical club classes', () => {
    expect(boatClassesMatch('Radial', 'ILCA 6')).toBe(true);
    expect(boatClassesMatch('Laser R', 'ILCA 6')).toBe(true);
    expect(boatClassesMatch('Laser', 'ILCA 7')).toBe(true);
    expect(boatClassesMatch('Radial', 'ILCA 7')).toBe(false);
    expect(boatClassesMatch('Vario', 'RS Vareo')).toBe(true);
    expect(boatClassesMatch('RS Vario', 'RS Vareo')).toBe(true);
  });
});

describe('ScanRowMatchingService', () => {
  const service = new ScanRowMatchingService();

  describe('normalizeResultCode', () => {
    it('defaults blanks to OK and uppercases known codes', () => {
      expect(service.normalizeResultCode()).toBe('OK');
      expect(service.normalizeResultCode('  ')).toBe('OK');
      expect(service.normalizeResultCode('dnf')).toBe('DNF');
    });

    it('falls back to OK for unknown codes', () => {
      expect(service.normalizeResultCode('ZZZ')).toBe('OK');
    });

    it('maps underscore NOT_FINISHED to spaced NOT FINISHED', () => {
      expect(service.normalizeResultCode('NOT_FINISHED')).toBe('NOT FINISHED');
      expect(service.normalizeResultCode('not_finished')).toBe('NOT FINISHED');
      expect(service.normalizeResultCode('NOT FINISHED')).toBe('NOT FINISHED');
    });
  });

  describe('parseScannedTime', () => {
    const race = { scheduledStart: new Date('2026-06-10T00:00:00Z') } as Race;

    it('parses hh:mm:ss', () => {
      const result = service.parseScannedTime('13:05:30', race, { timeFormat: 'clock_hms', defaultHour: 14 });
      expect(result?.getHours()).toBe(13);
      expect(result?.getMinutes()).toBe(5);
      expect(result?.getSeconds()).toBe(30);
    });

    it('applies defaultHour for mm:ss in clock_hms', () => {
      const result = service.parseScannedTime('05:30', race, { timeFormat: 'clock_hms', defaultHour: 14 });
      expect(result?.getHours()).toBe(14);
      expect(result?.getMinutes()).toBe(5);
    });

    it('returns null for unparseable input', () => {
      expect(service.parseScannedTime('x', race, { timeFormat: 'clock_hms', defaultHour: 14 })).toBeNull();
    });
  });

  describe('buildGridRows', () => {
    const candidate = (helm: string, source: HelmCandidate['source'] = 'boat'): HelmCandidate => ({
      helm,
      source,
      entry: { helm, boatClass: 'ILCA 7', sailNumber: '12345' },
    });
    const emptyContext = (plans: [number, ScanRowIdentityPlan][]): GridRowContext => ({
      plans: new Map(plans),
      conflicts: new Map(),
      resolvedById: new Map(),
      nearMissRows: new Set(),
    });

    it('keeps sheet order', () => {
      const vms = service.buildGridRows(
        [row({ rowIndex: 3 }), row({ rowIndex: 1 }), row({ rowIndex: 2 })],
        emptyContext([]),
      );
      expect(vms.map(vm => vm.row.rowIndex)).toEqual([1, 2, 3]);
    });

    it('shows the linked competitor identity for a matched row', () => {
      const competitor = new ResolvedRaceCompetitor(
        { id: 'c1', raceId: 'r1', seriesEntryId: 'e1', resultCode: 'NOT FINISHED' } as RaceCompetitor,
        { id: 'e1', seriesId: 's1', helm: 'Sam Smith', boatClass: 'ILCA 6', sailNumber: '12345' } as SeriesEntry,
      );
      const [vm] = service.buildGridRows(
        [row({ rowIndex: 1, matchedCompetitorId: 'c1', boatClass: { value: 'Laser R', confidence: 'HIGH' } })],
        { ...emptyContext([]), resolvedById: new Map([['c1', competitor]]) },
      );
      expect(vm).toMatchObject({ status: 'matched', canAccept: true });
      expect(vm.identity?.helm).toBe('Sam Smith');
      expect(vm.row.boatClass?.value).toBe('Laser R');
    });

    it('offers the other helms on a staged row', () => {
      const casey = candidate('Casey');
      const [vm] = service.buildGridRows(
        [row({ rowIndex: 1, pendingEntry: casey.entry })],
        emptyContext([[1, { kind: 'sign-on', candidate: casey, candidates: [casey, candidate('Drew')] }]]),
      );
      expect(vm).toMatchObject({ status: 'new-entry', pendingSource: 'boat', selectedHelm: 'candidate:Casey' });
      expect(vm.helmOptions.map(o => o.value)).toEqual(['candidate:Casey', 'candidate:Drew', 'edit']);
    });

    it('hides the helm choice when the only helm for the boat is staged', () => {
      const casey = candidate('Casey');
      const [vm] = service.buildGridRows(
        [row({ rowIndex: 1, pendingEntry: casey.entry })],
        emptyContext([[1, { kind: 'sign-on', candidate: casey, candidates: [casey] }]]),
      );
      expect(vm).toMatchObject({ status: 'new-entry', pendingSource: 'boat', helmOptions: [] });
      expect(vm.identity?.helm).toBe('Casey');
    });

    it('marks a staged new helm as a new entry', () => {
      const [vm] = service.buildGridRows(
        [row({ rowIndex: 1, pendingEntry: { helm: 'Bob', boatClass: 'ILCA 7', sailNumber: '12345' } })],
        emptyContext([[1, { kind: 'choose-helm', candidates: [candidate('Jane')], scannedHelm: 'Bob', helmDiffers: true }]]),
      );
      expect(vm).toMatchObject({ pendingSource: 'new', selectedHelm: 'new:Bob' });
      expect(vm.helmOptions.map(o => o.value)).toEqual(['candidate:Jane', 'new:Bob', 'edit']);
    });

    it('asks for a helm and offers the scanned name as a new helm', () => {
      const [vm] = service.buildGridRows(
        [row({ rowIndex: 1, accepted: true })],
        emptyContext([[1, { kind: 'choose-helm', candidates: [candidate('Jane')], scannedHelm: 'Bob', helmDiffers: true }]]),
      );
      expect(vm).toMatchObject({ status: 'choose-helm', canAccept: false });
      expect(vm.reason).toContain('Bob');
      expect(vm.helmOptions.map(o => o.label)).toEqual(['Jane', 'New helm: Bob', 'New helm...']);
    });

    it('marks the class cell when the class is not a club class', () => {
      const [vm] = service.buildGridRows(
        [row({ rowIndex: 1 })],
        emptyContext([[1, { kind: 'unmatched', reason: 'unknown-class' }]]),
      );
      expect(vm).toMatchObject({
        status: 'no-match',
        reason: 'Class not found in the club classes',
        problem: { field: 'boatClass' },
        canAccept: false,
      });
    });

    it('marks the sail number cell when no entry or boat has the sail number', () => {
      const [vm] = service.buildGridRows(
        [row({ rowIndex: 1 })],
        emptyContext([[1, { kind: 'unmatched', reason: 'not-found' }]]),
      );
      expect(vm.problem).toEqual({ field: 'sailNumber', message: 'No entry or boat found with this sail number' });
    });

    it('shows a conflict on an accepted row', () => {
      const [vm] = service.buildGridRows(
        [row({ rowIndex: 1, accepted: true, pendingEntry: { helm: 'Bob', boatClass: 'ILCA 7', sailNumber: '1' } })],
        {
          ...emptyContext([[1, { kind: 'unmatched', reason: 'not-found' }]]),
          conflicts: new Map([[1, { reason: 'Same boat as row 2', canReplaceExisting: false }]]),
        },
      );
      expect(vm).toMatchObject({ status: 'conflict', reason: 'Same boat as row 2', canAccept: true });
    });

    it('flags low confidence only until the row is accepted', () => {
      const [unaccepted, accepted] = service.buildGridRows(
        [
          row({ rowIndex: 1, overallRowConfidence: 'MANUAL_CHECK' }),
          row({ rowIndex: 2, overallRowConfidence: 'MANUAL_CHECK', accepted: true }),
        ],
        emptyContext([]),
      );
      expect(unaccepted.lowConfidence).toBe(true);
      expect(accepted.lowConfidence).toBe(false);
    });
  });
});
