import { ChangeDetectionStrategy, Component, computed, inject, input, signal, Signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Toolbar } from "app/shared/components/toolbar";
import { MatCardModule } from "@angular/material/card";
import { MatListModule } from "@angular/material/list";
import { MatIconModule } from '@angular/material/icon';
import { LoadingCentered } from "app/shared/components/loading-centered";
import { MatButtonModule } from '@angular/material/button';
import { RaceListItem } from "../race-list-item/race-list-item";
import { MatSnackBar } from '@angular/material/snack-bar';
import { seriesScoringSchemeDetails } from 'app/scoring/model/scoring-algotirhm';
import { seriesEntryGroupingDetails } from 'app/scoring';
import { Race, RaceCalendarStore, Series } from 'app/race-calender';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { ClubStore } from 'app/club-tenant';

/** Displays series details with a list of races 
 * Includes buttons to add/edit races and duplicate the series
*/
@Component({
   selector: 'app-series-details',
   imports: [DatePipe, Toolbar, MatListModule, MatCardModule, MatIconModule, MatButtonModule, LoadingCentered, RaceListItem],
   templateUrl: 'series-details.html',
   styles: [`
      @use "mixins" as mix;
      @include mix.centered-column-page(".content", 400px);

    .race-header  {
       display: flex; 
       align-items: center; 
       margin-left: 10px;
       margin-right: 10px;
    }
    .spacer { flex: 1 0 0}

    .scoring-details {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 16px;
    }
    .detail-item {
      display: flex;
      justify-content: space-between;
    }
    .detail-label { font-weight: 500; }

  `],
   changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesDetails {

   id = input.required<string>();  // Route parameter

   private router = inject(Router);
   protected rc = inject(RaceCalendarStore);
   private clubStore = inject(ClubStore);
   private ds = inject(DialogsService);
   private snackbar = inject(MatSnackBar);

   // Reactive state derived from services
   series = computed(() => this.rc.allSeries().find(s => s.id === this.id())!);
   fleets = computed(() => this.clubStore.club().fleets);
   fleet = computed(() => this.fleets().find((f) => f.shortName === this.series()?.fleetId));

   scoringSchemeName = computed(() => {
      const scheme = this.series()?.scoringScheme?.scheme;
      if (!scheme) return '';
      return seriesScoringSchemeDetails.find(s => s.name === scheme)?.displayName ?? '';
   });

   entryAlgorithmName = computed(() => {
      const algorithm = this.series()?.scoringScheme?.entryAlgorithm;
      if (!algorithm) return '';
      return seriesEntryGroupingDetails.find(a => a.name === algorithm)?.displayName ?? '';
   });

   races = this.rc.getSeriesRaces(this.id);

   busy = signal(false);

   copySeries(series: Series) {
      this.router.navigate(['/race-calender', 'copy', series.id]);
   }

   editSeries(id: string) {
      this.router.navigate(['/race-calender', 'edit', id]);
   }

   addRace(seriesId: string) {
      this.router.navigate(['/race-calender/series-details', seriesId, 'add-race']);
   }

   editRace(race: Race) {
      this.router.navigate(['/race-calender/series-details', this.series().id, 'edit-race', race.id]);
   }

   async deleteRace(race: Race) {
      if (await this.ds.confirm('Delete race', 'Are you sure you want to delete this race?')) {
         try {
            this.busy.set(true);
            await this.rc.deleteRace(race);
         } catch (error: any) {
            this.snackbar.open("Error deleting race", "Dismiss", { duration: 3000 });
            console.log('SeriesDetails. Error deleting race: ' + error.toString());
         } finally {
            this.busy.set(false);
         }
      }
   }

   async deleteSeries(id: string) {

      if (await this.ds.confirm('Delete series', 'Are you sure you want to delete this series?')) {
         try {
            this.busy.set(true);
            await this.rc.deleteSeries(id);
         } catch (error: any) {
            this.snackbar.open("Error deleting series", "Dismiss", { duration: 3000 });
            console.log('SeriesDetails. Error deleting series: ' + error.toString());
         } finally {
            this.busy.set(false);
         }

         this.router.navigate(['/series']);
      }
   }
}