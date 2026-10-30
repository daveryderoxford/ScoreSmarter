import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { RaceCalendarStore } from 'app/race-calender';
import type { Race } from 'app/race-calender/model/race';
import { CurrentRaces } from '../../services/current-races-store';
import { ScanSelectedRace } from './race-selection.store';
import { RaceStep } from './race-step';

function makeRace(id: string, index: number, type: Race['type']): Race {
  return {
    id,
    seriesId: 's1',
    seriesName: 'Opens',
    fleetId: 'f1',
    index,
    raceOfDay: 1,
    scheduledStart: new Date(2026, 8, 12, 10, 0),
    type,
    status: 'Completed',
    isDiscardable: true,
    isAverageLap: false,
    resultsSheetImage: '',
    dirty: false,
  };
}

const races = [makeRace('lr1', 1, 'Level Rating'), makeRace('lr2', 2, 'Level Rating'), makeRace('h1', 3, 'Handicap')];

function render() {
  TestBed.configureTestingModule({
    imports: [RaceStep],
    providers: [
      ScanSelectedRace,
      { provide: RaceCalendarStore, useValue: { allRaces: signal(races) } },
      { provide: CurrentRaces, useValue: { addRaceId: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(RaceStep);
  const selection = TestBed.inject(ScanSelectedRace);
  const chips = () =>
    [...fixture.nativeElement.querySelectorAll('mat-chip-row [matChipContent]')].map((e: Element) => e.textContent?.trim());
  return { fixture, selection, chips };
}

describe('RaceStep', () => {
  it('shows the selected Level Rating races as chips', () => {
    const { fixture, selection, chips } = render();
    selection.selectMany(['lr1', 'lr2']);
    fixture.detectChanges();
    expect(chips()).toEqual(['Opens - R1 - 12 Sept', 'Opens - R2 - 12 Sept']);
  });

  it('removes a race when its chip is removed', () => {
    const { fixture, selection } = render();
    selection.selectMany(['lr1', 'lr2']);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button[matChipRemove]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(selection.selectedRaceIds()).toEqual(['lr2']);
  });

  it('shows no chips for a handicap race', () => {
    const { fixture, selection, chips } = render();
    selection.selectMany(['h1']);
    fixture.detectChanges();
    expect(chips()).toEqual([]);
  });
});
