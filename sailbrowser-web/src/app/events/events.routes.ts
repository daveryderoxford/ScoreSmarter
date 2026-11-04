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
    loadComponent: () => import('./presentation/event-manage-list').then(m => m.EventManageList),
  },
  {
    path: 'manage/add',
    title: 'New event',
    canActivate: [clubAdminGuard],
    canDeactivate: [pendingChangesGuard],
    loadComponent: () => import('./presentation/event-add').then(m => m.EventAdd),
  },
  {
    path: 'manage/edit/:id',
    title: 'Edit event',
    canActivate: [clubAdminGuard],
    canDeactivate: [pendingChangesGuard],
    loadComponent: () => import('./presentation/event-edit').then(m => m.EventEdit),
  },
  {
    path: ':id',
    title: 'Open event',
    loadComponent: () => import('./presentation/event-page').then(m => m.EventPage),
  },
];
