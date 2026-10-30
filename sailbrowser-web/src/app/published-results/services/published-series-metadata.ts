import { inject, Injectable } from '@angular/core';
import { Firestore, runTransaction } from '@angular/fire/firestore';
import { FirestoreTenantService } from 'app/club-tenant/services/firestore-tenant';
import type { PublishedSeason } from '../model/published-season';
import { PUBLISHED_SEASONS_PATH } from './published-results-store';

/** Text fields of a calendar series shown in published results, updated without rescoring. */
export interface SeriesMetadata {
  id: string;
  seasonId: string;
  displayGroup?: string;
}

/**
 * `season` with the series' display group set on all its published series (primary,
 * secondary and division), or undefined when nothing changes.
 */
export function withSeriesMetadata(season: PublishedSeason, series: SeriesMetadata): PublishedSeason | undefined {
  let changed = false;
  const updated = season.series.map(info => {
    if (info.id !== series.id && info.baseSeriesId !== series.id) return info;
    if ((info.displayGroup ?? undefined) === (series.displayGroup || undefined)) return info;
    changed = true;
    const next = { ...info };
    if (series.displayGroup) next.displayGroup = series.displayGroup;
    else delete next.displayGroup;
    return next;
  });
  return changed ? { ...season, series: updated } : undefined;
}

/**
 * Keeps published results in step with a series' text fields (currently its display
 * group) without rescoring. Series not yet published get them when first published.
 */
@Injectable({ providedIn: 'root' })
export class PublishedSeriesMetadata {
  private readonly firestore = inject(Firestore);
  private readonly tenant = inject(FirestoreTenantService);

  async publish(series: SeriesMetadata): Promise<void> {
    const ref = this.tenant.docRef<PublishedSeason>(PUBLISHED_SEASONS_PATH, series.seasonId);
    await runTransaction(this.firestore, async tx => {
      const snap = await tx.get(ref);
      const season = snap.exists() ? snap.data() : undefined;
      const updated = season ? withSeriesMetadata(season, series) : undefined;
      if (updated) tx.set(ref, updated);
    });
  }
}
