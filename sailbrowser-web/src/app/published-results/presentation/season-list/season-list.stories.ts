import { importProvidersFrom } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { PublishedSeason } from 'app/published-results';
import { MOCK_PUBLISHED_SEASONS } from '@testing/mocks/published-results/published-season-mocks';
import { SeasonList } from './season-list';

const meta: Meta<SeasonList> = {
  title: 'Published Results/Season List',
  component: SeasonList,
  decorators: [
    applicationConfig({
      providers: [importProvidersFrom(RouterTestingModule)],
    }),
  ],
  argTypes: {
  },
  args: {
    seasons: MOCK_PUBLISHED_SEASONS,
  },
};

export default meta;
type Story = StoryObj<SeasonList>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    seasons: [],
  },
};

const today = new Date();
const fourDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4, 9, 0, 0);
const tenDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10, 9, 0, 0);
const twentyDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 20, 9, 0, 0);

const recentBadgeSeasons: PublishedSeason[] = [
  {
    id: 'recent-season',
    name: 'Recent Badge Demo',
    series: [
      {
        id: 'recent-series',
        name: 'Recent Series (shows badge)',
        fleetId: 'laser',
        startDate: twentyDaysAgo,
        endDate: fourDaysAgo,
        raceCount: 8,
        recentRaceCount6d: 3,
        lastPublishedRaceStart: fourDaysAgo,
      },
      {
        id: 'older-series',
        name: 'Older Series (no badge)',
        fleetId: 'laser',
        startDate: twentyDaysAgo,
        endDate: tenDaysAgo,
        raceCount: 6,
        recentRaceCount6d: 0,
        lastPublishedRaceStart: tenDaysAgo,
      },
    ],
  },
];

export const RecentRaceBadge: Story = {
  args: {
    seasons: recentBadgeSeasons,
  },
};
