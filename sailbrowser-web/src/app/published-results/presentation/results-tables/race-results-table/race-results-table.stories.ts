import type { Meta, StoryObj } from '@storybook/angular';
import type { ClubTagDefinition } from 'app/club-tenant/model/club-tag';
import { RaceResultsTable } from './race-results-table';
import { PUBLISHED_RACES_MOCKS } from '@testing/mocks/published-results/published-races-mocks';

const STORY_TAG_DEFINITIONS: ClubTagDefinition[] = [
  { id: 'gold', label: 'Gold Fleet', color: 'gold' },
  { id: 'u16', label: 'Under 16', color: 'blue' },
];

const meta: Meta<RaceResultsTable> = {
   title: 'Published Results/RaceResultsTable',
   component: RaceResultsTable,
   tags: ['autodocs'],
   argTypes: {
      showBoatClass: {
         control: 'boolean',
         description: 'Toggle visibility of the boat class column.',
      },
   },
};

export default meta;
type Story = StoryObj<RaceResultsTable>;

export const Default: Story = {
   args: {
      results: PUBLISHED_RACES_MOCKS[0].results,
      showBoatClass: true,
   },
};

export const WithDNSRaceResult: Story = {
  args: {
    results: [...PUBLISHED_RACES_MOCKS[0].results, { rank: 16, helm: 'Did Not Start', seriesEntryId: 'seriesEntry', competitorKey: 'seriesEntry', boatClass: 'Laser', sailNumber: 999, club: 'SBSC', finishTime: new Date('2024-05-01T12:00:00Z'), correctedTime: 99999, points: 16, resultCode: 'DNS', handicap: 1000, laps: 0, startTime: new Date('2024-05-01T12:00:00Z'), elapsedTime: 0, tags: [] }],
    showBoatClass: true,
  },
};

/** Tag colours as dots beside helm names (`tagDefinitions` + row `tags`). */
export const WithTags: Story = {
  args: {
    results: PUBLISHED_RACES_MOCKS[0].results.slice(0, 8).map((r, i) => ({
      ...r,
      tags: i < 2 ? ['gold'] : i < 5 ? ['u16'] : i === 5 ? ['gold', 'u16'] : [],
    })),
    tagDefinitions: STORY_TAG_DEFINITIONS,
    showBoatClass: true,
  },
};

export const WithoutBoatClass: Story = {
   args: {
      ...Default.args,
      showBoatClass: false,
   },
};

export const EmptyResults: Story = {
   args: {
      results: [],
      showBoatClass: true,
   },
};

export const SingleCompetitor: Story = {
   args: {
      results: [PUBLISHED_RACES_MOCKS[0].results[0]],
      showBoatClass: true,
   },
};
