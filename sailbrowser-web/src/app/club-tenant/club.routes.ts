import { Routes } from '@angular/router';
import { authGuard } from 'app/auth/guards/auth-guard';
import { pendingChangesGuard } from 'app/shared/services/pending-changes-guard-service.guard'; 
import { FleetPage } from './presentation/fleet-page/fleet-page';
import { FleetAdd } from './presentation/fleet-add';
import { FleetEdit } from './presentation/fleet-edit';
import { SeasonPage } from './presentation/season-page/season-page';
import { SeasonAdd } from './presentation/season-add';
import { SeasonEdit } from './presentation/season-edit';
import { ClassPage } from './presentation/class-page/class-page';
import { ClassAdd } from './presentation/class-add';
import { ClassEdit } from './presentation/class-edit';
import { DetailPlaceholder } from 'app/shared/layout/detail-placeholder';

export const CLUB_ROUTES: Routes = [
   {
      path: 'fleets',
      component: FleetPage,
      children: [
         {
            path: '',
            pathMatch: 'full',
            component: DetailPlaceholder,
            data: { message: 'Select a fleet to edit, or create a new one.' },
         },
         { path: 'add', component: FleetAdd, canDeactivate: [pendingChangesGuard], canActivate: [authGuard] },
         { path: 'edit/:id', component: FleetEdit, canDeactivate: [pendingChangesGuard], canActivate: [authGuard] },
      ],
   },
   { path: 'seasons', component: SeasonPage },
   { path: 'seasons/add', component: SeasonAdd, canDeactivate: [pendingChangesGuard], canActivate: [authGuard] },
   { path: 'seasons/edit/:id', component: SeasonEdit, canDeactivate: [pendingChangesGuard], canActivate: [authGuard] },
   { path: 'classes', component: ClassPage },
   { path: 'classes/add', component: ClassAdd, canDeactivate: [pendingChangesGuard], canActivate: [authGuard] },
   { path: 'classes/edit/:id', component: ClassEdit, canDeactivate: [pendingChangesGuard], canActivate: [authGuard] },
];
