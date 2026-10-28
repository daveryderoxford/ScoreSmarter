import { Routes } from '@angular/router';
import { ChangePassword } from './change-password/change-password';
import { authGuard, loggedInGuard } from './guards/auth-guard';
import { LoginComponent } from './login/login';
import { RecoverComponent } from './recover/recover-password';
import { Signup } from './signup/signup';
import { VerifyEmail } from './verify-email/verify-email';

export const AUTH_ROUTES: Routes = [
  { path: 'login', component: LoginComponent, title: 'ScoreSmarter Login' },
  { path: 'signup', component: Signup, title: 'ScoreSmarter Signup' },
  { path: 'recover', component: RecoverComponent, title: 'ScoreSmarter Recover password' },
  {
    path: 'verify-email',
    component: VerifyEmail,
    canActivate: [loggedInGuard],
    title: 'ScoreSmarter Verify email',
  },
  {
    path: 'welcome',
    loadComponent: () => import('./welcome/welcome-page').then(m => m.WelcomePage),
    title: 'ScoreSmarter Welcome',
  },
  {
    path: 'change-password',
    component: ChangePassword,
    canActivate: [authGuard],
    title: 'ScoreSmarter Change password',
  },
];
