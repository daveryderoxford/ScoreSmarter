import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DutiesService } from 'app/duties';
import { raceDayDateId } from 'app/duties/services/duties.service';
import { ScoringEngine } from 'app/published-results/services/scoring-engine';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceDayDetailsDialog } from './race-day-details-dialog';

function race(id: string, start: Date, extra: Partial<Race> = {}): Race {
  return { id, seriesId: `s-${id}`, scheduledStart: start, status: 'Future', ...extra } as Race;
}

const day = new Date('2026-06-10T11:00:00');
const sameDayLater = new Date('2026-06-10T14:00:00');

describe('RaceDayDetailsDialog', () => {
  let close: ReturnType<typeof vi.fn>;
  let updateRaces: ReturnType<typeof vi.fn>;
  let scoreCompleteSeries: ReturnType<typeof vi.fn>;

  function render(opts: { race: Race; allRaces: Race[]; dutyDate?: string; duties?: { name: string; role: string }[] }) {
    TestBed.configureTestingModule({
      imports: [RaceDayDetailsDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { race: opts.race } },
        { provide: MatDialogRef, useValue: { close } },
        { provide: RaceCalendarStore, useValue: { allRaces: signal(opts.allRaces), updateRaces } },
        { provide: ScoringEngine, useValue: { scoreCompleteSeries } },
        {
          provide: DutiesService,
          useValue: { raceDayDate: signal(opts.dutyDate), duties: signal(opts.duties ?? []) },
        },
      ],
    });
    const fixture = TestBed.createComponent(RaceDayDetailsDialog);
    fixture.detectChanges();
    const dialog = fixture.componentInstance as unknown as {
      form: { controls: { raceOfficer: { value: string; setValue(v: string): void }; wind: { value: string; setValue(v: string): void } } };
      save(): Promise<void>;
    };
    return { fixture, dialog };
  }

  beforeEach(() => {
    close = vi.fn();
    updateRaces = vi.fn(() => Promise.resolve());
    scoreCompleteSeries = vi.fn(() => Promise.resolve());
  });

  it('pre-fills from the race, then from another race that day', () => {
    const r1 = race('r1', day, { wind: 'SW 10' });
    const r2 = race('r2', sameDayLater, { raceOfficer: 'Pat', wind: 'NE 20' });
    const { dialog } = render({ race: r1, allRaces: [r1, r2] });

    expect(dialog.form.controls.raceOfficer.value).toBe('Pat');
    expect(dialog.form.controls.wind.value).toBe('SW 10');
  });

  it("uses the duty team's race officer for today's races", () => {
    const r1 = race('r1', day);
    const { dialog } = render({
      race: r1,
      allRaces: [r1],
      dutyDate: raceDayDateId(undefined, day),
      duties: [{ name: 'Sam', role: 'Assistant' }, { name: 'Robin', role: 'Race Officer' }],
    });

    expect(dialog.form.controls.raceOfficer.value).toBe('Robin');
  });

  it('ignores the duty team for another day', () => {
    const r1 = race('r1', day);
    const { dialog } = render({
      race: r1,
      allRaces: [r1],
      dutyDate: '2026-06-11',
      duties: [{ name: 'Robin', role: 'Race Officer' }],
    });

    expect(dialog.form.controls.raceOfficer.value).toBe('');
  });

  it("saves to every race that day and republishes the published series", async () => {
    const r1 = race('r1', day, { status: 'Completed' });
    const r2 = race('r2', sameDayLater);
    const other = race('r3', new Date('2026-06-11T11:00:00'), { status: 'Completed' });
    const { dialog } = render({ race: r1, allRaces: [r1, r2, other] });
    dialog.form.controls.raceOfficer.setValue(' Pat ');
    dialog.form.controls.wind.setValue('SW 8-12 kts');

    await dialog.save();

    expect(updateRaces).toHaveBeenCalledWith([
      { id: 'r1', data: { raceOfficer: 'Pat', wind: 'SW 8-12 kts' } },
      { id: 'r2', data: { raceOfficer: 'Pat', wind: 'SW 8-12 kts' } },
    ]);
    expect(scoreCompleteSeries.mock.calls).toEqual([['s-r1']]);
    expect(close).toHaveBeenCalledWith(true);
  });
});
