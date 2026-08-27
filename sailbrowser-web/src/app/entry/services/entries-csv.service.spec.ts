import { describe, expect, it } from 'vitest';
import type { BoatClass } from 'app/club-tenant/model/boat-class';
import type { Series } from 'app/race-calender/model/series';
import type { Race } from 'app/race-calender/model/race';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import {
  EntriesCsvService,
  type EntriesCsvContext,
  type EntriesCsvSeriesMapping,
} from './entries-csv.service';

const ilca: BoatClass = {
  id: 'ILCA 7',
  name: 'ILCA 7',
  handicaps: [{ scheme: 'PY', value: 1100 }],
  isSinglehander: true,
};

function makeSeries(over: Partial<Series> & Pick<Series, 'id' | 'name'>): Series {
  return {
    seasonId: 'season1',
    archived: false,
    scoringAlgorithm: 'short',
    entryAlgorithm: 'classSailNumberHelm',
    discards: [4],
    divisions: [
      { id: 'gold', name: 'Gold Fleet', scoreAs: 'none', display: { style: 'marker', markerColor: '#C9A227' } },
      { id: 'u16', name: 'Under 16', scoreAs: 'none', display: { style: 'marker', markerColor: '#1976D2' } },
    ],
    primaryScoringConfiguration: {
      id: 'cfg-py',
      name: 'PY',
      type: 'Handicap',
      handicapScheme: 'PY',
      fleet: { type: 'GeneralHandicap', id: 'f1', name: 'General Handicap' },
    },
    ...over,
  };
}

function makeRace(over: Partial<Race> & Pick<Race, 'id' | 'seriesId' | 'index'>): Race {
  return {
    seriesName: 'Spring',
    fleetId: 'f1',
    scheduledStart: new Date('2026-04-01T10:00:00Z'),
    raceOfDay: 1,
    type: 'Handicap',
    status: 'Future',
    isDiscardable: true,
    isAverageLap: false,
    dirty: false,
    resultsSheetImage: '',
    ...over,
  } as Race;
}

function context(over: Partial<EntriesCsvContext> = {}): EntriesCsvContext {
  const series = over.series ?? [
    makeSeries({ id: 's1', name: 'Spring Series' }),
    makeSeries({ id: 's2', name: 'Summer Series' }),
  ];
  return {
    series,
    races: over.races ?? [
      makeRace({ id: 'r1', seriesId: 's1', index: 1 }),
      makeRace({ id: 'r2', seriesId: 's1', index: 2 }),
      makeRace({ id: 'r3', seriesId: 's2', index: 1 }),
    ],
    classes: over.classes ?? [ilca],
    existingEntriesBySeriesId: over.existingEntriesBySeriesId ?? new Map(),
  };
}

const defaultMappings: EntriesCsvSeriesMapping[] = [
  { seriesId: 's1', csvSeriesName: '' },
];

describe('EntriesCsvService', () => {
  const service = new EntriesCsvService();

  it('accepts header aliases and builds a plan for mapped series', () => {
    const csv = [
      'Series name,Boat class,Helm,Sail No,Crew,Club,Division,Boat name',
      'Spring Series,ILCA 7,Alice Smith,1234,Bob,HYC,gold;u16,Flying Fish',
    ].join('\n');

    const plan = service.buildPlan(csv, defaultMappings, context());

    expect(plan.errors).toEqual([]);
    expect(plan.series).toHaveLength(1);
    expect(plan.series[0].seriesId).toBe('s1');
    expect(plan.series[0].races).toHaveLength(2);
    expect(plan.series[0].entries).toHaveLength(1);
    expect(plan.series[0].entries[0]).toMatchObject({
      helm: 'Alice Smith',
      boatClass: 'ILCA 7',
      sailNumber: '1234',
      crew: 'Bob',
      club: 'HYC',
      boatName: 'Flying Fish',
      divisions: ['gold', 'u16'],
    });
    expect(plan.series[0].entries[0].handicaps.some(h => h.scheme === 'PY' && h.value === 1100)).toBe(true);
  });

  it('skips rows whose series name is not mapped', () => {
    const csv = [
      'series,class,helm,sail number',
      'Spring Series,ILCA 7,Alice,1',
      'Other Event,ILCA 7,Bob,2',
    ].join('\n');

    const plan = service.buildPlan(csv, defaultMappings, context());

    expect(plan.errors).toEqual([]);
    expect(plan.series[0].entries).toHaveLength(1);
    expect(plan.series[0].entries[0].helm).toBe('Alice');
    expect(plan.ignoredSeriesNames).toEqual(['Other Event']);
    expect(plan.ignoredRowCount).toBe(1);
  });

  it('maps a different CSV series name onto a club series', () => {
    const csv = [
      'series,class,helm,sail number',
      'Open Meeting,ILCA 7,Alice,1',
    ].join('\n');

    const plan = service.buildPlan(
      csv,
      [{ seriesId: 's1', csvSeriesName: 'Open Meeting' }],
      context(),
    );

    expect(plan.errors).toEqual([]);
    expect(plan.series[0].seriesName).toBe('Spring Series');
    expect(plan.series[0].entries[0].helm).toBe('Alice');
  });

  it('reports missing required columns', () => {
    const plan = service.buildPlan('helm,crew\nAlice,\n', defaultMappings, context());
    expect(plan.errors.some(e => e.includes('Missing required columns'))).toBe(true);
    expect(plan.series).toEqual([]);
  });

  it('reports required-field errors with line numbers', () => {
    const csv = [
      'series,class,helm,sail number',
      'Spring Series,,Alice,1',
      'Spring Series,ILCA 7,,2',
    ].join('\n');

    const plan = service.buildPlan(csv, defaultMappings, context());
    expect(plan.errors).toEqual([
      'Line 2: class is required',
      'Line 3: helm is required',
    ]);
    expect(plan.series).toEqual([]);
  });

  it('rejects an unknown class', () => {
    const csv = [
      'series,class,helm,sail number',
      'Spring Series,Laser,Alice,1',
    ].join('\n');

    const plan = service.buildPlan(csv, defaultMappings, context());
    expect(plan.errors).toEqual(['Line 2: unknown class "Laser"']);
  });

  it('rejects unknown division ids', () => {
    const csv = [
      'series,class,helm,sail number,divisions',
      'Spring Series,ILCA 7,Alice,1,not-a-division',
    ].join('\n');

    const plan = service.buildPlan(csv, defaultMappings, context());
    expect(plan.errors).toEqual(['Line 2: unknown division id "not-a-division"']);
  });

  it('rejects a duplicate identity inside the file', () => {
    const csv = [
      'series,class,helm,sail number',
      'Spring Series,ILCA 7,Alice,1',
      'Spring Series,ilca 7,Alice,1',
    ].join('\n');

    const plan = service.buildPlan(csv, defaultMappings, context());
    expect(plan.errors[0]).toContain('duplicate of line 2');
    expect(plan.errors.length).toBeGreaterThan(0);
  });

  it('rejects an identity that already exists in the series', () => {
    const existing: SeriesEntry = {
      id: 'e1',
      seriesId: 's1',
      helm: 'Alice',
      boatClass: 'ILCA 7',
      sailNumber: '1',
      handicaps: [],
      divisions: [],
    };
    const csv = [
      'series,class,helm,sail number',
      'Spring Series,ILCA 7,Alice,1',
    ].join('\n');

    const plan = service.buildPlan(
      csv,
      defaultMappings,
      context({ existingEntriesBySeriesId: new Map([['s1', [existing]]]) }),
    );
    expect(plan.errors[0]).toContain('already entered');
  });

  it('rejects a mapped series with no races', () => {
    const csv = [
      'series,class,helm,sail number',
      'Spring Series,ILCA 7,Alice,1',
    ].join('\n');

    const plan = service.buildPlan(
      csv,
      defaultMappings,
      context({ races: [makeRace({ id: 'r3', seriesId: 's2', index: 1 })] }),
    );
    expect(plan.errors).toContain('Series "Spring Series" has no races.');
    expect(plan.series).toEqual([]);
  });

  it('rejects duplicate CSV series name mappings', () => {
    const csv = [
      'series,class,helm,sail number',
      'Spring Series,ILCA 7,Alice,1',
    ].join('\n');

    const plan = service.buildPlan(
      csv,
      [
        { seriesId: 's1', csvSeriesName: 'Spring Series' },
        { seriesId: 's2', csvSeriesName: 'spring series' },
      ],
      context(),
    );
    expect(plan.errors).toContain('CSV series name "spring series" is mapped more than once.');
  });
});
