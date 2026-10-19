import { inject, Injectable } from '@angular/core';
import { deleteField } from '@angular/fire/firestore';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ScoringEngine } from 'app/published-results/services/scoring-engine';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { raceStatusFromResultCodes } from 'app/race-calender/model/race-status';
import { RaceCompetitorStore } from './race-competitor-store';

/** Cancels and reinstates races, then republishes each affected series once. */
@Injectable({ providedIn: 'root' })
export class RaceCancellationService {
  private readonly raceCalendar = inject(RaceCalendarStore);
  private readonly competitors = inject(RaceCompetitorStore);
  private readonly scoringEngine = inject(ScoringEngine);
  private readonly snackbar = inject(MatSnackBar);

  async cancelRaces(races: readonly Race[], reason: string): Promise<void> {
    if (races.length === 0) return;
    await this.raceCalendar.updateRaces(
      races.map(r => ({ id: r.id, data: { status: 'Canceled', cancellationReason: reason.trim() } })),
    );
    await this.republish(races, races.length === 1 ? 'Race cancelled' : `${races.length} races cancelled`);
  }

  /** Clears the cancellation and works the status out from the race's results. */
  async reinstateRace(race: Race): Promise<void> {
    const seriesCompetitors = await this.competitors.getSeriesCompetitors(race.seriesId);
    const codes = seriesCompetitors.filter(c => c.raceId === race.id).map(c => c.resultCode);
    await this.raceCalendar.updateRaces([
      { id: race.id, data: { status: raceStatusFromResultCodes(codes), cancellationReason: deleteField() } },
    ]);
    await this.republish([race], 'Race reinstated');
  }

  private async republish(races: readonly Race[], done: string): Promise<void> {
    const seriesIds = [...new Set(races.map(r => r.seriesId))];
    try {
      for (const seriesId of seriesIds) {
        await this.scoringEngine.scoreCompleteSeries(seriesId);
      }
      this.snackbar.open(done, undefined, { duration: 3000 });
    } catch (e: unknown) {
      console.error('RaceCancellationService: republishing failed', e);
      this.snackbar.open(`${done}, but publishing the results failed`, 'Dismiss');
    }
  }
}
