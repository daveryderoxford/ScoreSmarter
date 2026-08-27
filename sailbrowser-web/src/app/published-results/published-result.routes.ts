import { Routes } from '@angular/router';

export const PUBLISHED_RESULTS_ROUTES: Routes = [

   // On Mobile: Navigates to this route to see the list full-screen
   // On Desktop: This route shows the sidebar + a "Select an item" message
   {
      path: 'mobile-results-list',
      loadComponent: () =>
         import('./presentation/season-page/season-page').then(m => m.SeasonPage),
   },

   {
      path: 'today',
      title: 'Recent races',
      loadComponent: () =>
         import('./presentation/todays-results-page/todays-results-page').then(m => m.TodaysResultsPage),
   },

   {
      path: 'viewer',
      loadComponent: () =>
         import('./presentation/results-viewer/results-viewer').then(m => m.ResultsViewer),
   },
   {
      path: 'viewer/:id',
      loadComponent: () =>
         import('./presentation/results-viewer/results-viewer').then(m => m.ResultsViewer),
   },

   { path: '', redirectTo: 'items', pathMatch: 'full' }

];
