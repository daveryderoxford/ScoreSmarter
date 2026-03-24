import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { RaceCalendarStore } from 'app/race-calender';
import { ScoringEngine } from 'app/published-results';
import { ManualResultsPage } from '../presentation/manual-results-page/manual-results-page';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';

/**
 * A route guard that checks for "dirty" races before deactivating the route.
 * If any dirty races are found, it automatically publishes them using the ScoringEngine.
 */
export const dirtyRaceGuard: CanDeactivateFn<ManualResultsPage> = async (component, currentRoute, currentState, nextState) => {
  const raceStore = inject(RaceCalendarStore);
  const snackbar = inject(MatSnackBar);
  const dialog = inject(DialogsService);

  const scoringEngine = inject(ScoringEngine);

  // Find all races and series that have been marked as dirty
  const dirtyRaces = raceStore.allRaces().filter(race => race.dirty);
  const dirtySeries = raceStore.allSeries().filter(series => series.dirty);

  if (dirtyRaces.length === 0 && dirtySeries.length === 0) {
    return true; // No dirty data, allow navigation immediately.
  }

  console.log(`ManualResultsInput: Found ${dirtyRaces.length} race(s) and ${dirtySeries.length} series to publish...`);

  snackbar.open('Scoring results', 'Cancel');

  try {
    for (const race of dirtyRaces) {
      await scoringEngine.publishRace(race);
    }
  /*  // 1. Publish dirty races
    const publishPromises = dirtyRaces.map(race => scoringEngine.publishRace(race));
    await Promise.all(publishPromises);

    // 2. Rescore dirty series
  //  const rescorePromises = dirtySeries.map(series => scoringEngine.scoreCompleteSeries(series.id));
  //  await Promise.all(rescorePromises); */
  } catch (e: unknown) {
    console.error(`DirtyRaceGuard:  Error encountered publishing race results
      ${dirtyRaces.map( race => race.id + '  ')}
      ${e}
      `);
    snackbar.dismiss();
    const ret = await dialog.confirm('Error processing results', 'Press OK to exit or cancel to remain on page');
     return ret; 
    } 
  snackbar.dismiss();

  return true; // Allow navigation to proceed.
};
