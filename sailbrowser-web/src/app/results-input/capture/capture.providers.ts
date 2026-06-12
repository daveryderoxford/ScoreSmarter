import { ResultsSheetCaptureService } from './services/results-sheet-capture.service';
import { ScannerPhoneCaptureService } from './services/scanner-phone-capture.service';

/** Provide on each view that opens capture dialogs (scanner, manual results). */
export const CAPTURE_PROVIDERS = [
  ResultsSheetCaptureService,
  ScannerPhoneCaptureService,
] as const;
