import { Routes } from '@angular/router';
import { pendingChangesGuard } from 'app/shared/services/pending-changes-guard-service.guard';

export const CLUB_ADMIN_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./presentation/club-admin-switchboard').then(m => m.ClubAdminSwitchboard),
  },
  {
    path: 'race-review',
    loadComponent: () => import('./presentation/race-status-review/race-status-review').then(m => m.RaceStatusReviewComponent),
  },
  {
  path: 'scoring-defaults',
    canDeactivate: [pendingChangesGuard],
    loadComponent: () => import('./presentation/scoring-defaults/scoring-defaults').then(m => m.ScoringDefaultsComponent),
  },
];
