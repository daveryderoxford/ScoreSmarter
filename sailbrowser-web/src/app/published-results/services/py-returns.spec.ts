import { describe, expect, it } from 'vitest';
import type { BoatClass } from 'app/club-tenant/model/boat-class';
import type { CatalogClass } from 'app/club-tenant/model/catalog-class';
import type { PublishedRace, RaceResult } from '../model/published-race';
import {
  buildPyReturn,
  cleanSailNumber,
  findClubClass,
  pyEventName,
  pyReturnFilename,
  pyReturnToCsv,
  sourceSeriesId,
} from './py-returns';

const clubClasses: BoatClass[] = [
  { id: 'ILCA 7', name: 'ILCA 7', handicaps: [], catalogueId: 191 },
  { id: 'RS200', name: 'RS200', handicaps: [], catalogueId: 303 },
  { id: 'Dory', name: 'Dory', handicaps: [], catalogueId: -1 },
  { id: 'Mystery', name: 'Mystery', handicaps: [] },
];

const catalogue = new Map<number, CatalogClass>([
  [191, { catalogueId: 191, name: 'ILCA 7', crew: 1, rig: 'U', spinnaker: '0', rya: { name: 'ILCA 7 / Laser', pn: 1103 } }],
  [303, { catalogueId: 303, name: 'RS200', crew: 2, rig: 'S', spinnaker: 'A', rya: { name: 'RS200', pn: 1053 } }],
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
    index: 7,
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

const goodResults = () => [
  result('ILCA 7', 3000),
  result('ILCA 7', 3100),
  result('RS200', 2900),
  result('RS200', 3050),
  result('Dory', 3300),
  result('ILCA 7', 0, { resultCode: 'DNF' }),
];
const goodRace = (extra: Partial<PublishedRace> = {}) => race('r1', goodResults(), extra);

describe('buildPyReturn', () => {
  it('returns finishers of RYA classes under their RYA Class ID, in one file per series', () => {
    const build = buildPyReturn([goodRace()], clubClasses, catalogue, 'AFF123');

    expect(build.ret.affiliationId).toBe('AFF123');
    expect(build.ret.series).toHaveLength(1);
    const [series] = build.ret.series;
    expect(series).toMatchObject({ seriesId: 's1', eventName: 'Summer' });
    const [returned] = series.races;
    expect(returned.raceNumber).toBe(7);
    expect(returned.date).toBe('2026-06-06');
    expect(returned.entries.map(e => e.ryaClassId).sort()).toEqual([191, 191, 303, 303]);
    expect(returned.entries[0].sailNumber).toBe('GBR1234');
  });

  it('splits races from different series into separate files', () => {
    const other = race('r2', goodResults(), { seriesId: 's2', seriesName: 'Winter', index: 3 });
    const build = buildPyReturn([goodRace(), other], clubClasses, catalogue, 'AFF123');

    expect(build.ret.series.map(s => [s.eventName, s.races.map(r => r.raceNumber)])).toEqual([
      ['Summer', [7]],
      ['Winter', [3]],
    ]);
  });

  it('adds the season to event names so same-named series in different seasons differ', () => {
    const lastYear = race('r2', goodResults(), { seriesId: 's2' });
    const seasons = new Map([['s1', '2026'], ['s2', '2025']]);
    const build = buildPyReturn([goodRace(), lastYear], clubClasses, catalogue, 'AFF123', seasons);

    expect(build.ret.series.map(s => s.eventName)).toEqual(['2025 - Summer', '2026 - Summer']);
  });

  it('reports non-RYA and unlinked classes, and leaves their boats out', () => {
    const build = buildPyReturn(
      [race('r1', [...goodResults(), result('Mystery', 3000)])],
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
    const pursuit = race('pursuit', goodResults(), { type: 'Pursuit' });

    const build = buildPyReturn([tooFew, oneClass, short, pursuit], clubClasses, catalogue, 'AFF123');

    expect(build.ret.series).toHaveLength(0);
    const reasons = Object.fromEntries(build.excludedRaces.map(r => [r.raceId, r.reasons.join('; ')]));
    expect(reasons['few']).toContain('3 finishers');
    expect(reasons['one']).toContain('1 RYA class');
    expect(reasons['short']).toContain('min');
    expect(reasons['pursuit']).toContain('Pursuit');
  });

  it('folds secondary scoring copies into the source series and returns each race once', () => {
    const base = goodRace();
    const secondary = { ...base, seriesId: 's1_cfg', seriesName: 'Summer - PY', results: base.results.slice(0, 2) };

    const build = buildPyReturn([secondary, base], clubClasses, catalogue, 'AFF123');

    expect(build.ret.series).toHaveLength(1);
    expect(build.ret.series[0].eventName).toBe('Summer');
    expect(build.ret.series[0].races[0].entries).toHaveLength(4);
  });

  it('leaves the event name alone when the series already names its season', () => {
    expect(pyEventName('Summer Handicap 2026', '2026')).toBe('Summer Handicap 2026');
    expect(pyEventName('Summer', undefined)).toBe('Summer');
    expect(pyEventName('Summer', ' Winter  2025-26 ')).toBe('Winter 2025-26 - Summer');
  });

  it('flags a missing affiliation ID', () => {
    expect(buildPyReturn([goodRace()], clubClasses, catalogue, '').issues[0]).toContain('affiliation');
  });
});

describe('PY return helpers', () => {
  it('finds club classes by name, or by id after a rename', () => {
    const classes: BoatClass[] = [
      { id: 'Fusion 2', name: 'Fusion 2', handicaps: [] },
      { id: 'RS Vaero', name: 'RS Vareo', handicaps: [] },
    ];

    expect(findClubClass('Fusion 2', classes)?.id).toBe('Fusion 2');
    expect(findClubClass('RS Vareo', classes)?.id).toBe('RS Vaero');
    expect(findClubClass('RS Vaero', classes)?.name).toBe('RS Vareo');
    expect(findClubClass('rs vareo', classes)).toBeUndefined();
  });

  it('strips symbols from sail numbers', () => {
    expect(cleanSailNumber('GBR 123/4')).toBe('GBR1234');
  });

  it('maps published series ids back to their source series', () => {
    expect(sourceSeriesId('s-summer-abc')).toBe('s-summer-abc');
    expect(sourceSeriesId('s-summer-abc_cfg-py')).toBe('s-summer-abc');
    expect(sourceSeriesId('s-summer-abc_div_fast')).toBe('s-summer-abc');
  });

  it('writes the PY Online layout: title, header, a row per finisher, series race numbers, times in seconds', () => {
    const build = buildPyReturn([goodRace()], clubClasses, catalogue, 'AFF123');
    const lines = pyReturnToCsv(build.ret.series[0]).split('\n');

    expect(lines[0]).toBe('Complete race results');
    expect(lines[1]).toBe(
      'Class,Race Number,Race Date,Start Name,Rank,SailNo,Helm,Crew,pn,Laps,Elapsed,Corrected,Persons,Rig,Spin',
    );
    expect(lines).toHaveLength(6);
    expect(lines.slice(2).find(l => l.startsWith('ILCA 7 / Laser'))).toMatch(
      /^ILCA 7 \/ Laser,7,2026-06-06,-,1,GBR1234,Helm \d+,,1100,2,30\d0,30\d0,1,U,0$/,
    );
  });

  it('ranks unranked finishers by corrected time', () => {
    const unranked = race('r1', goodResults().map(r => ({ ...r, rank: 0 })));
    const build = buildPyReturn([unranked], clubClasses, catalogue, 'AFF123');
    const rows = pyReturnToCsv(build.ret.series[0]).split('\n').slice(2).map(l => l.split(','));

    expect(rows.map(cols => Number(cols[4])).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('names each file after its series', () => {
    expect(pyReturnFilename({ seriesId: 's1', eventName: 'Winter / Sunday: B2B', races: [] })).toBe(
      'Winter - Sunday- B2B - PY return.csv',
    );
  });
});
