import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import type { ScanAiConfig } from '@shared/scan-ai-config';
import type { ScannerThinkingLevel } from '@shared/scanner-context';
import { AuthService } from 'app/auth';
import { firestoreWrite } from 'app/shared/utils/with-timeout';
import { DEFAULT_SCAN_MODEL, DEFAULT_SCAN_THINKING_LEVEL, SCAN_AI_THINKING_LEVELS } from './scan-ai-models';

export const SCAN_AI_CONFIG_PATH = ['system', 'private', 'settings', 'scanAi'] as const;

function asThinkingLevel(value: unknown): ScannerThinkingLevel | undefined {
  return typeof value === 'string' && SCAN_AI_THINKING_LEVELS.includes(value as ScannerThinkingLevel)
    ? (value as ScannerThinkingLevel)
    : undefined;
}

@Injectable({ providedIn: 'root' })
export class ScanAiConfigService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  private ref() {
    return doc(this.firestore, ...SCAN_AI_CONFIG_PATH);
  }

  async load(): Promise<ScanAiConfig> {
    const snap = await firestoreWrite(getDoc(this.ref()), 'Loading scan AI config');
    if (!snap.exists()) {
      return { model: DEFAULT_SCAN_MODEL, thinkingLevel: DEFAULT_SCAN_THINKING_LEVEL };
    }
    const data = snap.data();
    const updatedAtRaw = data['updatedAt'];
    const updatedAt =
      updatedAtRaw instanceof Timestamp ? updatedAtRaw.toDate() : undefined;
    return {
      model:
        typeof data['model'] === 'string' && data['model'].trim()
          ? data['model'].trim()
          : DEFAULT_SCAN_MODEL,
      thinkingLevel: asThinkingLevel(data['thinkingLevel']) ?? DEFAULT_SCAN_THINKING_LEVEL,
      updatedAt,
      updatedBy: typeof data['updatedBy'] === 'string' ? data['updatedBy'] : undefined,
    };
  }

  async save(model: string, thinkingLevel: ScannerThinkingLevel): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) throw new Error('Not signed in');
    const trimmed = model.trim();
    if (!trimmed) throw new Error('Model id is required');
    await firestoreWrite(
      setDoc(this.ref(), {
        model: trimmed,
        thinkingLevel,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      }),
      'Saving scan AI config',
    );
  }
}
