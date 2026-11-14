import { Routes } from '@angular/router';

export const CLUB_ONBOARDING_ROUTES: Routes = [
  {
    path: '',
    title: 'Onboard club',
    loadComponent: () => import('./presentation/onboarding-wizard').then(m => m.OnboardingWizard),
  },
];
