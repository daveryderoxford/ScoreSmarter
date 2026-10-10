import { describe, expect, it } from 'vitest';
import { Boat } from 'app/boats/model/boat';
import { SeriesEntry } from 'app/results-input/model/series-entry';
import { RaceCompetitor } from '../../model/race-competitor';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';
import { ScannedResultRow } from '../model/scan-model';
import { canAutoApplyScanIdentity, classifyScanRow } from './scan-row-provision';

const race = { id: 'r1', seriesId: 's1' };

function scanRow(partial: Partial<ScannedResultRow>): ScannedResultRow {
  return {
    rowIndex: 1,
    overallRowConfidence: 'HIGH',
    boatClass: { value: 'ILCA 7', confidence: 'HIGH' },
    sailNumber: { value: '12345', confidence: 'HIGH' },
    ...partial,
  };
}

function entry(partial: Partial<SeriesEntry> & Pick<SeriesEntry, 'id' | 'helm'>): SeriesEntry {
  return {
    seriesId: 's1',
    boatClass: 'ILCA 7',
    sailNumber: '12345',
    handicaps: [],
    divisions: [],
    ...partial,
  };
}

function boat(partial: Partial<Boat> & Pick<Boat, 'id' | 'helm'>): Boat {
  return {
    boatClass: 'ILCA 7',
    sailNumber: '12345',
    name: '',
    crew: '',
    isClub: false,
    ...partial,
  };
}

function competitor(id: string, sail = '12345'): ResolvedRaceCompetitor {
  return new ResolvedRaceCompetitor(
    { id, raceId: 'r1', seriesEntryId: `e-${id}`, resultCode: 'NOT FINISHED' } as RaceCompetitor,
    entry({ id: `e-${id}`, helm: id, sailNumber: sail }),
  );
}

describe('classifyScanRow', () => {
  it('links a row that already has a race competitor', () => {
    const plan = classifyScanRow(scanRow({}), {
      race,
      competitors: [competitor('c1')],
      seriesEntries: [entry({ id: 'e1', helm: 'Alex' })],
      boats: [],
    });
    expect(plan).toEqual({ kind: 'link', competitorId: 'c1' });
    expect(canAutoApplyScanIdentity(scanRow({}), plan)).toBe(true);
  });

  it('signs on the series entry when class and sail match and nobody is racing yet', () => {
    const seriesEntry = entry({ id: 'e1', helm: 'Alex', boatClass: 'ILCA 6', sailNumber: '211111' });
    const plan = classifyScanRow(
      scanRow({
        boatClass: { value: 'Radial', confidence: 'HIGH' },
        sailNumber: { value: '211111', confidence: 'HIGH' },
      }),
      { race, competitors: [], seriesEntries: [seriesEntry], boats: [boat({ id: 'b1', helm: 'Someone else', boatClass: 'ILCA 6', sailNumber: '211111' })] },
    );
    expect(plan).toEqual({ kind: 'sign-on-entry', entry: seriesEntry });
  });

  it('asks for a helm when several series entries share the class and sail', () => {
    const entries = [
      entry({ id: 'e1', helm: 'Alex' }),
      entry({ id: 'e2', helm: 'Blake' }),
    ];
    const plan = classifyScanRow(scanRow({}), {
      race,
      competitors: [],
      seriesEntries: entries,
      boats: [],
    });
    expect(plan).toEqual({ kind: 'choose-entry', entries });
    expect(canAutoApplyScanIdentity(scanRow({}), plan)).toBe(false);
  });

  it('signs on a unique boat when the series has no matching entry', () => {
    const registered = boat({ id: 'b1', helm: 'Casey' });
    const plan = classifyScanRow(scanRow({}), {
      race,
      competitors: [],
      seriesEntries: [],
      boats: [registered, boat({ id: 'b2', helm: 'Other', boatClass: 'RS Aero' })],
    });
    expect(plan).toEqual({ kind: 'sign-on-boat', boat: registered });
  });

  it('asks for a helm when several boats share the class and sail', () => {
    const boats = [boat({ id: 'b1', helm: 'Casey' }), boat({ id: 'b2', helm: 'Drew' })];
    const plan = classifyScanRow(scanRow({}), {
      race,
      competitors: [],
      seriesEntries: [],
      boats,
    });
    expect(plan).toEqual({ kind: 'choose-boat', boats });
  });

  it('leaves an unknown class and sail for a new entry', () => {
    const plan = classifyScanRow(scanRow({}), {
      race,
      competitors: [],
      seriesEntries: [],
      boats: [],
    });
    expect(plan).toEqual({ kind: 'create' });
  });

  it('does not auto-apply an uncertain sail number', () => {
    const row = scanRow({ sailNumber: { value: '12345', confidence: 'MANUAL_CHECK' } });
    const plan = classifyScanRow(row, {
      race,
      competitors: [],
      seriesEntries: [entry({ id: 'e1', helm: 'Alex' })],
      boats: [],
    });
    expect(plan.kind).toBe('sign-on-entry');
    expect(canAutoApplyScanIdentity(row, plan)).toBe(false);
  });

  it('skips a row with an unreadable sail number', () => {
    const plan = classifyScanRow(
      scanRow({ sailNumber: { value: '????', confidence: 'FAILED' } }),
      { race, competitors: [], seriesEntries: [], boats: [] },
    );
    expect(plan).toEqual({ kind: 'skip' });
  });
});
