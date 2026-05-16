import { importProvidersFrom, signal } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { MOCK_PUBLISHED_SEASONS } from '@testing/mocks/published-results/published-season-mocks';
import { PublishedResultsReader } from '../../services/published-results-store';
import { SeasonPage } from './season-page';

function createMockReader(seasonsLoading = false): PublishedResultsReader {
  return {
    seasons: signal(MOCK_PUBLISHED_SEASONS).asReadonly(),
    seasonsLoading: signal(seasonsLoading).asReadonly(),
    selectedSeriesId: signal(undefined),
    series: signal(undefined),
    races: signal([]),
    seriesLoading: signal(false),
    seriesError: signal(null),
    getSeriesById: async () => undefined,
  } as unknown as PublishedResultsReader;
}

const meta: Meta<SeasonPage> = {
  title: 'Published Results/Season Page',
  component: SeasonPage,
  decorators: [
    applicationConfig({
      providers: [
        importProvidersFrom(RouterTestingModule),
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<SeasonPage>;

export const Default: Story = {
  decorators: [
    applicationConfig({
      providers: [{ provide: PublishedResultsReader, useValue: createMockReader(false) }],
    }),
  ],
};

export const Loading: Story = {
  decorators: [
    applicationConfig({
      providers: [{ provide: PublishedResultsReader, useValue: createMockReader(true) }],
    }),
  ],
};
