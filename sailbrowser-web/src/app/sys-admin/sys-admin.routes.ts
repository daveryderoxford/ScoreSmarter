import { Routes } from '@angular/router';
import { SysAdminSwitchboard } from './sys-admin-switchboard';
import { UserListComponent } from './user-list/user-list.component';
import { SystemDataComponent as FirestoreImportExport } from './data-import-export';
import { ScanHistoryViewer } from './scan-history/scan-history-viewer';
import { ScanAiConfigPage } from './scan-ai/scan-ai-config';

export const SYS_ADMIN_ROUTES: Routes = [
   { path: '', redirectTo: 'switchboard', pathMatch: 'full' },
   {
      path: 'switchboard',
      component: SysAdminSwitchboard,
      title: 'System Administration',
   },
   {
      path: 'users',
      component: UserListComponent,
      title: 'User Administration'
   },
   {
      path: 'data',
      component: FirestoreImportExport,
      title: 'System Data Utility'
   },
   {
      path: 'scans',
      component: ScanHistoryViewer,
      title: 'Scan History',
   },
   {
      path: 'scan-ai',
      component: ScanAiConfigPage,
      title: 'Scan AI',
   },
   {
      path: 'registrations',
      loadComponent: () => import('./club-registrations/club-registrations-page').then(m => m.ClubRegistrationsPage),
      title: 'Club registrations',
   },
   {
      path: 'class-catalogue',
      loadComponent: () => import('./class-catalogue/class-catalogue-page').then(m => m.ClassCataloguePage),
      title: 'Class catalogue',
   },
];
