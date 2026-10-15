import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceCancellationService } from '../../services/race-cancellation.service';
import { CancelRacesDialog, CancelRacesDialogData } from './cancel-races-dialog';

function race(id: string, hour: number, status: Race['status'] = 'Future'): Race {
  return {
    id,
    seriesId: 's1',
    seriesName: 'Summer',
    index: hour,
    scheduledStart: new Date(`2026-06-10T${hour}:00:00`),
    status,
  } as Race;
}

const am = race('am', 11);
const pm = race('pm', 14);
const gone = race('gone', 16, 'Canceled');

describe('CancelRacesDialog', () => {
  let close: ReturnType<typeof vi.fn>;
  let cancelRaces: ReturnType<typeof vi.fn>;

  function render(data: CancelRacesDialogData, allRaces = [am, pm, gone]) {
    TestBed.configureTestingModule({
      imports: [CancelRacesDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
        { provide: RaceCalendarStore, useValue: { allRaces: signal(allRaces) } },
        { provide: RaceCancellationService, useValue: { cancelRaces } },
      ],
    });
    const fixture = TestBed.createComponent(CancelRacesDialog);
    fixture.detectChanges();
    const dialog = fixture.componentInstance as unknown as {
      dayRaces(): Race[];
      selected(): ReadonlySet<string>;
      selectAll(checked: boolean): void;
      canConfirm(): boolean;
      reason: { setValue(v: string): void };
      confirm(): Promise<void>;
    };
    return { fixture, dialog };
  }

  beforeEach(() => {
    close = vi.fn();
    cancelRaces = vi.fn(() => Promise.resolve());
  });

  it("lists the day's races that are not already cancelled", () => {
    const { dialog } = render({ race: am });
    expect(dialog.dayRaces().map(r => r.id)).toEqual(['am', 'pm']);
  });

  it('pre-selects only the given race', () => {
    const { dialog } = render({ race: pm });
    expect([...dialog.selected()]).toEqual(['pm']);
  });

  it('pre-selects the whole day when asked', () => {
    const { dialog } = render({ race: am, cancelWholeDay: true });
    expect([...dialog.selected()]).toEqual(['am', 'pm']);
  });

  it('selects and clears all races with the toggle', () => {
    const { dialog } = render({ race: am });
    dialog.selectAll(true);
    expect(dialog.selected().size).toBe(2);
    dialog.selectAll(false);
    expect(dialog.selected().size).toBe(0);
  });

  it('needs a reason before cancelling', async () => {
    const { dialog } = render({ race: am });
    expect(dialog.canConfirm()).toBe(false);

    await dialog.confirm();
    expect(cancelRaces).not.toHaveBeenCalled();

    dialog.reason.setValue('No wind');
    expect(dialog.canConfirm()).toBe(true);
  });

  it('cancels the selected races with the reason', async () => {
    const { dialog } = render({ race: am, cancelWholeDay: true });
    dialog.reason.setValue('No wind');

    await dialog.confirm();

    expect(cancelRaces).toHaveBeenCalledWith([am, pm], 'No wind');
    expect(close).toHaveBeenCalledWith(true);
  });
});
