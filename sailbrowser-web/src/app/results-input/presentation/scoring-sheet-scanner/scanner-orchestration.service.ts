import { inject, Injectable } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { RaceCalendarStore } from 'app/race-calender';
import { RaceCompetitorStore } from '../../services/race-competitor-store';
import { SeriesEntryStore } from '../../services/series-entry-store';
import { environment } from '../../../../environments/environment';
import { Observable } from 'rxjs';
import { ScanResponse, ScanRunRequest, ScanRunState, ScannedResultRow } from './scan-model';

const PARSE_RESULTS_SHEET_CALLABLE_TIMEOUT_MS = 318_000;
const UPLOAD_RESULTS_SHEET_IMAGE_CALLABLE_TIMEOUT_MS = 120_000;

@Injectable({ providedIn: 'root' })
export class ScannerOrchestrationService {
  private readonly app = inject(FirebaseApp);
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  private readonly competitorStore = inject(RaceCompetitorStore);
  private readonly entryStore = inject(SeriesEntryStore);

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

  isMockMode(rawFlag: string | null | undefined): boolean {
    return rawFlag === '1';
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
          const result = request.mockMode
            ? this.buildMockResponse(request.raceId)
            : await this.runCallableScan(request);
          subscriber.next({ status: 'success', result: this.applyAutoAccept(result) });
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

  buildMockResponse(raceId: string): ScanResponse {
    const race = this.raceCalendarStore.allRaces().find(r => r.id === raceId);
    if (!race) {
      return { scannedResults: [], unreadableRowsCount: 0 };
    }

    const comps = this.competitorStore.selectedCompetitors().filter(c => c.raceId === raceId);
    const entries = this.entryStore.selectedEntries();
    const start = race.actualStart ?? race.scheduledStart;

    const rows = comps
      .map((c, rowIndex): ScannedResultRow | undefined => {
        const e = entries.find(se => se.id === c.seriesEntryId);
        if (!e) return undefined;
        const finish = new Date(start.getTime() + rowIndex * 4 * 60 * 1000 + 37 * 1000);
        const hh = String(finish.getHours()).padStart(2, '0');
        const mm = String(finish.getMinutes()).padStart(2, '0');
        const ss = String(finish.getSeconds()).padStart(2, '0');
        return {
          rowIndex: rowIndex + 1,
          matchedCompetitorId: c.id,
          overallRowConfidence: rowIndex % 4 === 0 ? 'MANUAL_CHECK' : 'HIGH',
          sailNumber: { value: String(e.sailNumber), confidence: rowIndex % 5 === 0 ? 'MANUAL_CHECK' : 'HIGH' },
          boatClass: { value: e.boatClass, confidence: 'HIGH' },
          time: { value: `${hh}:${mm}:${ss}`, confidence: rowIndex % 4 === 0 ? 'MANUAL_CHECK' : 'HIGH' },
          laps: { value: 3, confidence: 'HIGH' },
          status: 'OK',
          accepted: false,
        };
      })
      .filter((r): r is ScannedResultRow => !!r);

    const unmatched1: ScannedResultRow = {
      rowIndex: rows.length + 1,
      overallRowConfidence: 'AMBIGUOUS',
      sailNumber: { value: '9999', confidence: 'AMBIGUOUS' },
      boatClass: { value: 'ILCA 7', confidence: 'MANUAL_CHECK' },
      time: { value: '15:23:11', confidence: 'MANUAL_CHECK' },
      laps: { value: 3, confidence: 'HIGH' },
      status: 'OK',
      accepted: false,
    };

    const unmatched2: ScannedResultRow = {
      rowIndex: rows.length + 2,
      overallRowConfidence: 'AMBIGUOUS',
      sailNumber: { value: '9999', confidence: 'AMBIGUOUS' },
      boatClass: { value: 'ILCA 7', confidence: 'HIGH' },
      time: { value: '15:23:11', confidence: 'HIGH' },
      laps: { value: 3, confidence: 'HIGH' },
      status: 'OK',
      accepted: false,
    };

    return {
      scannedResults: rows.length > 0 ? [...rows, unmatched1, unmatched2] : [unmatched1],
      unreadableRowsCount: 0,
      pageNotes: 'Mock scan mode: generated rows from current race competitors.',
    };
  }

  private applyAutoAccept(response: ScanResponse): ScanResponse {
    const scannedResults = response.scannedResults.map(row => ({
      ...row,
      accepted: row.overallRowConfidence === 'HIGH' &&
        row.sailNumber?.confidence === 'HIGH' &&
        row.time?.confidence === 'HIGH',
    }));
    return { ...response, scannedResults };
  }

  private async runCallableScan(request: ScanRunRequest): Promise<ScanResponse> {
    if (!request.imageBase64 || !request.imageMimeType) {
      throw new Error('Missing image data for scan.');
    }

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

    const uploadRes = await uploadFn({
      imageBase64: request.imageBase64,
      imageMimeType: request.imageMimeType,
      clubId: request.clubId,
      raceId: request.raceId,
    });
    const storedImagePath = (uploadRes.data as { storagePath?: string } | null)?.storagePath;
    const res = await parseFn({
      scannerContext: request.scannerContext,
      clubId: request.clubId,
      raceId: request.raceId,
      storagePath: storedImagePath,
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
