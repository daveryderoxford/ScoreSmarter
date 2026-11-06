import { describe, expect, it, vi } from 'vitest';
import type { Fleet } from 'app/club-tenant/model/fleet';
import type { RaceStart } from 'app/race-calendar/model/race-start';
import type { SeriesEntry } from '../model/series-entry';
import { resolveStartTimeForEntry } from './race-start-resolver';

const ilca: Fleet = { type: 'BoatClass', id: 'ilca', boatClassId: 'ILCA 7' };
const pyBand: Fleet = { type: 'HandicapRange', id: 'py', name: 'PY band', scheme: 'PY', min: 1000, max: 1200 };
const fleetsById = new Map<string, Fleet>([[ilca.id, ilca], [pyBand.id, pyBand]]);

function at(hours: number): Date {
  return new Date(Date.UTC(2026, 5, 6, hours, 0, 0));
}

function entry(overrides: Partial<SeriesEntry> = {}): SeriesEntry {
  return {
    id: 'e1',
    seriesId: 's1',
    helm: 'Helm',
    boatClass: 'ILCA 7',
    sailNumber: '100',
    handicaps: [{ scheme: 'PY', value: 1100 }],
    divisions: ['jun'],
    ...overrides,
  };
}

function start(id: string, hours: number, target: { fleetId?: string; divisionId?: string } = {}): RaceStart {
  return { id, timeOfDay: at(hours), ...target };
}

describe('resolveStartTimeForEntry', () => {
  it('uses the first matching fleet when a boat is in two fleets', () => {
    const starts = [
      start('py', 11, { fleetId: 'py' }),
      start('ilca', 10, { fleetId: 'ilca' }),
    ];
    expect(resolveStartTimeForEntry(entry(), starts, fleetsById, undefined)).toEqual(at(11));
  });

  it('uses the other fleet when that start is listed first', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const starts = [
      start('ilca', 10, { fleetId: 'ilca' }),
      start('py', 11, { fleetId: 'py' }),
    ];
    expect(resolveStartTimeForEntry(entry(), starts, fleetsById, undefined)).toEqual(at(10));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('uses a division start for a boat in that division', () => {
    const starts = [
      start('default', 10),
      start('juniors', 11, { divisionId: 'jun' }),
    ];
    expect(resolveStartTimeForEntry(entry(), starts, fleetsById, undefined)).toEqual(at(11));
  });

  it('uses the fleet start when it is listed before the division start', () => {
    const starts = [
      start('ilca', 10, { fleetId: 'ilca' }),
      start('juniors', 11, { divisionId: 'jun' }),
    ];
    expect(resolveStartTimeForEntry(entry(), starts, fleetsById, undefined)).toEqual(at(10));
  });

  it('uses the division start when it is listed before the fleet start', () => {
    const starts = [
      start('juniors', 11, { divisionId: 'jun' }),
      start('ilca', 10, { fleetId: 'ilca' }),
    ];
    expect(resolveStartTimeForEntry(entry(), starts, fleetsById, undefined)).toEqual(at(11));
  });

  it('uses the default start when the boat matches no named start', () => {
    const other: SeriesEntry = entry({ boatClass: 'Solo', handicaps: [{ scheme: 'PY', value: 900 }], divisions: [] });
    const starts = [
      start('ilca', 10, { fleetId: 'ilca' }),
      start('juniors', 11, { divisionId: 'jun' }),
      start('default', 12),
    ];
    expect(resolveStartTimeForEntry(other, starts, fleetsById, undefined)).toEqual(at(12));
  });

  it('does not treat a division start as the default', () => {
    const other: SeriesEntry = entry({ divisions: [] });
    const starts = [start('juniors', 11, { divisionId: 'jun' })];
    expect(resolveStartTimeForEntry(other, starts, fleetsById, at(9))).toEqual(at(9));
  });

  it('returns the fallback when there are no starts', () => {
    expect(resolveStartTimeForEntry(entry(), [], fleetsById, at(9))).toEqual(at(9));
    expect(resolveStartTimeForEntry(entry(), undefined, fleetsById, at(9))).toEqual(at(9));
  });
});
