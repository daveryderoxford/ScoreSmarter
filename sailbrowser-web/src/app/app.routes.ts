import { Routes } from '@angular/router';

export const APP_ROUTES: Routes = [
   { path: "", redirectTo: "home", pathMatch: 'full' },
   { path: "home", title: 'Home', loadComponent: () => import('./home/presentation/home-page').then(c => c.HomePage) },
   { path: "entry", loadChildren: () => import('./entry/entries.routes').then(r => r.ENTERIES_ROUTES) },
   { path: "boats", loadChildren: () => import('./boats/boats.routes').then(r => r.BOATS_ROUTES) },
   { path: "race-calender", loadChildren: () => import('./race-calender/race-calender.routes').then(r => r.RACE_CALENDER_ROUTES) },
   { path: "results-input", loadChildren: () => import('./results-input/race-results.routes').then(r => r.RESULTS_ENTRY_ROUTES) },
   { path: "results", loadChildren: () => import('./published-results/published-result.routes').then(r => r.PUBLISHED_RESULTS_ROUTES) },
   { path: "sys-admin", loadChildren: () => import('./sys-admin/sys-admin.routes').then(r => r.SYS_ADMIN_ROUTES) },
   { path: "club", loadChildren: () => import('./club-tenant/club.routes').then(r => r.CLUB_ROUTES) },
   { path: "auth", loadChildren: () => import('./auth/auth.routes').then(r => r.AUTH_ROUTES) },
   { path: "user", loadChildren: () => import('./user/user.routes').then(r => r.USER_ROUTES) },
   { path: "about", title: 'About ScoreSmarter', loadComponent: () => import('./about/presentation/about-page').then(c => c.AboutComponent) },
];