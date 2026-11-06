import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ClubStore } from 'app/club-tenant';
import type { Fleet } from 'app/club-tenant/model/fleet';
import type { Division } from 'app/race-calendar/model/division';
import type { Race } from 'app/race-calendar/model/race';
import type { Series } from 'app/race-calendar/model/series';
import { RaceCalendarStore } from 'app/race-calendar/services/full-race-calendar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceStartTimeDialog } from './race-start-time-dialog';

const ilca: Fleet = { type: 'BoatClass', id: 'ilca', boatClassId: 'ILCA 7' };
const general: Fleet = { type: 'GeneralHandicap', id: 'gh', name: 'General Handicap' };
const juniors: Division = { id: 'jun', name: 'Juniors', scoreAs: 'none', display: { style: 'text' } };
const blank: Division = { id: 'blank', name: '  ', scoreAs: 'none', display: { style: 'text' } };

function race(overrides: Partial<Race> = {}): Race {
  return {
    id: 'r1',
    seriesId: 's1',
    seriesName: 'Saturday',
    fleetId: 'gh',
    index: 1,
    scheduledStart: new Date(2026, 5, 6, 14, 0, 0),
    raceOfDay: 1,
    type: 'Handicap',
    status: 'Future',
    isDiscardable: true,
    isAverageLap: false,
    resultsSheetImage: '',
    dirty: false,
    timeInputMode: 'tod',
    starts: [
      { id: 'start-1', timeOfDay: new Date(2026, 5, 6, 14, 0, 0), fleetId: 'ilca' },
      { id: 'start-2', timeOfDay: new Date(2026, 5, 6, 14, 5, 0), divisionId: 'jun' },
    ],
    ...overrides,
  } as Race;
}

function series(divisions: Division[] = [juniors, blank]): Series {
  return { id: 's1', divisions } as Series;
}

describe('RaceStartTimeDialog', () => {
  let close: ReturnType<typeof vi.fn>;
  let getSeriesById: ReturnType<typeof vi.fn>;

  function render(dataRace = race(), seriesList: Series[] = [series()]) {
    TestBed.configureTestingModule({
      imports: [RaceStartTimeDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { race: dataRace } },
        { provide: MatDialogRef, useValue: { close } },
        { provide: ClubStore, useValue: { club: () => ({ fleets: [ilca, general] }) } },
        {
          provide: RaceCalendarStore,
          useValue: { allSeries: signal(seriesList), getSeriesById },
        },
      ],
    });
    const fixture = TestBed.createComponent(RaceStartTimeDialog);
    fixture.detectChanges();
    return { fixture, dialog: fixture.componentInstance };
  }

  beforeEach(() => {
    close = vi.fn();
    getSeriesById = vi.fn(() => Promise.resolve(undefined));
  });

  it('offers club fleets except General Handicap, and the series divisions', () => {
    const { dialog, fixture } = render();
    expect(fixture.nativeElement.textContent).toContain('Competitors');
    expect(dialog.fleetOptions).toEqual([{ id: 'ilca', name: 'ILCA 7' }]);
    expect(dialog.divisionOptions().map(d => d.id)).toEqual(['jun']);
    expect(dialog.starts.at(0).get('subset')?.value).toBe('fleet:ilca');
    expect(dialog.starts.at(1).get('subset')?.value).toBe('division:jun');
  });

  it('saves a fleet start and a division start', () => {
    const { dialog } = render();
    dialog.save();
    expect(close).toHaveBeenCalledOnce();
    const result = close.mock.calls[0][0];
    expect(result.mode).toBe('tod');
    expect(result.starts).toEqual([
      { id: 'start-1', timeOfDay: new Date(2026, 5, 6, 14, 0, 0), fleetId: 'ilca' },
      { id: 'start-2', timeOfDay: new Date(2026, 5, 6, 14, 5, 0), divisionId: 'jun' },
    ]);
  });

  it('rejects a fleet or division used twice, and allows one of each', () => {
    const { dialog } = render(race({ starts: undefined, actualStart: new Date(2026, 5, 6, 14, 0, 0) }));
    dialog.form.controls.startCount.setValue(2);
    dialog.starts.at(0).get('time')?.setValue(14 * 3600);
    dialog.starts.at(1).get('time')?.setValue(14 * 3600 + 300);
    dialog.starts.at(0).get('subset')?.setValue('fleet:ilca');
    dialog.starts.at(1).get('subset')?.setValue('division:jun');
    expect(dialog.hasDuplicateSubset()).toBe(false);

    dialog.starts.at(1).get('subset')?.setValue('fleet:ilca');
    expect(dialog.hasDuplicateSubset()).toBe(true);
    dialog.save();
    expect(close).not.toHaveBeenCalled();
  });

  it('loads divisions when the series is not in the calendar list yet', async () => {
    getSeriesById.mockResolvedValue(series());
    const { dialog, fixture } = render(race(), []);
    expect(getSeriesById).toHaveBeenCalledWith('s1');
    await fixture.whenStable();
    expect(dialog.divisionOptions().map(d => d.id)).toEqual(['jun']);
  });
});
