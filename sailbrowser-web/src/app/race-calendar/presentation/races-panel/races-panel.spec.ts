import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { Race } from '../../model/race';
import { RacesPanel } from './races-panel';

function makeRace(id: string, start: Date): Race {
  return {
    id,
    seriesId: 's1',
    seriesName: 'Series',
    fleetId: 'f1',
    index: 1,
    raceOfDay: 1,
    scheduledStart: start,
    type: 'Handicap',
    status: 'Future',
    isDiscardable: true,
    isAverageLap: false,
    resultsSheetImage: '',
    dirty: false,
  };
}

describe('RacesPanel', () => {
  const now = new Date(2026, 3, 29, 12, 0); // 2026-04-29
  const todayRace = makeRace('r-today', new Date(2026, 3, 29, 14, 0));
  const futureRace = makeRace('r-future', new Date(2026, 3, 30, 10, 0));

  it('defaults to "future" period when availableFilters is ["future"] and there are no races today', () => {
    const fixture = TestBed.createComponent(RacesPanel);
    fixture.componentRef.setInput('now', now);
    fixture.componentRef.setInput('availableFilters', ['future']);
    fixture.componentRef.setInput('races', [futureRace]);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    // Access protected selectedPeriod via prototype/property
    expect((comp as unknown as { selectedPeriod: () => string | null }).selectedPeriod()).toBe('future');
    expect((comp as unknown as { dayGroups: () => unknown[] }).dayGroups().length).toBe(1);
  });

  it('defaults to null (today) when availableFilters is ["future"] and races today exist', () => {
    const fixture = TestBed.createComponent(RacesPanel);
    fixture.componentRef.setInput('now', now);
    fixture.componentRef.setInput('availableFilters', ['future']);
    fixture.componentRef.setInput('races', [todayRace, futureRace]);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect((comp as unknown as { selectedPeriod: () => string | null }).selectedPeriod()).toBeNull();
    expect((comp as unknown as { dayGroups: () => unknown[] }).dayGroups().length).toBe(1);
  });

  it('respects initialPeriod when explicitly set', () => {
    const fixture = TestBed.createComponent(RacesPanel);
    fixture.componentRef.setInput('now', now);
    fixture.componentRef.setInput('availableFilters', ['future']);
    fixture.componentRef.setInput('initialPeriod', 'future');
    fixture.componentRef.setInput('races', [todayRace, futureRace]);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect((comp as unknown as { selectedPeriod: () => string | null }).selectedPeriod()).toBe('future');
  });
});
