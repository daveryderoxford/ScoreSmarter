import { boatClassesMatch, ScanRowMatchingService } from './scan-row-matching.service';
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

  describe('findBoatMatches', () => {
    it('matches on class + sail number', () => {
      const boats = [
        { id: 'b1', boatClass: 'ILCA 7', sailNumber: '12345', helm: 'A', name: '', crew: '', isClub: false, tags: [] },
        { id: 'b2', boatClass: 'RS Aero', sailNumber: '12345', helm: 'B', name: '', crew: '', isClub: false, tags: [] },
      ];
      const matches = service.findBoatMatches(
        row({ boatClass: { value: 'ilca 7', confidence: 'HIGH' }, sailNumber: { value: '12345', confidence: 'HIGH' } }),
        boats,
      );
      expect(matches.map(m => m.id)).toEqual(['b1']);
    });

    it('matches boats when scan reports an aliased class name', () => {
      const boats = [
        { id: 'b1', boatClass: 'ILCA 6', sailNumber: '211111', helm: 'Sam', name: '', crew: '', isClub: false, tags: [] },
      ];
      const matches = service.findBoatMatches(
        row({ boatClass: { value: 'Radial', confidence: 'HIGH' }, sailNumber: { value: '211111', confidence: 'HIGH' } }),
        boats,
      );
      expect(matches.map(m => m.id)).toEqual(['b1']);
    });
  });

  describe('buildMatchedRows', () => {
    it('attaches resolved competitor for matched rows', () => {
      const scanRow = row({
        rowIndex: 1,
        matchedCompetitorId: 'c1',
        boatClass: { value: 'Laser R', confidence: 'HIGH' },
        sailNumber: { value: '1234S', confidence: 'HIGH' },
        competitorName: { value: 'Sam S', confidence: 'MANUAL_CHECK' },
      });
      const competitor = new ResolvedRaceCompetitor(
        { id: 'c1', raceId: 'r1', seriesEntryId: 'e1', resultCode: 'NOT FINISHED' } as RaceCompetitor,
        {
          id: 'e1',
          seriesId: 's1',
          helm: 'Sam Smith',
          boatClass: 'ILCA 6',
          sailNumber: '12345',
        } as SeriesEntry,
      );
      const [vm] = service.buildMatchedRows([scanRow], new Map([['c1', competitor]]));
      expect(vm.competitor?.boatClass).toBe('ILCA 6');
      expect(vm.competitor?.sailNumber).toBe('12345');
      expect(vm.competitor?.helm).toBe('Sam Smith');
      expect(vm.row.boatClass?.value).toBe('Laser R');
    });
  });

  describe('buildUnmatchedRows', () => {
    const classes = [{ name: 'ILCA 7' }, { name: 'ILCA 6' }] as { name: string }[];

    it('sets canCreate only when class and sail are present and class is known', () => {
      const [creatable] = service.buildUnmatchedRows(
        [
          row({
            boatClass: { value: 'ILCA 7', confidence: 'HIGH' },
            sailNumber: { value: '12345', confidence: 'HIGH' },
          }),
        ],
        { boats: [], classes: classes as never[] },
      );
      expect(creatable.matchedClass).toBe(true);
      expect(creatable.canCreate).toBe(true);
    });

    it('does not treat empty class as matchedClass or canCreate', () => {
      const [emptyClass] = service.buildUnmatchedRows(
        [row({ sailNumber: { value: '12345', confidence: 'HIGH' } })],
        { boats: [], classes: classes as never[] },
      );
      expect(emptyClass.matchedClass).toBe(false);
      expect(emptyClass.canCreate).toBe(false);
    });

    it('does not offer Create when sail is missing', () => {
      const [noSail] = service.buildUnmatchedRows(
        [row({ boatClass: { value: 'ILCA 7', confidence: 'HIGH' } })],
        { boats: [], classes: classes as never[] },
      );
      expect(noSail.matchedClass).toBe(true);
      expect(noSail.canCreate).toBe(false);
    });

    it('offers Enter when scan class is an alias of a known club class', () => {
      const boats = [
        { id: 'b1', boatClass: 'ILCA 6', sailNumber: '211111', helm: 'Sam', name: '', crew: '', isClub: false, tags: [] },
      ];
      const [vm] = service.buildUnmatchedRows(
        [
          row({
            boatClass: { value: 'Radial', confidence: 'HIGH' },
            sailNumber: { value: '211111', confidence: 'HIGH' },
          }),
        ],
        { boats: boats as never[], classes: classes as never[] },
      );
      expect(vm.matchedClass).toBe(true);
      expect(vm.matchedBoat).toBe(true);
      expect(vm.canCreate).toBe(true);
      expect(vm.possibleHelms).toEqual(['Sam']);
    });
  });

  describe('unmatchedRaceCompetitors', () => {
    it('excludes competitors already matched to a scan row', () => {
      const c1 = new ResolvedRaceCompetitor(
        { id: 'c1', raceId: 'r1', seriesEntryId: 'e1', resultCode: 'NOT FINISHED' } as RaceCompetitor,
        { id: 'e1', seriesId: 's1', helm: 'A', boatClass: 'ILCA 7', sailNumber: '1' } as SeriesEntry,
      );
      const c2 = new ResolvedRaceCompetitor(
        { id: 'c2', raceId: 'r1', seriesEntryId: 'e2', resultCode: 'NOT FINISHED' } as RaceCompetitor,
        { id: 'e2', seriesId: 's1', helm: 'B', boatClass: 'ILCA 6', sailNumber: '2' } as SeriesEntry,
      );
      const result = service.unmatchedRaceCompetitors(
        [c1, c2],
        [row({ matchedCompetitorId: 'c1' })],
      );
      expect(result.map(c => c.id)).toEqual(['c2']);
    });
  });
});
