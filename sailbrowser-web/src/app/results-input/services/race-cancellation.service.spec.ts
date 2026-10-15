import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ScoringEngine } from 'app/published-results/services/scoring-engine';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceCancellationService } from './race-cancellation.service';

function race(id: string, seriesId: string): Race {
  return { id, seriesId, status: 'Future' } as Race;
}

describe('RaceCancellationService', () => {
  let updateRaces: ReturnType<typeof vi.fn>;
  let scoreCompleteSeries: ReturnType<typeof vi.fn>;
  let snackOpen: ReturnType<typeof vi.fn>;
  let service: RaceCancellationService;

  beforeEach(() => {
    updateRaces = vi.fn(() => Promise.resolve());
    scoreCompleteSeries = vi.fn(() => Promise.resolve());
    snackOpen = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: RaceCalendarStore, useValue: { updateRaces } },
        { provide: ScoringEngine, useValue: { scoreCompleteSeries } },
        { provide: MatSnackBar, useValue: { open: snackOpen } },
      ],
    });
    service = TestBed.inject(RaceCancellationService);
  });

  it('cancels the races with the reason and republishes each series once', async () => {
    await service.cancelRaces([race('r1', 's1'), race('r2', 's1'), race('r3', 's2')], ' No wind ');

    expect(updateRaces).toHaveBeenCalledWith([
      { id: 'r1', data: { status: 'Canceled', cancellationReason: 'No wind' } },
      { id: 'r2', data: { status: 'Canceled', cancellationReason: 'No wind' } },
      { id: 'r3', data: { status: 'Canceled', cancellationReason: 'No wind' } },
    ]);
    expect(scoreCompleteSeries.mock.calls).toEqual([['s1'], ['s2']]);
    expect(snackOpen).toHaveBeenCalledWith('3 races cancelled', undefined, { duration: 3000 });
  });

  it('reinstates a race, clearing its reason', async () => {
    await service.reinstateRace(race('r1', 's1'));

    const [[updates]] = updateRaces.mock.calls as [[{ id: string; data: Record<string, unknown> }[]]];
    expect(updates[0]!.id).toBe('r1');
    expect(updates[0]!.data['status']).toBe('In progress');
    expect(updates[0]!.data).toHaveProperty('cancellationReason');
    expect(scoreCompleteSeries).toHaveBeenCalledWith('s1');
    expect(snackOpen).toHaveBeenCalledWith('Race reinstated', undefined, { duration: 3000 });
  });

  it('keeps the cancellation but warns when publishing fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    scoreCompleteSeries.mockRejectedValueOnce(new Error('offline'));

    await service.cancelRaces([race('r1', 's1')], 'No wind');

    expect(updateRaces).toHaveBeenCalled();
    expect(snackOpen).toHaveBeenCalledWith('Race cancelled, but publishing the results failed', 'Dismiss');
  });
});
