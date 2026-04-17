import { importProvidersFrom } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
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
