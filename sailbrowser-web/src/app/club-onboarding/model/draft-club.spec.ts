import { describe, expect, it } from 'vitest';
import type { CatalogClass } from 'app/system-data/model/catalog-class';
import { draftClub } from './draft-club';
import type { SailwaveCompetitor, SailwaveRaceCell, SailwaveSeries } from './sailwave-series';

const ilca: CatalogClass = {
  catalogueId: 1147,
  name: 'ILCA 7',
  crew: 1,
  rya: { name: 'ILCA 7' },
  aliases: ['Laser'],
};

function cell(points: number, code: string | null = null): SailwaveRaceCell {
  return { blank: false, discarded: false, points, code };
}

function competitor(overrides: Partial<SailwaveCompetitor> & Pick<SailwaveCompetitor, 'sailNumber' | 'helm' | 'boatClass'>): SailwaveCompetitor {
  return {
    crew: '',
    club: 'Test Club',
    boatName: '',
    fleet: '',
    rating: null,
    races: [cell(1), cell(2)],
    ...overrides,
  };
}

function series(title: string, competitors: SailwaveCompetitor[], hasRatingColumn = false, sourceName = ''): SailwaveSeries {
  return {
    id: title,
    title,
    seriesName: title,
    fleetLabel: null,
    sourceName,
    kind: 'series',
    caption: null,
    date: null,
    datePrecision: null,
    raceHeaders: ['R1', 'R2'],
    competitors,
    hasRatingColumn,
  };
}

const blank: SailwaveRaceCell = { blank: true, discarded: false, points: null, code: null };

describe('draftClub', () => {
  it('keeps one boat when a second helm sailed only one race', () => {
    const draft = draftClub([
      series('Monday', [
        competitor({ sailNumber: '123', helm: 'Ann Helm', boatClass: 'ILCA 7', races: [cell(1), cell(2)] }),
        competitor({ sailNumber: '123', helm: 'Borrower', boatClass: 'ILCA 7', races: [cell(3), { blank: true, discarded: false, points: null, code: null }] }),
      ]),
    ], [ilca], [], [], [], []);

    expect(draft.boats).toHaveLength(1);
    expect(draft.boats[0]).toMatchObject({ helm: 'Ann Helm', sailNumber: '123', borrowedBy: ['Borrower'] });
  });

  it('creates a boat for each helm who sailed more than one race', () => {
    const draft = draftClub([
      series('Monday', [
        competitor({ sailNumber: '123', helm: 'Ann Helm', boatClass: 'ILCA 7' }),
        competitor({ sailNumber: '123', helm: 'Bea Helm', boatClass: 'ILCA 7' }),
      ]),
    ], [ilca], [], [], [], []);

    expect(draft.boats.map(boat => boat.helm).sort()).toEqual(['Ann Helm', 'Bea Helm']);
  });

  it('does not add up the same races from the Overall and fleet tables on one page', () => {
    const once = () => competitor({ sailNumber: '7', helm: 'Visitor', boatClass: 'ILCA 7', races: [cell(4), blank] });
    const draft = draftClub([
      series('Overall', [
        competitor({ sailNumber: '7', helm: 'Owner', boatClass: 'ILCA 7' }),
        once(),
      ], false, 'sunday.htm'),
      series('Fast', [once()], false, 'sunday.htm'),
    ], [ilca], [], [], [], []);

    expect(draft.boats).toHaveLength(1);
    expect(draft.boats[0]).toMatchObject({ helm: 'Owner', borrowedBy: ['Visitor'] });
  });

  it('matches an RYA alias and does not mark the boat as club-owned', () => {
    const draft = draftClub([
      series('Monday', [
        competitor({ sailNumber: 'gb123', helm: 'Ann Helm', boatClass: 'Laser', rating: 1100, races: [cell(1), cell(2)] }),
      ], true),
    ], [ilca], [], [], [], []);

    expect(draft.classes[0].boatClass).toMatchObject({ name: 'ILCA 7', kind: 'rya' });
    expect(draft.boats[0].boatClass).toBe('ILCA 7');
    expect(draft.boats[0]).not.toHaveProperty('isClub');
  });

  it('proposes a class fleet for a one-class finish-place series', () => {
    const draft = draftClub([
      series('ILCA', [competitor({ sailNumber: '1', helm: 'Ann Helm', boatClass: 'ILCA 7' })]),
    ], [ilca], [], [], [], []);

    expect(draft.fleets[0].fleet).toMatchObject({ type: 'BoatClass', boatClassId: 'ILCA 7' });
  });

  it('proposes handicap bands from a fleet column and leaves general handicap as a note', () => {
    const fast = competitor({ sailNumber: '1', helm: 'Ann', boatClass: 'RS400', fleet: 'Fast', rating: 900 });
    const slow = competitor({ sailNumber: '2', helm: 'Bea', boatClass: 'Solo', fleet: 'Slow', rating: 1100 });
    const mixed = draftClub([series('Handicap', [fast, slow], true)], [], [], [], [], []);
    expect(mixed.fleets.map(item => item.fleet)).toEqual([
      expect.objectContaining({ type: 'HandicapRange', name: 'Fast', min: 900, max: 900 }),
      expect.objectContaining({ type: 'HandicapRange', name: 'Slow', min: 1100, max: 1100 }),
    ]);

    const noFleet = competitor({ sailNumber: '1', helm: 'Ann', boatClass: 'RS400', rating: 900 });
    const other = competitor({ sailNumber: '2', helm: 'Bea', boatClass: 'Solo', rating: 1100 });
    const noted = draftClub([series('Open', [noFleet, other], true)], [], [], [], [], []);
    expect(noted.fleets).toEqual([]);
    expect(noted.notes).toEqual(['Open uses General Handicap.']);
  });
});
