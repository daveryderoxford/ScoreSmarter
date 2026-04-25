import { Injectable, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Race } from 'app/race-calender';
import type { Series } from 'app/race-calender';
import { RaceCalendarStore } from '../../race-calender/services/full-race-calander';
import { CurrentRaces } from './current-races-store';

const FIXED_NOW = new Date('2026-04-06T12:00:00.000Z');

/** Same calendar day as `FIXED_NOW` in local timezone — matches `isScheduledToday` in the store. */
function todayAt(hours: number, minutes: number): Date {
  const d = new Date(FIXED_NOW);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function yesterdayAt(hours: number, minutes: number): Date {
  const d = todayAt(hours, minutes);
  d.setDate(d.getDate() - 1);
  return d;
}

function minimalSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: 'series-1',
    seasonId: 'season-1',
    name: 'Test Series',
    archived: false,
    scoringAlgorithm: 'short',
    entryAlgorithm: 'classSailNumberHelm',
    initialDiscardAfter: 0,
    subsequentDiscardsEveryN: 999,
    primaryScoringConfiguration: {
      id: 'cfg-py',
      name: 'PY',
      fleet: { type: 'GeneralHandicap', id: 'f-general', name: 'General Handicap' },
      type: 'Handicap',
      handicapScheme: 'PY',
    },
    ...overrides,
  } as Series;
}

function raceFixture(overrides: Partial<Race> & Pick<Race, 'id'>): Race {
  return {
    seriesId: 'series-1',
    seriesName: 'Test Series',
    fleetId: 'fleet-1',
    index: 1,
    scheduledStart: todayAt(10, 0),
    raceOfDay: 1,
    type: 'Handicap',
    status: 'Future',
    isDiscardable: true,
    isAverageLap: false,
    dirty: false,
    resultsSheetImage: '',
    ...overrides,
  };
}

@Injectable()
class FakeRaceCalendarStore {
  private readonly _allRaces = signal<Race[]>([]);
  private readonly _allSeries = signal<Series[]>([]);

  readonly allRaces = this._allRaces.asReadonly();
  readonly allSeries = this._allSeries.asReadonly();

  setAllRaces(races: Race[]): void {
    this._allRaces.set(races);
  }

  setAllSeries(series: Series[]): void {
    this._allSeries.set(series);
  }
}

describe('CurrentRaces', () => {
  let current: CurrentRaces;
  let fakeCalendar: FakeRaceCalendarStore;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);

    TestBed.configureTestingModule({
      providers: [
        CurrentRaces,
        { provide: RaceCalendarStore, useClass: FakeRaceCalendarStore },
      ],
    });

    current = TestBed.inject(CurrentRaces);
    fakeCalendar = TestBed.inject(RaceCalendarStore) as unknown as FakeRaceCalendarStore;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not duplicate a race that is both today and manually added', () => {
    fakeCalendar.setAllRaces([
      raceFixture({ id: 'today-a', index: 1, scheduledStart: todayAt(10, 0) }),
      raceFixture({ id: 'today-b', index: 1, scheduledStart: todayAt(11, 0) }),
    ]);
    current.addRaceId('today-a');

    expect(current.selectedRaceIds()).toEqual(['today-a', 'today-b']);
    expect(current.selectedRaces()).toHaveLength(2);
  });

  it('lists only today’s races in todaysRaces, sorted by start time then index', () => {
    fakeCalendar.setAllRaces([
      raceFixture({ id: 'later', index: 1, scheduledStart: todayAt(14, 0) }),
      raceFixture({ id: 'yesterday', index: 1, scheduledStart: yesterdayAt(10, 0) }),
      raceFixture({ id: 'earlier', index: 2, scheduledStart: todayAt(10, 0) }),
      raceFixture({ id: 'same-time-higher-index', index: 3, scheduledStart: todayAt(10, 0) }),
    ]);

    expect(current.todaysRaces().map(r => r.id)).toEqual([
      'earlier',
      'same-time-higher-index',
      'later',
    ]);
  });

  it('puts today’s races first in selectedRaceIds, then manual extras by time; ignores stale manual ids', () => {
    fakeCalendar.setAllRaces([
      raceFixture({ id: 'today-b', index: 1, scheduledStart: todayAt(11, 0) }),
      raceFixture({ id: 'today-a', index: 1, scheduledStart: todayAt(10, 0) }),
      raceFixture({ id: 'manual', index: 1, scheduledStart: yesterdayAt(15, 0) }),
    ]);

    current.addRaceId('manual');
    current.addRaceId('missing-id');

    expect(current.selectedRaceIds()).toEqual(['today-a', 'today-b', 'manual']);
  });

  it('removeRaceId drops a manual extra from selection', () => {
    fakeCalendar.setAllRaces([
      raceFixture({ id: 'today', index: 1, scheduledStart: todayAt(10, 0) }),
      raceFixture({ id: 'manual', index: 1, scheduledStart: yesterdayAt(12, 0) }),
    ]);
    current.addRaceId('manual');
    expect(current.selectedRaceIds()).toEqual(['today', 'manual']);

    current.removeRaceId('manual');
    expect(current.selectedRaceIds()).toEqual(['today']);
  });

  it('selectedSeries lists series that own selected races', () => {
    fakeCalendar.setAllSeries([minimalSeries({ id: 'series-1' }), minimalSeries({ id: 'series-2', name: 'Other' })]);
    fakeCalendar.setAllRaces([
      raceFixture({ id: 'r-a', seriesId: 'series-1', scheduledStart: todayAt(9, 0) }),
      raceFixture({ id: 'r-b', seriesId: 'series-2', scheduledStart: todayAt(10, 0) }),
    ]);

    expect(current.selectedSeries().map(s => s.id).sort()).toEqual(['series-1', 'series-2']);
  });
});
