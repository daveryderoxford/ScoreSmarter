import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { ClubStore } from 'app/club-tenant';
import { Series } from 'app/race-calender/model/series';
import { RaceCompetitor } from 'app/results-input/model/race-competitor';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { SeriesEntry } from 'app/results-input/model/series-entry';
import type { HandicapConfiguration } from 'app/scoring/model/scoring-configuration';
import { SeriesEntryEditForm } from './series-entry-edit-form';

const pyConfig: HandicapConfiguration = {
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

const storySeries: Series = {
  id: 's1',
  seasonId: '2526',
  name: 'Wednesday Handicap',
  archived: false,
  scoringAlgorithm: 'short',
  entryAlgorithm: 'classSailNumberHelm',
  initialDiscardAfter: 4,
  subsequentDiscardsEveryN: 999,
  primaryScoringConfiguration: pyConfig,
};

function makeCompetitor(partial: Partial<SeriesEntry>): ResolvedRaceCompetitor {
  const entry: SeriesEntry = {
    id: 'se-1',
    seriesId: 's1',
    helm: 'Sam Skipper',
    crew: '',
    boatClass: 'ILCA 7',
    sailNumber: 12345,
    handicaps: [{ scheme: 'PY', value: 1100 }],
    ...partial,
  };
  const comp = new RaceCompetitor({
    id: 'c1',
    raceId: 'r1',
    seriesId: 's1',
    seriesEntryId: entry.id,
    resultCode: 'OK',
  });
  return new ResolvedRaceCompetitor(comp, entry);
}

const clubWithIlca = {
  club: () => ({
    name: 'Storybook Sailing Club',
    fleets: [],
    classes: [
      { id: 'ilca7', name: 'ILCA 7', handicaps: [{ scheme: 'PY', value: 1100 }] },
      { id: 'ilca6', name: 'ILCA 6', handicaps: [{ scheme: 'PY', value: 1165 }] },
      { id: 'aero9', name: 'RS Aero 9', handicaps: [{ scheme: 'PY', value: 1030 }] },
    ],
  }),
};

const clubEmpty = {
  club: () => ({
    name: 'Storybook Sailing Club',
    fleets: [],
    classes: [],
  }),
};

function applicationConfigForClub(clubStoreValue: unknown) {
  return applicationConfig({
    providers: [
      { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      { provide: ClubStore, useValue: clubStoreValue },
    ],
  });
}

const meta: Meta<SeriesEntryEditForm> = {
  title: 'Results Input/SeriesEntryEditForm',
  component: SeriesEntryEditForm,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Single form for correcting an existing SeriesEntry (helm, crew, class, sail, personal band). Handicaps preview live from the selected class and band; they are not directly editable here.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<SeriesEntryEditForm>;

/** Class is in the club list - handicap chips populate from club defaults. */
export const KnownClass: Story = {
  args: {
    competitor: makeCompetitor({}),
    series: storySeries,
  },
  decorators: [applicationConfigForClub(clubWithIlca)],
};

/** Class is NOT in the club list - chips fall back to metadata default and show a warning. */
export const UnknownClass: Story = {
  args: {
    competitor: makeCompetitor({ boatClass: 'Random Dinghy' }),
    series: storySeries,
  },
  decorators: [applicationConfigForClub(clubEmpty)],
};

/** Personal band set: the Personal scheme value is derived from class PY. */
export const WithPersonalBand: Story = {
  args: {
    competitor: makeCompetitor({
      personalHandicapBand: 'Band2',
      handicaps: [
        { scheme: 'PY', value: 1100 },
        { scheme: 'Personal', value: 1166 },
      ],
    }),
    series: {
      ...storySeries,
      primaryScoringConfiguration: { ...pyConfig, handicapScheme: 'Personal' as const },
    },
  },
  decorators: [applicationConfigForClub(clubWithIlca)],
};
