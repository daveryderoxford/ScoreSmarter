import { Injectable, inject, signal } from '@angular/core';
import {
  Firestore,
  QueryDocumentSnapshot,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from '@angular/fire/firestore';
import { formatUsd } from 'app/results-input/scoring-sheet-scanner/model/scan-metrics-format';

export interface ScanHistoryRecord {
  id: string;
  clubId: string;
  raceId: string;
  seriesName?: string;
  raceNumber?: number;
  scannedAt: Date | null;
  strategy: string;
  model: string;
  success: boolean;
  errorMessage?: string;
  competitorCount: number;
  matchedCount: number;
  unmatchedCount: number;
  highConfidenceRowCount: number;
  lowConfidenceRowCount: number;
  suspectSailNumbers: number;
  suspectTimes: number;
  executionTimeSec: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedApiCostUsd: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class ScanHistoryService {
  private readonly firestore = inject(Firestore);
  readonly pageSize = 25;

  readonly records = signal<ScanHistoryRecord[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = signal(true);

  private lastDoc: QueryDocumentSnapshot | null = null;

  async loadFirstPage(): Promise<void> {
    this.lastDoc = null;
    this.hasMore.set(true);
    this.records.set([]);
    await this.loadNextPage(true);
  }

  async loadNextPage(reset = false): Promise<void> {
    if (this.loading() || (!reset && !this.hasMore())) return;

    this.loading.set(true);
    this.error.set(null);

    try {
      const scansRef = collection(this.firestore, 'system', 'private', 'scans');
      const constraints = [
        orderBy('scannedAt', 'desc'),
        limit(this.pageSize),
        ...(this.lastDoc && !reset ? [startAfter(this.lastDoc)] : []),
      ];
      const snapshot = await getDocs(query(scansRef, ...constraints));
      const page = snapshot.docs.map(doc => this.toRecord(doc.id, doc.data()));

      this.lastDoc = snapshot.docs.at(-1) ?? this.lastDoc;
      this.hasMore.set(snapshot.docs.length === this.pageSize);
      this.records.set(reset ? page : [...this.records(), ...page]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load scan history.';
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  formatCost(value: number | null): string {
    return formatUsd(value);
  }

  private toRecord(id: string, data: Record<string, unknown>): ScanHistoryRecord {
    const race = (data['race'] ?? {}) as Record<string, unknown>;
    const suspect = (data['suspectFieldCounts'] ?? {}) as Record<string, unknown>;
    const scannedAtRaw = data['scannedAt'];
    const scannedAt = scannedAtRaw && typeof scannedAtRaw === 'object' && 'toDate' in scannedAtRaw
      ? (scannedAtRaw as { toDate: () => Date }).toDate()
      : null;

    return {
      id,
      clubId: typeof data['clubId'] === 'string' ? data['clubId'] : '—',
      raceId: typeof race['raceId'] === 'string' ? race['raceId'] : '—',
      seriesName: typeof race['seriesName'] === 'string' ? race['seriesName'] : undefined,
      raceNumber: typeof race['raceNumber'] === 'number' ? race['raceNumber'] : undefined,
      scannedAt,
      strategy: typeof data['strategy'] === 'string' ? data['strategy'] : '—',
      model: typeof data['model'] === 'string' ? data['model'] : '—',
      success: data['success'] === true,
      errorMessage: typeof data['errorMessage'] === 'string' ? data['errorMessage'] : undefined,
      competitorCount: typeof data['competitorCount'] === 'number' ? data['competitorCount'] : 0,
      matchedCount: typeof data['matchedCount'] === 'number' ? data['matchedCount'] : 0,
      unmatchedCount: typeof data['unmatchedCount'] === 'number' ? data['unmatchedCount'] : 0,
      highConfidenceRowCount: typeof data['highConfidenceRowCount'] === 'number' ? data['highConfidenceRowCount'] : 0,
      lowConfidenceRowCount: typeof data['lowConfidenceRowCount'] === 'number' ? data['lowConfidenceRowCount'] : 0,
      suspectSailNumbers: typeof suspect['sailNumber'] === 'number' ? suspect['sailNumber'] : 0,
      suspectTimes: typeof suspect['time'] === 'number' ? suspect['time'] : 0,
      executionTimeSec: typeof data['executionTimeSec'] === 'number' ? data['executionTimeSec'] : 0,
      inputTokens: typeof data['inputTokens'] === 'number' ? data['inputTokens'] : null,
      outputTokens: typeof data['outputTokens'] === 'number' ? data['outputTokens'] : null,
      estimatedApiCostUsd: typeof data['estimatedApiCostUsd'] === 'number' ? data['estimatedApiCostUsd'] : null,
    };
  }
}
