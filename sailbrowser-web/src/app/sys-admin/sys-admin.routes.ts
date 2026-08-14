import { Routes } from '@angular/router';
import { SysAdminSwitchboard } from './sys-admin-switchboard';
import { UserListComponent } from './user-list/user-list.component';
import { SystemDataComponent as FirestoreImportExport } from './data-import-export';
import { ScanHistoryViewer } from './scan-history/scan-history-viewer';

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
];
