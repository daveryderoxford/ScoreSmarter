import { describe, expect, it } from 'vitest';
import type { Race } from '../../model/race';
import {
  emptyMessagePeriodSuffix,
  groupRacesForPanel,
  isCompletedRace,
  isCanceledRace,
  isRaceVisibleForPeriodChip,
  isScheduledToday,
  periodChipNeededForRace,
  racePanelLabelLine1,
  racePanelLabelLine2,
} from './races-panel-utils';

const now = new Date(2026, 3, 29, 12, 0); // 2026-04-29 local

function race(overrides: Partial<Race>): Race {
  return {
    id: 'r',
    seriesId: 's1',
    seriesName: 'Series',
    fleetId: 'f1',
    index: 1,
    raceOfDay: 1,
    scheduledStart: new Date(2026, 3, 29, 10, 0),
    type: 'Handicap',
    status: 'Future',
    isDiscardable: true,
    isAverageLap: false,
    resultsSheetImage: '',
    dirty: false,
    ...overrides,
  };
}

describe('races-panel-utils', () => {
  it('treats races scheduled today as included regardless of period', () => {
    const today = race({ scheduledStart: new Date(2026, 3, 29, 9, 0) });
    expect(isScheduledToday(today, now)).toBe(true);
    expect(isRaceVisibleForPeriodChip(today, null, now)).toBe(true);
    expect(isRaceVisibleForPeriodChip(today, 'past', now)).toBe(true);
    expect(isRaceVisibleForPeriodChip(today, 'future', now)).toBe(true);
  });

  it('only includes past races when the past period chip is active', () => {
    const yesterday = race({ id: 'y', scheduledStart: new Date(2026, 3, 28, 9, 0) });
    expect(isRaceVisibleForPeriodChip(yesterday, null, now)).toBe(false);
    expect(isRaceVisibleForPeriodChip(yesterday, 'past', now)).toBe(true);
    expect(isRaceVisibleForPeriodChip(yesterday, 'future', now)).toBe(false);
  });

  it('only includes future races when the future period chip is active', () => {
    const tomorrow = race({ id: 't', scheduledStart: new Date(2026, 3, 30, 9, 0) });
    expect(isRaceVisibleForPeriodChip(tomorrow, null, now)).toBe(false);
    expect(isRaceVisibleForPeriodChip(tomorrow, 'past', now)).toBe(false);
    expect(isRaceVisibleForPeriodChip(tomorrow, 'future', now)).toBe(true);
  });

  it('emptyMessagePeriodSuffix describes the active period filters', () => {
    const all = ['past', 'future', 'hideCompleted'] as const;
    expect(emptyMessagePeriodSuffix(null, false, all)).toBe(' today');
    expect(emptyMessagePeriodSuffix('future', false, all)).toBe(' in future races');
    expect(emptyMessagePeriodSuffix('past', false, all)).toBe(' in past races');
    expect(emptyMessagePeriodSuffix('past', true, all)).toBe(
      ' in past races that do not have complete results',
    );
  });

  it('periodChipNeededForRace picks past for yesterday and future for tomorrow', () => {
    const yesterday = race({ scheduledStart: new Date(2026, 3, 28, 9, 0) });
    const tomorrow = race({ scheduledStart: new Date(2026, 3, 30, 9, 0) });
    expect(periodChipNeededForRace(yesterday, now)).toBe('past');
    expect(periodChipNeededForRace(tomorrow, now)).toBe('future');
  });

  it('groups races by local day, sorting future days ascending and races within a day by start, race of day, then series name', () => {
    const races = [
      race({ id: 'today-r2', scheduledStart: new Date(2026, 3, 29, 11, 0), raceOfDay: 2 }),
      race({ id: 'today-r1', scheduledStart: new Date(2026, 3, 29, 11, 0), raceOfDay: 1 }),
      race({ id: 'tomorrow-1', scheduledStart: new Date(2026, 3, 30, 9, 0), raceOfDay: 1 }),
      race({ id: 'next-week', scheduledStart: new Date(2026, 4, 5, 10, 0), raceOfDay: 1 }),
    ];

    const groups = groupRacesForPanel(races, 'future', now);
    const ids = groups.flatMap(g => g.races.map(r => r.id));

    expect(ids).toEqual(['today-r1', 'today-r2', 'tomorrow-1', 'next-week']);
    expect(groups[0].races.length).toBe(2);
    expect(groups[0].races[0].id).toBe('today-r1');
  });

  it('orders same-start races by race of day, then series name alphabetically', () => {
    const start = new Date(2026, 3, 29, 11, 0);
    const races = [
      race({ id: 'wednesday-2', seriesName: 'Wednesday', scheduledStart: start, raceOfDay: 2 }),
      race({ id: 'zeta-1', seriesName: 'Zeta', scheduledStart: start, raceOfDay: 1 }),
      race({ id: 'alpha-1', seriesName: 'Alpha', scheduledStart: start, raceOfDay: 1 }),
      race({ id: 'earlier', seriesName: 'Zeta', scheduledStart: new Date(2026, 3, 29, 10, 0), raceOfDay: 1 }),
    ];

    const groups = groupRacesForPanel(races, null, now);
    expect(groups[0].races.map(r => r.id)).toEqual(['earlier', 'alpha-1', 'zeta-1', 'wednesday-2']);
  });

  it('puts the most recent past day at the top when the past chip is active', () => {
    const races = [
      race({ id: 'two-days-ago', scheduledStart: new Date(2026, 3, 27, 10, 0) }),
      race({ id: 'yesterday', scheduledStart: new Date(2026, 3, 28, 10, 0) }),
      race({ id: 'today', scheduledStart: new Date(2026, 3, 29, 10, 0) }),
    ];

    const groups = groupRacesForPanel(races, 'past', now);

    expect(groups[0].races[0].id).toBe('today');
    expect(groups[1].races[0].id).toBe('yesterday');
    expect(groups[2].races[0].id).toBe('two-days-ago');
  });

  describe('isCompletedRace', () => {
    it('treats Completed, Published and Verified statuses as completed', () => {
      expect(isCompletedRace(race({ status: 'Completed' }))).toBe(true);
      expect(isCompletedRace(race({ status: 'Published' }))).toBe(true);
      expect(isCompletedRace(race({ status: 'Verified' }))).toBe(true);
    });

    it('treats other statuses as not completed', () => {
      expect(isCompletedRace(race({ status: 'Future' }))).toBe(false);
      expect(isCompletedRace(race({ status: 'In progress' }))).toBe(false);
      expect(isCompletedRace(race({ status: 'Canceled' }))).toBe(false);
      expect(isCompletedRace(race({ status: 'Postponed' }))).toBe(false);
    });
  });

  describe('isCanceledRace', () => {
    it('treats Canceled status as canceled', () => {
      expect(isCanceledRace(race({ status: 'Canceled' }))).toBe(true);
    });

    it('treats other statuses as not canceled', () => {
      expect(isCanceledRace(race({ status: 'Future' }))).toBe(false);
      expect(isCanceledRace(race({ status: 'Completed' }))).toBe(false);
      expect(isCanceledRace(race({ status: 'Postponed' }))).toBe(false);
    });
  });

  describe('racePanelLabel', () => {
    it('line 1 shows series and race index without a date', () => {
      expect(racePanelLabelLine1(race({ seriesName: 'Wednesday Series', index: 5, raceOfDay: 1 })))
        .toBe('Wednesday Series - Race 5');
      expect(racePanelLabelLine1(race({ seriesName: 'Sat', index: 3, raceOfDay: 2 })))
        .toBe('Sat - Race 3');
    });

    it('line 2 is undefined for the first race of the day', () => {
      expect(racePanelLabelLine2(race({ raceOfDay: 1 }))).toBeUndefined();
    });

    it('line 2 has an ordinal "race of day" label when raceOfDay > 1', () => {
      expect(racePanelLabelLine2(race({ raceOfDay: 2 }))).toBe('2nd race of day');
      expect(racePanelLabelLine2(race({ raceOfDay: 3 }))).toBe('3rd race of day');
      expect(racePanelLabelLine2(race({ raceOfDay: 4 }))).toBe('4th race of day');
      expect(racePanelLabelLine2(race({ raceOfDay: 11 }))).toBe('11th race of day');
    });
  });

  it('drops races that fall outside today and the active period', () => {
    const races = [
      race({ id: 'past', scheduledStart: new Date(2026, 3, 28, 10, 0) }),
      race({ id: 'future', scheduledStart: new Date(2026, 3, 30, 10, 0) }),
    ];

    const onlyToday = groupRacesForPanel(races, null, now);
    expect(onlyToday).toEqual([]);

    const futureOnly = groupRacesForPanel(races, 'future', now);
    expect(futureOnly.flatMap(g => g.races.map(r => r.id))).toEqual(['future']);
  });
});
