import { importProvidersFrom, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterTestingModule } from '@angular/router/testing';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import type { Division } from 'app/race-calender/model/division';
import type { PublishedRace } from 'app/published-results/model/published-race';
import type { PublishedSeries } from 'app/published-results/model/published-series';
import { PUBLISHED_RACES_MOCKS } from '@testing/mocks/published-results/published-races-mocks';
import { MOCK_PUBLISHED_SEASONS } from '@testing/mocks/published-results/published-season-mocks';
import { PUBLIC_SERIES_MOCK } from '@testing/mocks/published-results/published-series-mocks';
import { PublishedResultsReader } from '../../services/published-results-store';
import { ResultsViewer } from './results-viewer';

const STORY_DIVISIONS: Division[] = [
  { id: 'gold', name: 'Gold Fleet', scoreAs: 'none', display: { style: 'marker', markerColor: '#C9A227' } },
  { id: 'u16', name: 'Under 16', scoreAs: 'none', display: { style: 'marker', markerColor: '#1976D2' } },
];

const seriesWithDivisions: PublishedSeries = {
  ...PUBLIC_SERIES_MOCK,
  divisionDefinitions: STORY_DIVISIONS,
  competitors: PUBLIC_SERIES_MOCK.competitors.map((c, i) => ({
    ...c,
    divisions: i === 0 ? ['gold'] : i === 1 ? ['gold', 'u16'] : [],
  })),
};

const racesWithDivisions: PublishedRace[] = PUBLISHED_RACES_MOCKS.map((race, idx) =>
  idx !== 0
    ? race
    : {
        ...race,
        divisionDefinitions: STORY_DIVISIONS,
        results: race.results.map((r, i) => ({
          ...r,
          divisions: i < 3 ? ['gold'] : i < 7 ? ['u16'] : [],
        })),
      },
);

/** Mirrors `PublishedResultsReader` public API for Storybook (no Firestore). */
function createMockReader(
  seriesLoading = false,
  series: PublishedSeries = PUBLIC_SERIES_MOCK,
  races: PublishedRace[] = PUBLISHED_RACES_MOCKS,
): PublishedResultsReader {
  return {
    seasons: signal(MOCK_PUBLISHED_SEASONS).asReadonly(),
    seasonsLoading: signal(false).asReadonly(),
    selectedSeriesId: signal<string | undefined>('s1'),
    series: signal(series).asReadonly(),
    races: signal(races).asReadonly(),
    seriesLoading: signal(seriesLoading).asReadonly(),
    seriesError: signal(null).asReadonly(),
    getSeriesById: async (id: string) => (id === series.id ? series : undefined),
  } as unknown as PublishedResultsReader;
}

const meta: Meta<ResultsViewer> = {
  title: 'Published Results/Results Viewer',
  component: ResultsViewer,
  decorators: [
    applicationConfig({
      providers: [
        importProvidersFrom(RouterTestingModule, MatIconModule, MatButtonModule),
      ],
    }),
  ],
  argTypes: {
    id: {
      control: false, // Controlled by the mock service
    },
  },
};

export default meta;
type Story = StoryObj<ResultsViewer>;

export const Default: Story = {
  args: {
    id: 's1',
  },
  decorators: [
    applicationConfig({
      providers: [{ provide: PublishedResultsReader, useValue: createMockReader(false) }],
    }),
  ],
};

export const Loading: Story = {
  ...Default,
  decorators: [
    applicationConfig({
      providers: [{ provide: PublishedResultsReader, useValue: createMockReader(true) }],
    }),
  ],
};

/** Series summary + races with division colour dots beside helm names. */
export const WithDivisions: Story = {
  args: {
    id: 's1',
  },
  decorators: [
    applicationConfig({
      providers: [{ provide: PublishedResultsReader, useValue: createMockReader(false, seriesWithDivisions, racesWithDivisions) }],
    }),
  ],
};
