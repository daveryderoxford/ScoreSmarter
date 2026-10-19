import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ScoringEngine } from 'app/published-results/services/scoring-engine';
import { canMarkFinal, RaceCalendarStore, resultsStateLabel, type ResultsState } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';

/** Club admin review: marks a race's results final or provisional, then republishes its series. */
@Injectable({ providedIn: 'root' })
export class ResultsStateService {
  private readonly raceCalendar = inject(RaceCalendarStore);
  private readonly scoringEngine = inject(ScoringEngine);
  private readonly snackbar = inject(MatSnackBar);

  async setResultsState(race: Race, state: ResultsState): Promise<void> {
    if (state === 'final' && !canMarkFinal(race)) {
      throw new Error('Results can only be final once every entry has a result.');
    }
    await this.raceCalendar.updateRaces([{ id: race.id, data: { resultsState: state } }]);
    const done = `${race.seriesName} race ${race.index}: results ${resultsStateLabel(state).toLowerCase()}`;
    try {
      await this.scoringEngine.scoreCompleteSeries(race.seriesId);
      this.snackbar.open(done, undefined, { duration: 3000 });
    } catch (e: unknown) {
      console.error('ResultsStateService: republishing failed', e);
      this.snackbar.open(`${done}, but publishing the results failed`, 'Dismiss');
    }
  }
}
