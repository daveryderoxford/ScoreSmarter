import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ScoringEngine } from 'app/published-results/services/scoring-engine';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultsStateService } from './results-state.service';

describe('ResultsStateService', () => {
  let updateRaces: ReturnType<typeof vi.fn>;
  let scoreCompleteSeries: ReturnType<typeof vi.fn>;
  let service: ResultsStateService;

  const race = (status: Race['status']) =>
    ({ id: 'r1', seriesId: 's1', seriesName: 'Spring', index: 3, status }) as Race;

  beforeEach(() => {
    updateRaces = vi.fn(() => Promise.resolve());
    scoreCompleteSeries = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        { provide: RaceCalendarStore, useValue: { updateRaces } },
        { provide: ScoringEngine, useValue: { scoreCompleteSeries } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    service = TestBed.inject(ResultsStateService);
  });

  it('marks a completed race final and republishes its series', async () => {
    await service.setResultsState(race('Completed'), 'final');

    expect(updateRaces).toHaveBeenCalledWith([{ id: 'r1', data: { resultsState: 'final' } }]);
    expect(scoreCompleteSeries).toHaveBeenCalledWith('s1');
  });

  it('refuses to mark a race final before every entry has a result', async () => {
    await expect(service.setResultsState(race('In progress'), 'final')).rejects.toThrow();
    expect(updateRaces).not.toHaveBeenCalled();
  });

  it('can always return results to provisional', async () => {
    await service.setResultsState(race('In progress'), 'provisional');

    expect(updateRaces).toHaveBeenCalledWith([{ id: 'r1', data: { resultsState: 'provisional' } }]);
  });
});
