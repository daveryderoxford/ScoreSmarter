import { Routes } from '@angular/router';
import { clubAdminGuard } from 'app/auth/guards/auth-guard';
import { pendingChangesGuard } from 'app/shared/services/pending-changes-guard-service.guard';

export const EVENTS_ROUTES: Routes = [
  {
    path: '',
    title: 'Open events',
    loadComponent: () => import('./presentation/events-page').then(m => m.EventsPage),
  },
  {
    path: 'manage',
    title: 'Manage events',
    canActivate: [clubAdminGuard],
    loadComponent: () => import('./presentation/event-manage-page').then(m => m.EventManagePage),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('app/shared/layout/detail-placeholder').then(m => m.DetailPlaceholder),
        data: { message: 'Select an event to edit, or create a new one.' },
      },
      {
        path: 'add',
        title: 'New event',
        canDeactivate: [pendingChangesGuard],
        loadComponent: () => import('./presentation/event-add').then(m => m.EventAdd),
      },
      {
        path: 'edit/:id',
        title: 'Edit event',
        canDeactivate: [pendingChangesGuard],
        loadComponent: () => import('./presentation/event-edit').then(m => m.EventEdit),
      },
    ],
  },
  {
    path: ':id',
    title: 'Open event',
    loadComponent: () => import('./presentation/event-page').then(m => m.EventPage),
  },
];
