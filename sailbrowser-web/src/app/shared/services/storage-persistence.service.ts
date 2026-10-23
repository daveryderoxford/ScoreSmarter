import { Injectable, signal } from '@angular/core';

const LOG_PREFIX = '[ScoreSmarter]';

/** True when running as an installed app (home screen / app drawer) rather than in a browser tab. */
export function isInstalledApp(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
}

/**
 * Asks the browser to keep this site's storage (including Firestore's offline queue of
 * unsent results) out of automatic eviction when the device runs low on space.
 * Chrome grants this without a prompt for installed and frequently used sites; some
 * browsers (Firefox) show a permission prompt, so only request it for users who record results.
 */
@Injectable({ providedIn: 'root' })
export class StoragePersistenceService {
  /** `null` until checked; `true` when storage will not be evicted automatically. */
  readonly persisted = signal<boolean | null>(null);
  private requested = false;

  async ensurePersisted(): Promise<void> {
    if (this.requested) return;
    this.requested = true;

    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage?.persist || !storage.persisted) {
      this.persisted.set(false);
      return;
    }
    try {
      const granted = (await storage.persisted()) || (await storage.persist());
      this.persisted.set(granted);
      console.info(`${LOG_PREFIX} Persistent storage ${granted ? 'granted' : 'not granted'}`);
    } catch (err) {
      console.warn(`${LOG_PREFIX} Persistent storage request failed:`, err);
      this.persisted.set(false);
    }
  }
}
