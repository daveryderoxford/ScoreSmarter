import { Routes } from '@angular/router';

export const CLUB_ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./presentation/club-admin-switchboard').then(m => m.ClubAdminSwitchboard),
  },
  {
    path: 'race-review',
    loadComponent: () => import('./presentation/race-status-review/race-status-review').then(m => m.RaceStatusReviewComponent),
  }
];
