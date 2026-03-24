import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { RaceCalendarStore } from 'app/race-calender';
import { ScoringEngine } from 'app/published-results';
import { ManualResultsPage } from '../presentation/manual-results-page/manual-results-page';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';

/**
 * A route guard that checks for "dirty" series before deactivating the route.
 * If any dirty seris are found, it automatically recomputes all the results   
 * or all races in the series.
 */
export const dirtySeriesGuard: CanDeactivateFn<ManualResultsPage> = async (component, currentRoute, currentState, nextState) => {
   const raceStore = inject(RaceCalendarStore);
   const snackbar = inject(MatSnackBar);
   const dialog = inject(DialogsService);

   const scoringEngine = inject(ScoringEngine);

   // Find all races and series that have been marked as dirty
   const dirtySeries = raceStore.allSeries().filter(series => series.dirty);

   if (dirtySeries.length === 0) {
      return true; // No dirty data, allow navigation immediately.
   }

   console.log(`DirtySeriesGuard: Found ${dirtySeries.length} series to publish...`);

   snackbar.open('Scoring results', 'Cancel');

   try {
      for (const series of dirtySeries) {
         await scoringEngine.scoreCompleteSeries(series.id);
      }

   } catch (e: unknown) {
      console.error(`DirtySeriesGuard:  Error encountered publishing series results
      ${dirtySeries.map(series => series.id + '  ')}
      ${e}
      `);
      snackbar.dismiss();
      const ret = await dialog.confirm('Error processing results', 'Press OK to exit or cancel to remain on page');
      return ret;
   }
   snackbar.dismiss();

   return true; // Allow navigation to proceed.
};
