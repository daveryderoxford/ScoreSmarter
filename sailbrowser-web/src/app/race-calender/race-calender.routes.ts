import { Routes } from '@angular/router';
import { authGuard } from 'app/auth/guards/auth-guard';
import { pendingChangesGuard } from 'app/shared/services/pending-changes-guard-service.guard';
import { DetailPlaceholder } from 'app/shared/layout/detail-placeholder';
import { RaceAdd } from './presentation/race-add/add-race';
import { RaceEdit } from './presentation/race-edit/race-edit';
import { SeriesAdd } from './presentation/series-add';
import { SeriesCopy } from './presentation/series-copy';
import { SeriesEdit } from './presentation/series-edit';
import { SeriesList } from './presentation/series-list';
import { SeriesDetails } from './presentation/series.details/series-details';

export const RACE_CALENDER_ROUTES: Routes = [
   {
      path: '',
      component: SeriesList,
      children: [
         {
            path: '',
            pathMatch: 'full',
            component: DetailPlaceholder,
            data: { message: 'Select a series to see its details and races.' },
         },
         { path: 'series-details/:id', component: SeriesDetails },
      ],
   },
   { path: 'add', component: SeriesAdd, canDeactivate: [pendingChangesGuard], canActivate: [authGuard] },
   { path: 'edit/:id', component: SeriesEdit, canDeactivate: [pendingChangesGuard], canActivate: [authGuard] },
   { path: 'copy/:id', component: SeriesCopy, canDeactivate: [pendingChangesGuard], canActivate: [authGuard] },
   { path: 'series-details/:seriesId/add-race', component: RaceAdd, canDeactivate: [pendingChangesGuard], canActivate: [authGuard] },
   { path: 'series-details/:seriesId/edit-race/:raceId', component: RaceEdit, canDeactivate: [pendingChangesGuard], canActivate: [authGuard] },
];