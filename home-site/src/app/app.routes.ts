import {Routes} from '@angular/router';
import { Home } from './home/home';
import { Marketing } from './marketing/marketing';

export const routes: Routes = [
  { path: '', title: 'ScoreSmarter',component: Home },
  { path: 'marketing', title: 'ScoreSmarter features', component: Marketing },
  { path: 'clubs', title: 'ScoreSmarter Clubs', loadComponent: () => import('./clubs/clubs').then(c => c.Clubs) },
  { path: 'clubs/register', title: 'Register Your Club', loadComponent: () => import('./club-registration/club-registration').then(c => c.ClubRegistration) },
  { path: 'privacy-policy', title: 'Privacy Policy | ScoreSmarter', loadComponent: () => import('./privacy-policy/privacy-policy').then(c => c.PrivacyPolicy) },
  { path: 'data-deletion-policy', title: 'Data Deletion Policy | ScoreSmarter', loadComponent: () => import('./data-deletion-policy/data-deletion-policy').then(c => c.DataDeletionPolicy) },
  { path: 'terms-of-service', title: 'Terms of Service | ScoreSmarter', loadComponent: () => import('./terms-of-service/terms-of-service').then(c => c.TermsOfService) },
  { path: '**', redirectTo: '' }
];
