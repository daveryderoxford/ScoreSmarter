import { Routes } from '@angular/router';
import { authGuard } from 'app/auth/guards/auth-guard';
import { pendingChangesGuard } from 'app/shared/services/pending-changes-guard-service.guard';
import { UserPage } from './presentation/user-page';

export const USER_ROUTES: Routes = [
  { path: '', title: 'Account', component: UserPage, canActivate: [authGuard], canDeactivate: [pendingChangesGuard] },
];
