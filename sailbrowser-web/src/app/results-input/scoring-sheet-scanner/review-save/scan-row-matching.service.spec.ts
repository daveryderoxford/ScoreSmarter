import { boatClassesMatch, ScanRowMatchingService } from './scan-row-matching.service';
import { ScannedResultRow } from '../model/scan-model';
import { Race } from 'app/race-calender/model/race';

function row(partial: Partial<ScannedResultRow>): ScannedResultRow {
  return { rowIndex: 0, overallRowConfidence: 'HIGH', ...partial };
}

describe('boatClassesMatch', () => {
  it('is case/whitespace insensitive and treats Laser as ILCA', () => {
    expect(boatClassesMatch(' ILCA 7 ', 'ilca7')).toBe(true);
    expect(boatClassesMatch('Laser', 'ILCA')).toBe(true);
    expect(boatClassesMatch('ILCA', 'RS Aero')).toBe(false);
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
        { id: 'b1', boatClass: 'Laser', sailNumber: '12345', helm: 'A', name: '', crew: '', isClub: false, tags: [] },
        { id: 'b2', boatClass: 'RS Aero', sailNumber: '12345', helm: 'B', name: '', crew: '', isClub: false, tags: [] },
      ];
      const matches = service.findBoatMatches(
        row({ boatClass: { value: 'ILCA', confidence: 'HIGH' }, sailNumber: { value: '12345', confidence: 'HIGH' } }),
        boats,
      );
      expect(matches.map(m => m.id)).toEqual(['b1']);
    });
  });
});
