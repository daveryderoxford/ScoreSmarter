import { Routes } from '@angular/router';
import { MobileCapturePage } from './mobile-capture-page';

/** Minimal lazy bundle for photographing a scoring sheet via session link (phone). */
export const RESULTS_SHEET_PHONE_CAPTURE_ROUTES: Routes = [
  { path: ':sessionId/:token', component: MobileCapturePage },
];
