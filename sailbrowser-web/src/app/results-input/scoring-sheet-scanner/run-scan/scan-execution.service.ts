import { inject, Injectable } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { applyAutoAccept, ScanResponse, ScanRunRequest, ScanRunState } from '../model/scan-model';

const PARSE_RESULTS_SHEET_CALLABLE_TIMEOUT_MS = 318_000;
const UPLOAD_RESULTS_SHEET_IMAGE_CALLABLE_TIMEOUT_MS = 120_000;

/**
 * Drives a live scan run: uploads the sheet (when not already stored), calls the
 * parse callable, streams staged progress messages, and formats callable errors.
 */
@Injectable()
export class ScanExecutionService {
  private readonly app = inject(FirebaseApp);

  private readonly scanActivityMessages = [
    'Loading scan...',
    'Reading results sheet...',
    'Analysing handwriting...',
    'Checking race entries...',
    'Validating extracted rows...',
    'Analysing handwriting...',
    'Checking race entries...',
  ];

  defaultStageMessage(): string {
    return this.scanActivityMessages[0];
  }

  runScan(request: ScanRunRequest): Observable<ScanRunState> {
    return new Observable<ScanRunState>((subscriber) => {
      let idx = 0;
      subscriber.next({ status: 'running', stageMessage: this.defaultStageMessage() });
      const stageInterval = setInterval(() => {
        idx = (idx + 1) % this.scanActivityMessages.length;
        subscriber.next({ status: 'running', stageMessage: this.scanActivityMessages[idx] });
      }, 5000);

      const finish = () => clearInterval(stageInterval);

      void (async () => {
        try {
          const result = await this.runCallableScan(request);
          subscriber.next({ status: 'success', result: applyAutoAccept(result) });
          subscriber.complete();
        } catch (err: unknown) {
          subscriber.next({ status: 'error', error: this.formatParseSheetError(err) });
          subscriber.complete();
        } finally {
          finish();
        }
      })();

      return finish;
    });
  }

  private async runCallableScan(request: ScanRunRequest): Promise<ScanResponse> {
    const hasInlineImage = !!request.imageBase64 && !!request.imageMimeType;
    const useStoredRaceSheet = !!request.useStoredRaceSheet;
    if (!hasInlineImage && !useStoredRaceSheet) throw new Error('Missing image data for scan.');

    const functions = getFunctions(this.app, 'europe-west1');
    if (environment.useEmulators) {
      try { connectFunctionsEmulator(functions, 'localhost', 5001); } catch { /* already configured */ }
    }

    const uploadFn = httpsCallable(functions, 'uploadResultsSheetImage', {
      timeout: UPLOAD_RESULTS_SHEET_IMAGE_CALLABLE_TIMEOUT_MS,
    });
    const parseFn = httpsCallable(functions, 'parseStoredResultsSheet', {
      timeout: PARSE_RESULTS_SHEET_CALLABLE_TIMEOUT_MS,
    });

    if (!useStoredRaceSheet) {
      await uploadFn({
        imageBase64: request.imageBase64,
        imageMimeType: request.imageMimeType,
        clubId: request.clubId,
        raceId: request.raceId,
      });
    }

    const res = await parseFn({
      scannerContext: request.scannerContext,
      clubId: request.clubId,
      raceId: request.raceId,
    });

    return res.data as ScanResponse;
  }

  private extractCallableDetails(err: unknown): Record<string, unknown> | undefined {
    if (!err || typeof err !== 'object') return undefined;
    const e = err as Record<string, unknown>;
    const d = e['details'];
    if (d && typeof d === 'object') return d as Record<string, unknown>;
    const customData = e['customData'];
    if (customData && typeof customData === 'object') {
      const inner = (customData as Record<string, unknown>)['details'];
      if (inner && typeof inner === 'object') return inner as Record<string, unknown>;
    }
    return undefined;
  }

  private formatParseSheetError(err: unknown): string {
    const message = err instanceof Error ? err.message : 'Error parsing image.';
    const details = this.extractCallableDetails(err);
    if (!details) return message;
    const lines = [message];
    const stage = details['stage'];
    const cause = details['cause'];
    if (typeof stage === 'string' && stage) lines.push(`Stage: ${stage}`);
    if (typeof cause === 'string' && cause) lines.push(`Cause: ${cause}`);
    return lines.join('\n');
  }
}
