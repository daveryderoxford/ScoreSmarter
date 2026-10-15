import { describe, expect, it } from 'vitest';
import { Boat } from 'app/boats/model/boat';
import { SeriesEntry } from 'app/results-input/model/series-entry';
import { RaceCompetitor } from '../../model/race-competitor';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';
import { ScannedResultRow } from '../model/scan-model';
import {
  applyAutomaticMatch,
  classifyScanRow,
  helmCandidates,
  ScanRowIdentitySources,
} from './scan-row-provision';

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

function helm(value: string): Pick<ScannedResultRow, 'competitorName'> {
  return { competitorName: { value, confidence: 'HIGH' } };
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

function sources(partial: Partial<ScanRowIdentitySources>): ScanRowIdentitySources {
  return { race, competitors: [], seriesEntries: [], boats: [], classes: ['ILCA 7', 'ILCA 6'], ...partial };
}

describe('helmCandidates', () => {
  it('merges series entries and boats, keeping one candidate per helm', () => {
    const candidates = helmCandidates('ILCA 7', '12345', 's1', {
      seriesEntries: [entry({ id: 'e1', helm: 'Alex Smith' }), entry({ id: 'e2', helm: 'Other', seriesId: 's2' })],
      boats: [boat({ id: 'b1', helm: 'alex  smith' }), boat({ id: 'b2', helm: 'Casey' })],
    });
    expect(candidates.map(c => [c.helm, c.source])).toEqual([
      ['Alex Smith', 'series-entry'],
      ['Casey', 'boat'],
    ]);
  });

  it('matches class aliases and ignores other boats', () => {
    const candidates = helmCandidates('Radial', '211111', 's1', {
      seriesEntries: [],
      boats: [
        boat({ id: 'b1', helm: 'Alex', boatClass: 'ILCA 6', sailNumber: '211111' }),
        boat({ id: 'b2', helm: 'Blake', boatClass: 'ILCA 6', sailNumber: '999' }),
      ],
    });
    expect(candidates.map(c => c.helm)).toEqual(['Alex']);
  });
});

describe('classifyScanRow', () => {
  it('links a row that already has a race competitor', () => {
    const plan = classifyScanRow(scanRow({}), sources({
      competitors: [competitor('c1')],
      seriesEntries: [entry({ id: 'e1', helm: 'Alex' })],
    }));
    expect(plan).toEqual({ kind: 'link', competitorId: 'c1' });
  });

  it('signs on the only helm when no helm was scanned', () => {
    const plan = classifyScanRow(scanRow({}), sources({ boats: [boat({ id: 'b1', helm: 'Casey' })] }));
    expect(plan).toMatchObject({ kind: 'sign-on', candidate: { helm: 'Casey', source: 'boat' } });
  });

  it('signs on the only helm when it matches the scanned helm', () => {
    const plan = classifyScanRow(
      scanRow(helm('C Jones')),
      sources({ seriesEntries: [entry({ id: 'e1', helm: 'Casey Jones' })] }),
    );
    expect(plan).toMatchObject({ kind: 'sign-on', candidate: { helm: 'Casey Jones', source: 'series-entry' } });
  });

  it('signs on the only helm even when the scanned helm differs', () => {
    const plan = classifyScanRow(
      scanRow(helm('Bob Brown')),
      sources({ boats: [boat({ id: 'b1', helm: 'Jane Doe' })] }),
    );
    expect(plan).toMatchObject({ kind: 'sign-on', candidate: { helm: 'Jane Doe' } });
  });

  it('picks a misspelt scanned helm from several candidates', () => {
    const plan = classifyScanRow(
      scanRow(helm('Jon Smith')),
      sources({ boats: [boat({ id: 'b1', helm: 'John Smith' }), boat({ id: 'b2', helm: 'Alex Brown' })] }),
    );
    expect(plan).toMatchObject({ kind: 'sign-on', candidate: { helm: 'John Smith' } });
  });

  it('asks for a helm when the scanned helm matches none of several candidates', () => {
    const plan = classifyScanRow(
      scanRow(helm('Bob Jones')),
      sources({ boats: [boat({ id: 'b1', helm: 'John Smith' }), boat({ id: 'b2', helm: 'Alex Brown' })] }),
    );
    expect(plan).toMatchObject({ kind: 'choose-helm', scannedHelm: 'Bob Jones', helmDiffers: true });
  });

  it('picks the scanned helm from several candidates', () => {
    const plan = classifyScanRow(
      scanRow(helm('Blake')),
      sources({
        seriesEntries: [entry({ id: 'e1', helm: 'Alex Smith' })],
        boats: [boat({ id: 'b1', helm: 'Sam Blake' })],
      }),
    );
    expect(plan).toMatchObject({ kind: 'sign-on', candidate: { helm: 'Sam Blake' } });
    expect(plan.kind === 'sign-on' && plan.candidates.length).toBe(2);
  });

  it('asks for a helm when several candidates match and no helm was scanned', () => {
    const plan = classifyScanRow(scanRow({}), sources({
      seriesEntries: [entry({ id: 'e1', helm: 'Alex' }), entry({ id: 'e2', helm: 'Blake' })],
    }));
    expect(plan).toMatchObject({ kind: 'choose-helm', helmDiffers: false });
    expect(plan.kind === 'choose-helm' && plan.candidates.map(c => c.helm)).toEqual(['Alex', 'Blake']);
  });

  it('ignores a scanned helm that could not be read', () => {
    const plan = classifyScanRow(
      scanRow({ competitorName: { value: '??', confidence: 'FAILED' } }),
      sources({ boats: [boat({ id: 'b1', helm: 'Casey' })] }),
    );
    expect(plan.kind).toBe('sign-on');
  });

  it('reports a known class with no entry or boat as not found', () => {
    expect(classifyScanRow(scanRow({}), sources({}))).toEqual({ kind: 'unmatched', reason: 'not-found' });
  });

  it('reports a class the club does not have', () => {
    const plan = classifyScanRow(scanRow({ boatClass: { value: 'Mirror', confidence: 'HIGH' } }), sources({}));
    expect(plan).toEqual({ kind: 'unmatched', reason: 'unknown-class' });
  });

  it('reports an unreadable sail number', () => {
    const plan = classifyScanRow(scanRow({ sailNumber: { value: '????', confidence: 'FAILED' } }), sources({}));
    expect(plan).toEqual({ kind: 'unmatched', reason: 'unreadable-sail' });
  });

  it('reports an unreadable class', () => {
    const plan = classifyScanRow(scanRow({ boatClass: { value: 'L?', confidence: 'AMBIGUOUS' } }), sources({}));
    expect(plan).toEqual({ kind: 'unmatched', reason: 'unreadable-class' });
  });

  it('skips a row with no race', () => {
    expect(classifyScanRow(scanRow({}), sources({ race: null }))).toEqual({ kind: 'skip' });
  });
});

describe('applyAutomaticMatch', () => {
  it('stages the chosen candidate without changing acceptance', () => {
    const plan = classifyScanRow(scanRow({}), sources({ boats: [boat({ id: 'b1', helm: 'Casey' })] }));
    const row = applyAutomaticMatch(scanRow({ accepted: false }), plan);
    expect(row.pendingEntry?.helm).toBe('Casey');
    expect(row.accepted).toBe(false);
  });

  it('leaves a row the user has already resolved', () => {
    const plan = classifyScanRow(scanRow({}), sources({ competitors: [competitor('c1')] }));
    const chosen = scanRow({ pendingEntry: { helm: 'Alex', boatClass: 'ILCA 7', sailNumber: '12345' } });
    expect(applyAutomaticMatch(chosen, plan)).toBe(chosen);
  });
});
