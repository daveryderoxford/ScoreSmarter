import { signal } from '@angular/core';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { Race } from 'app/race-calender';
import { Series } from 'app/race-calender/model/series';
import { RaceCalendarStore } from 'app/race-calender/services/full-race-calander';
import { ScoringEngine } from 'app/published-results';
import { CurrentRaces, RaceCompetitor, RaceCompetitorStore, SeriesEntryStore } from 'app/results-input';
import { SeriesEntry } from 'app/results-input/model/series-entry';
import { ManualResultsService, OrderEntryPersistInput } from '../../services/manual-results.service';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import type { HandicapConfiguration, LevelRatingConfiguration } from 'app/scoring/model/scoring-configuration';
import { ManualResultsPage } from './manual-results-page';

const RACE_H_ID = 'story-race-handicap';
const RACE_H2_ID = 'story-race-handicap-2';
const RACE_LR_ID = 'story-race-level';
const SERIES_H_ID = 'story-series-handicap';
const SERIES_LR_ID = 'story-series-level';

function baseRace(id: string, seriesId: string, type: Race['type']): Race {
  const start = new Date('2026-03-27T10:00:00');
  return {
    id,
    seriesName: type === 'Handicap' ? 'Wednesday Handicap' : 'ILCA 7 Series',
    fleetId: 'fleet-1',
    index: 1,
    seriesId,
    scheduledStart: start,
    raceOfDay: 1,
    actualStart: start,
    timeInputMode: 'tod',
    type,
    status: 'Future',
    isDiscardable: true,
    isAverageLap: true,
    dirty: false,
    resultsSheetImage: '',
  };
}

interface CompSeed {
  id: string;
  helm: string;
  boatClass: string;
  sailNumber: number;
  raceId: string;
  seriesId: string;
  startTime?: Date;
  manualFinishTime?: Date;
  manualLaps?: number;
  manualPosition?: number;
  resultCode?: RaceCompetitor['resultCode'];
  handicapValue?: number;
}

function comp(p: CompSeed): RaceCompetitor {
  return new RaceCompetitor({
    id: p.id,
    raceId: p.raceId,
    seriesId: p.seriesId,
    seriesEntryId: `entry-${p.id}`,
    startTime: p.startTime,
    manualFinishTime: p.manualFinishTime,
    manualLaps: p.manualLaps ?? 0,
    manualPosition: p.manualPosition,
    resultCode: p.resultCode ?? 'NOT FINISHED',
  });
}

function entryFor(p: CompSeed): SeriesEntry {
  return {
    id: `entry-${p.id}`,
    seriesId: p.seriesId,
    helm: p.helm,
    boatClass: p.boatClass,
    sailNumber: p.sailNumber,
    handicaps: [{ scheme: 'PY', value: p.handicapValue ?? 1104 }],
  };
}

function compsAndEntries(seeds: CompSeed[]): { comps: RaceCompetitor[]; entries: SeriesEntry[] } {
  return { comps: seeds.map(comp), entries: seeds.map(entryFor) };
}

const primaryHandicap: HandicapConfiguration = {
  id: 'overall',
  name: 'PY',
  type: 'Handicap',
  fleet: {
    type: 'HandicapRange',
    id: 'slow',
    name: 'Slow handicap',
    scheme: 'PY',
    min: 1000,
    max: 9999,
  },
  handicapScheme: 'PY',
};

const primaryLevel: LevelRatingConfiguration = {
  id: 'overall',
  name: 'ILCA 7',
  type: 'LevelRating',
  fleet: { type: 'BoatClass', id: 'ilca7', boatClassId: 'ILCA 7' },
  handicapScheme: 'Level Rating',
};

const seriesHandicap: Series = {
  id: SERIES_H_ID,
  seasonId: '2526',
  name: 'Wednesday Handicap',
  archived: false,
  scoringAlgorithm: 'short',
  entryAlgorithm: 'helm',
  initialDiscardAfter: 4,
  subsequentDiscardsEveryN: 999,
  primaryScoringConfiguration: primaryHandicap,
};

const seriesLevel: Series = {
  ...seriesHandicap,
  id: SERIES_LR_ID,
  name: 'ILCA 7 Spring',
  primaryScoringConfiguration: primaryLevel,
};

const raceHandicap = baseRace(RACE_H_ID, SERIES_H_ID, 'Handicap');
const raceHandicap2: Race = {
  ...raceHandicap,
  id: RACE_H2_ID,
  index: 2,
  raceOfDay: 2,
};
const raceLevel = baseRace(RACE_LR_ID, SERIES_LR_ID, 'Level Rating');

const start = raceHandicap.actualStart!;

const handicapData = compsAndEntries([
  {
    id: 'c1', raceId: RACE_H_ID, seriesId: SERIES_H_ID,
    helm: 'Alex', boatClass: 'ILCA 7', sailNumber: 100001,
    startTime: start, manualFinishTime: new Date(start.getTime() + 45 * 60 * 1000),
    manualLaps: 3, resultCode: 'OK',
  },
  {
    id: 'c2', raceId: RACE_H_ID, seriesId: SERIES_H_ID,
    helm: 'Blake', boatClass: 'ILCA 6', sailNumber: 200002,
    startTime: start, manualFinishTime: new Date(start.getTime() + 48 * 60 * 1000),
    manualLaps: 3, resultCode: 'OK',
  },
  { id: 'c3', raceId: RACE_H_ID, seriesId: SERIES_H_ID, helm: 'Chris', boatClass: 'ILCA 7', sailNumber: 100003 },
  { id: 'c4', raceId: RACE_H_ID, seriesId: SERIES_H_ID, helm: 'Dana', boatClass: 'RS Aero 7', sailNumber: 4004, handicapValue: 1063 },
]);

const handicapData2 = compsAndEntries([
  {
    id: 'c1b', raceId: RACE_H2_ID, seriesId: SERIES_H_ID,
    helm: 'Alex', boatClass: 'ILCA 7', sailNumber: 100001,
    startTime: start, manualFinishTime: new Date(start.getTime() + 46 * 60 * 1000),
    manualLaps: 3, resultCode: 'OK',
  },
  { id: 'c2b', raceId: RACE_H2_ID, seriesId: SERIES_H_ID, helm: 'Blake', boatClass: 'ILCA 6', sailNumber: 200002 },
]);

const levelData = compsAndEntries([
  { id: 'l1', raceId: RACE_LR_ID, seriesId: SERIES_LR_ID, helm: 'Erin', boatClass: 'ILCA 7', sailNumber: 111 },
  { id: 'l2', raceId: RACE_LR_ID, seriesId: SERIES_LR_ID, helm: 'Frank', boatClass: 'ILCA 7', sailNumber: 222, manualPosition: 1, resultCode: 'OK' },
]);

function createManualResultsStub(): ManualResultsService {
  return {
    calculateStats: () => null,
    setStartTime: async () => undefined,
    recordResult: async () => undefined,
    persistOrderEntryState: async (_input: OrderEntryPersistInput) => undefined,
  } as unknown as ManualResultsService;
}

type StoryStores = {
  races: Race[];
  competitors: RaceCompetitor[];
  entries: SeriesEntry[];
  series: Series[];
};

function applicationConfigForStores(stores: StoryStores) {
  const racesSig = signal(stores.races);
  const compsSig = signal(stores.competitors);
  const entriesSig = signal(stores.entries);
  const seriesSig = signal(stores.series);

  return applicationConfig({
    providers: [
      { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      { provide: CurrentRaces, useValue: { selectedRaces: racesSig.asReadonly() } },
      { provide: RaceCompetitorStore, useValue: { selectedCompetitors: compsSig.asReadonly() } },
      { provide: SeriesEntryStore, useValue: { selectedEntries: entriesSig.asReadonly() } },
      {
        provide: RaceCalendarStore,
        useValue: {
          allSeries: seriesSig.asReadonly(),
          allRaces: signal<Race[]>([]).asReadonly(),
        },
      },
      { provide: ManualResultsService, useValue: createManualResultsStub() },
      { provide: ScoringEngine, useValue: { publishRace: async () => undefined } },
      { provide: DialogsService, useValue: { message: async () => false } },
    ],
  });
}

const meta: Meta<ManualResultsPage> = {
  title: 'Results Input/ManualResultsPage',
  component: ManualResultsPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Results entry shell: race selector, publish, handicap time entry + table or position-based order entry. Stores are stubbed for Storybook.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<ManualResultsPage>;

export const HandicapRace: Story = {
  args: { raceId: RACE_H_ID },
  decorators: [
    applicationConfigForStores({
      races: [raceHandicap],
      competitors: handicapData.comps,
      entries: handicapData.entries,
      series: [seriesHandicap],
    }),
  ],
};

export const LevelRatingRace: Story = {
  args: { raceId: RACE_LR_ID },
  decorators: [
    applicationConfigForStores({
      races: [raceLevel],
      competitors: levelData.comps,
      entries: levelData.entries,
      series: [seriesLevel],
    }),
  ],
};

/** Two handicap races in the selector; pre-selects the first. */
export const MultipleHandicapRaces: Story = {
  args: { raceId: RACE_H_ID },
  decorators: [
    applicationConfigForStores({
      races: [raceHandicap, raceHandicap2],
      competitors: [...handicapData.comps, ...handicapData2.comps],
      entries: [...handicapData.entries, ...handicapData2.entries],
      series: [seriesHandicap],
    }),
  ],
};
