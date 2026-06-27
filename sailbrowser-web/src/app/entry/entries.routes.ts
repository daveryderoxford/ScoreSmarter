import { Routes } from '@angular/router';
import { authGuard } from 'app/auth/guards/auth-guard';
import { pendingChangesGuard } from 'app/shared/services/pending-changes-guard-service.guard';
import { EntriesListPage } from './presentation/entries-list.page';
import { EntryPage } from './presentation/entry-page/entry-page';
import { KioskEntryPage } from './presentation/kiosk-entry-page/kiosk-entry-page';

export const ENTERIES_ROUTES: Routes = [
   { path: '', component: EntriesListPage },
   { path: 'entries', component: EntriesListPage },
   { path: 'enter', component: EntryPage, canDeactivate: [pendingChangesGuard], canActivate: [authGuard] },
   { path: 'kiosk', component: KioskEntryPage, canActivate: [authGuard] },
];