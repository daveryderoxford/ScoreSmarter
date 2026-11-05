import { describe, expect, it } from 'vitest';
import type { Race } from 'app/race-calendar/model/race';
import type { RaceStatus } from 'app/race-calendar/model/race-status';
import type { Series } from 'app/race-calendar/model/series';
import { eventSeriesNames, selectWholeEventSeries } from './event-race-selection.helpers';

function race(id: string, seriesId: string, status: RaceStatus = 'Future'): Race {
  return { id, seriesId, status } as Race;
}

const allSeries = [
  { id: 'ev', name: 'Open Aero 7', eventId: 'e1' },
  { id: 'club', name: 'Sunday Series' },
] as Series[];

const sat = race('sat', 'ev', 'In progress');
const sun1 = race('sun1', 'ev');
const sun2 = race('sun2', 'ev');
const done = race('done', 'ev', 'Completed');
const club1 = race('club1', 'club');
const club2 = race('club2', 'club');
const eligible = [done, sat, sun1, sun2, club1, club2];

const ids = (races: Race[]) => races.map(r => r.id);

describe('selectWholeEventSeries', () => {
  it('ticking one event race selects every Future race in that series', () => {
    expect(ids(selectWholeEventSeries([], [sun1], eligible, allSeries))).toEqual(['sun1', 'sun2']);
  });

  it('keeps an in-progress race the user ticked', () => {
    expect(ids(selectWholeEventSeries([], [sat], eligible, allSeries))).toEqual(['sat', 'sun1', 'sun2']);
  });

  it('unticking one event race clears the series', () => {
    expect(ids(selectWholeEventSeries([sun1, sun2, club1], [sun2, club1], eligible, allSeries))).toEqual(['club1']);
  });

  it('leaves club series races individual', () => {
    expect(ids(selectWholeEventSeries([], [club1], eligible, allSeries))).toEqual(['club1']);
    expect(ids(selectWholeEventSeries([club1, club2], [club2], eligible, allSeries))).toEqual(['club2']);
  });
});

describe('eventSeriesNames', () => {
  it('lists each event series once', () => {
    expect(eventSeriesNames([sun1, club1, sun2], allSeries)).toEqual(['Open Aero 7']);
  });
});
