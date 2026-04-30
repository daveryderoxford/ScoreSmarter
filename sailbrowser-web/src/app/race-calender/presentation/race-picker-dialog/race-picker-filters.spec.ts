import type { Race } from '../../model/race';
import { describe, expect, it } from 'vitest';
import {
  dayGroupSortDirection,
  includesRace,
  matchesPeriod,
  pickInitialPeriod,
  statusesForHideIncomplete,
} from './race-picker-filters';

function race(overrides: Partial<Race>): Race {
  return {
    id: 'r',
    seriesId: 's1',
    seriesName: 'Series',
    fleetId: 'f1',
    index: 1,
    raceOfDay: 1,
    scheduledStart: new Date('2026-04-29T10:00:00'),
    type: 'Handicap',
    status: 'Future',
    isDiscardable: true,
    isAverageLap: false,
    resultsSheetImage: '',
    dirty: false,
    ...overrides,
  };
}

describe('race-picker-filters', () => {
  const now = new Date('2026-04-29T12:00:00');

  it('matches period ranges as expected', () => {
    expect(matchesPeriod(race({ scheduledStart: new Date('2026-04-29T09:00:00') }), 'today', now)).toBe(true);
    expect(matchesPeriod(race({ scheduledStart: new Date('2026-04-28T09:00:00') }), 'last7Days', now)).toBe(true);
    expect(matchesPeriod(race({ scheduledStart: new Date('2026-04-22T09:00:00') }), 'last7Days', now)).toBe(true);
    expect(matchesPeriod(race({ scheduledStart: new Date('2026-04-21T09:00:00') }), 'last7Days', now)).toBe(false);
    expect(matchesPeriod(race({ scheduledStart: new Date('2026-04-30T09:00:00') }), 'next7Days', now)).toBe(true);
    expect(matchesPeriod(race({ scheduledStart: new Date('2026-05-06T09:00:00') }), 'next7Days', now)).toBe(true);
    expect(matchesPeriod(race({ scheduledStart: new Date('2026-05-07T09:00:00') }), 'next7Days', now)).toBe(false);
  });

  it('supports date-specific filtering', () => {
    const r = race({ scheduledStart: new Date('2026-05-04T11:00:00') });
    expect(matchesPeriod(r, 'future', now)).toBe(true);
  });

  it('maps hideIncomplete status behaviour', () => {
    expect(statusesForHideIncomplete(true)).toEqual(['Future', 'In progress', 'Canceled', 'Postponed']);
    expect(statusesForHideIncomplete(false)).toContain('Completed');
  });

  it('applies period + hideIncomplete filter together', () => {
    const r = race({ scheduledStart: new Date('2026-04-28T09:00:00'), status: 'Completed' });
    expect(includesRace(r, 'last7Days', now, true)).toBe(false);
    expect(includesRace(r, 'last7Days', now, false)).toBe(true);
    expect(includesRace(race({ scheduledStart: r.scheduledStart, status: 'In progress' }), 'last7Days', now, true)).toBe(true);
  });

  it('picks period containing preselected race when preferred unavailable', () => {
    const races = [
      race({ id: 'past-1', scheduledStart: new Date('2026-04-20T10:00:00') }),
      race({ id: 'future-1', scheduledStart: new Date('2026-05-02T10:00:00') }),
    ];
    const period = pickInitialPeriod(
      ['today', 'past', 'future'],
      'next7Days',
      races,
      ['past-1'],
      now,
    );
    expect(period).toBe('past');
  });

  it('uses reverse date group order for past periods only', () => {
    expect(dayGroupSortDirection('past')).toBe('desc');
    expect(dayGroupSortDirection('last7Days')).toBe('desc');
    expect(dayGroupSortDirection('future')).toBe('asc');
    expect(dayGroupSortDirection('next7Days')).toBe('asc');
  });
});

