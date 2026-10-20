import { describe, expect, it } from 'vitest';
import { normaliseSeriesNames } from 'app/race-calender/services/race-calendar-store-base';
import { tidySeriesEntryStrings } from 'app/results-input/services/series-entry-store';
import type { Division } from 'app/race-calender/model/division';
import { normaliseBoatClass, normaliseClubUpdate, normaliseFleet, normaliseSeason } from './club-normalise';

describe('club normalisation on save', () => {
  it('normalises class names, and the id only for a new class', () => {
    const boatClass = { id: ' RS  Feva ', name: '  RS   Feva  XL ', handicaps: [] };

    expect(normaliseBoatClass(boatClass, { isNew: true })).toMatchObject({ id: 'RS Feva', name: 'RS Feva XL' });
    expect(normaliseBoatClass(boatClass)).toMatchObject({ id: ' RS  Feva ', name: 'RS Feva XL' });
  });

  it('normalises handicap range fleet names and leaves other fleets alone', () => {
    const range = { type: 'HandicapRange', id: 'f1', name: ' Fast   fleet ', scheme: 'PY', min: 0, max: 1000 } as const;
    const general = { type: 'GeneralHandicap', id: 'gh', name: 'General Handicap' } as const;

    expect(normaliseFleet(range as never)).toMatchObject({ name: 'Fast fleet' });
    expect(normaliseFleet(general as never)).toBe(general);
  });

  it('normalises season names, and the id only for a new season', () => {
    expect(normaliseSeason({ id: ' 2026 ', name: ' 2026  season ', status: 'current' }, { isNew: true })).toEqual({
      id: '2026',
      name: '2026 season',
      status: 'current',
    });
  });

  it('normalises club names and bulk class lists (CSV imports)', () => {
    const update = normaliseClubUpdate({
      name: ' Island  Barn ',
      contactName: ' Dave   Ryder',
      contactEmail: ' x@y.com ',
      classes: [{ id: 'Fusion 2', name: 'Fusion 2 ', handicaps: [] }],
    });

    expect(update.name).toBe('Island Barn');
    expect(update.contactName).toBe('Dave Ryder');
    expect(update.contactEmail).toBe(' x@y.com ');
    expect(update.classes?.[0].name).toBe('Fusion 2');
  });
});

describe('series and series entry normalisation on save', () => {
  it('normalises series and division names', () => {
    const divisions = [{ id: 'd1', name: '  Silver  fleet ' } as Division];
    expect(normaliseSeriesNames({ name: ' Spring   PM ', divisions })).toMatchObject({
      name: 'Spring PM',
      divisions: [{ id: 'd1', name: 'Silver fleet' }],
    });
  });

  it('normalises series entry names and leaves cleared fields alone', () => {
    expect(
      tidySeriesEntryStrings({ helm: ' Jane   Smith ', crew: null, club: ' IBRSC ', boatName: ' Sea  Dog', sailNumber: 'gbr 123' }),
    ).toEqual({ helm: 'Jane Smith', crew: null, club: 'IBRSC', boatName: 'Sea Dog', sailNumber: 'GBR123' });
  });
});
