import { Routes } from '@angular/router';
import { authGuard } from 'app/auth/guards/auth-guard';
import { ManualResultsPage } from './presentation/manual-results-page/manual-results-page';
import { dirtyRaceGuard } from './services/dirty-race.guard';
import { ScoringSheetScanner } from './presentation/scoring-sheet-scanner/scoring-sheet-scanner';

export const RESULTS_ENTRY_ROUTES: Routes = [
   { path: 'manual', 
      component: ManualResultsPage, 
      canActivate: [authGuard], 
      canDeactivate: [dirtyRaceGuard]
  },
  { path: 'scan-scoring-sheet', 
      component: ScoringSheetScanner, 
      canActivate: [authGuard] 
  },
];