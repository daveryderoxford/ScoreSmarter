import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Race } from 'app/race-calender';
import { ManualResultsService, OrderEntryPersistInput } from 'app/results-input/services/manual-results.service';
import { RaceCompetitor } from 'app/results-input';
import { PositionBasedInputPanel } from './position-based-input-panel';

/** Captured across stories / play for assertions */
const persistCalls: OrderEntryPersistInput[] = [];

function baseRace(type: Race['type']): Race {
  const start = new Date('2026-03-27T10:00:00');
  return {
    id: 'story-race-1',
    seriesName: 'Spring Series',
    fleetId: 'fleet-1',
    index: 1,
    seriesId: 'series-1',
    scheduledStart: start,
    raceOfDay: 1,
    actualStart: start,
    timeInputMode: 'tod',
    type,
    status: 'Completed',
    isDiscardable: false,
    isAverageLap: false,
    dirty: false,
  };
}

function comp(p: Partial<RaceCompetitor> & Pick<RaceCompetitor, 'id' | 'helm' | 'boatClass' | 'sailNumber'>): RaceCompetitor {
  return new RaceCompetitor({
    raceId: 'story-race-1',
    seriesId: 'series-1',
    seriesEntryId: `entry-${p.id}`,
    handicaps: [{ scheme: 'PY', value: 1000 }],
    resultCode: 'NOT FINISHED',
    manualLaps: 0,
    ...p,
  });
}

const pursuitCompetitors = [
  comp({ id: 'c1', helm: 'Alice', boatClass: 'ILCA 6', sailNumber: 201 }),
  comp({ id: 'c2', helm: 'Bob', boatClass: 'ILCA 7', sailNumber: 2010 }),
  comp({ id: 'c3', helm: 'Cormac', boatClass: 'GP14', sailNumber: 7890 }),
  comp({ id: 'c4', helm: 'Dana', boatClass: 'RS Aero', sailNumber: 3001 }),
];

function createManualResultsStub(): ManualResultsService {
  return {
    calculateStats: () => null,
    setStartTime: async () => undefined,
    recordResult: async () => undefined,
    persistOrderEntryState: async (input: OrderEntryPersistInput) => {
      persistCalls.push(input);
    },
  } as unknown as ManualResultsService;
}

function storyProviders() {
  return applicationConfig({
    providers: [
      { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      { provide: ManualResultsService, useValue: createManualResultsStub() },
    ],
  });
}

const meta: Meta<PositionBasedInputPanel> = {
  title: 'Results Input/ManualOrderEntry',
  component: PositionBasedInputPanel,
  tags: ['autodocs'],
  decorators: [storyProviders()],
  parameters: {
    docs: {
      description: {
        component:
          'Pursuit / Level Rating finish-order workflow: search, Enter (exact sail), drag-drop, mocked persistence.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<PositionBasedInputPanel>;

export const PursuitFresh: Story = {
  args: {
    race: baseRace('Pursuit'),
    competitors: pursuitCompetitors,
  },
};

export const LevelRatingFresh: Story = {
  args: {
    race: baseRace('Level Rating'),
    competitors: [...pursuitCompetitors],
  },
};

const starterProcessed = pursuitCompetitors.slice(0, 2).map(c => c.id);

export const PursuitWithExistingOrder: Story = {
  args: {
    race: baseRace('Pursuit'),
    competitors: pursuitCompetitors.map(c => {
      if (!starterProcessed.includes(c.id)) {
        return c;
      }
      return new RaceCompetitor({
        id: c.id,
        seriesEntryId: c.seriesEntryId,
        raceId: c.raceId,
        seriesId: c.seriesId,
        helm: c.helm,
        crew: c.crew,
        boatClass: c.boatClass,
        sailNumber: c.sailNumber,
        handicaps: c.handicaps,
        fleetId: c.fleetId,
        resultCode: 'OK',
        manualLaps: c.manualLaps,
        lapTimes: c.lapTimes,
        manualPosition: starterProcessed.indexOf(c.id) + 1,
      });
    }),
  },
};

/**
 * Interaction: type a unique sail number, Enter — should move that boat into the finish-order column
 * and call persist (mocked).
 */
export const ExactSailEnterAddsToOrder: Story = {
  ...PursuitFresh,
  play: async ({ canvasElement }) => {
    persistCalls.length = 0;

    const root = within(canvasElement);
    const search = root.getByRole('textbox', { name: /search sail/i });
    await userEvent.clear(search);
    await userEvent.type(search, '7890');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(root.queryAllByText('7890').length).toBeGreaterThanOrEqual(1);
    });
    expect(root.getByText('Cormac')).toBeTruthy();

    await waitFor(() => {
      expect(persistCalls.length).toBeGreaterThan(0);
    });
    const last = persistCalls[persistCalls.length - 1];
    expect(last.processedIds).toContain('c3');
  },
};
