import { describe, expect, it } from 'vitest';
import type { BoatClass } from 'app/club-tenant/model/boat-class';
import type { CatalogClass } from 'app/club-tenant/model/catalog-class';
import type { PublishedRace, RaceResult } from '../model/published-race';
import { buildPyReturn, cleanSailNumber, formatPyDuration, pyReturnToCsv } from './py-returns';

const clubClasses: BoatClass[] = [
  { id: 'ILCA 7', name: 'ILCA 7', handicaps: [], catalogueId: 191 },
  { id: 'RS200', name: 'RS200', handicaps: [], catalogueId: 303 },
  { id: 'Dory', name: 'Dory', handicaps: [], catalogueId: -1 },
  { id: 'Mystery', name: 'Mystery', handicaps: [] },
];

const catalogue = new Map<number, CatalogClass>([
  [191, { catalogueId: 191, name: 'ILCA 7', crew: 1, rya: { name: 'ILCA 7 / Laser', pn: 1103 } }],
  [303, { catalogueId: 303, name: 'RS200', crew: 2, rya: { name: 'RS200', pn: 1053 } }],
  [-1, { catalogueId: -1, name: 'Dory', crew: 2 }],
]);

let entryId = 0;
function result(boatClass: string, elapsedTime: number, extra: Partial<RaceResult> = {}): RaceResult {
  entryId++;
  return {
    seriesEntryId: `e${entryId}`,
    competitorKey: `e${entryId}`,
    rank: 1,
    boatClass,
    sailNumber: 'GBR 123/4',
    helm: `Helm ${entryId}`,
    handicap: 1100,
    laps: 2,
    startTime: new Date(),
    finishTime: new Date(),
    elapsedTime,
    correctedTime: elapsedTime,
    points: 1,
    resultCode: 'OK',
    divisions: [],
    ...extra,
  };
}

function race(id: string, results: RaceResult[], extra: Partial<PublishedRace> = {}): PublishedRace {
  return {
    id,
    seriesName: 'Summer',
    index: 1,
    seriesId: 's1',
    raceOfDay: 1,
    scheduledStart: new Date(2026, 5, 6, 14, 0),
    type: 'Handicap',
    isDiscardable: true,
    isAverageLap: false,
    results,
    divisionDefinitions: [],
    ...extra,
  };
}

const goodRace = () =>
  race('r1', [
    result('ILCA 7', 3000),
    result('ILCA 7', 3100),
    result('RS200', 2900),
    result('RS200', 3050),
    result('Dory', 3300),
    result('ILCA 7', 0, { resultCode: 'DNF' }),
  ]);

describe('buildPyReturn', () => {
  it('returns finishers of RYA classes under their RYA Class ID', () => {
    const build = buildPyReturn([goodRace()], clubClasses, catalogue, 'AFF123');

    expect(build.ret.affiliationId).toBe('AFF123');
    expect(build.ret.races).toHaveLength(1);
    const [returned] = build.ret.races;
    expect(returned.date).toBe('2026-06-06');
    expect(returned.startTime).toBe('14:00');
    expect(returned.entries.map(e => e.ryaClassId).sort()).toEqual([191, 191, 303, 303]);
    expect(returned.entries[0].sailNumber).toBe('GBR1234');
  });

  it('reports non-RYA and unlinked classes, and leaves their boats out', () => {
    const build = buildPyReturn(
      [race('r1', [...goodRace().results, result('Mystery', 3000)])],
      clubClasses,
      catalogue,
      'AFF123',
    );

    expect(build.classes.find(c => c.className === 'Dory')?.status).toBe('non-rya');
    expect(build.classes.find(c => c.className === 'Mystery')?.status).toBe('unlinked');
    expect(build.classes.find(c => c.className === 'ILCA 7')).toMatchObject({ status: 'rya', entries: 2 });
    expect(build.issues.some(i => i.includes('Mystery'))).toBe(true);
  });

  it('excludes races that fail the RYA criteria, with reasons', () => {
    const tooFew = race('few', [result('ILCA 7', 3000), result('RS200', 3000), result('RS200', 3100)]);
    const oneClass = race('one', [1, 2, 3, 4].map(i => result('ILCA 7', 3000 + i)));
    const short = race('short', [result('ILCA 7', 900), result('ILCA 7', 1000), result('RS200', 950), result('RS200', 990)]);
    const pursuit = race('pursuit', goodRace().results, { type: 'Pursuit' });

    const build = buildPyReturn([tooFew, oneClass, short, pursuit], clubClasses, catalogue, 'AFF123');

    expect(build.ret.races).toHaveLength(0);
    const reasons = Object.fromEntries(build.excludedRaces.map(r => [r.raceId, r.reasons.join('; ')]));
    expect(reasons['few']).toContain('3 finishers');
    expect(reasons['one']).toContain('1 RYA class');
    expect(reasons['short']).toContain('min');
    expect(reasons['pursuit']).toContain('Pursuit');
  });

  it('returns a race published in several series once', () => {
    const base = goodRace();
    const secondary = { ...base, seriesId: 's1_cfg', results: base.results.slice(0, 2) };

    const build = buildPyReturn([base, secondary], clubClasses, catalogue, 'AFF123');

    expect(build.ret.races).toHaveLength(1);
    expect(build.ret.races[0].entries).toHaveLength(4);
  });

  it('flags a missing affiliation ID', () => {
    expect(buildPyReturn([goodRace()], clubClasses, catalogue, '').issues[0]).toContain('affiliation');
  });
});

describe('PY return helpers', () => {
  it('strips symbols from sail numbers', () => {
    expect(cleanSailNumber('GBR 123/4')).toBe('GBR1234');
  });

  it('formats durations as h:mm:ss', () => {
    expect(formatPyDuration(3000)).toBe('0:50:00');
    expect(formatPyDuration(3725.4)).toBe('1:02:05');
  });

  it('writes the PY Online layout: title row, header row, one row per finisher', () => {
    const build = buildPyReturn([goodRace()], clubClasses, catalogue, 'AFF123');
    const lines = pyReturnToCsv(build.ret).split('\n');

    expect(lines[0]).toBe('Complete race results');
    expect(lines[1]).toBe(
      'Class,Race Number,Race Date,Start Name,Rank,SailNo,Helm,Crew,pn,Laps,Elapsed,Corrected,Persons,Rig,Spin',
    );
    expect(lines).toHaveLength(6);
    expect(lines.slice(2).find(l => l.startsWith('ILCA 7 / Laser'))).toMatch(
      /^ILCA 7 \/ Laser,1,2026-06-06,Summer,1,GBR1234,Helm \d+,,1100,2,0:5\d:\d\d,0:5\d:\d\d,1,,$/,
    );
  });

  it('numbers races uniquely within the return', () => {
    const second = { ...goodRace(), id: 'r2', index: 1, seriesName: 'Other' };
    const build = buildPyReturn([goodRace(), second], clubClasses, catalogue, 'AFF123');

    expect(build.ret.races.map(r => r.raceNumber)).toEqual([1, 2]);
  });
});
