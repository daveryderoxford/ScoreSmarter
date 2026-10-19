import { computed, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { type DocumentReference, docData, setDoc } from '@angular/fire/firestore';
import { rxResource } from '@angular/core/rxjs-interop';
import { FirestoreTenantService } from 'app/club-tenant';
import type { DutyAttendanceStatus, RaceDay, RaceDayDutyMember } from '@shared/race-day';
import { firestoreWrite } from 'app/shared/utils/with-timeout';
import type { Observable } from 'rxjs';

/** Override in tests to avoid a live Firestore listener. */
export const RACE_DAY_DOC_DATA = new InjectionToken<
  (ref: DocumentReference<RaceDay>) => Observable<RaceDay | undefined>
>('RACE_DAY_DOC_DATA');

/** Override in tests to avoid a live Firestore write. */
export const RACE_DAY_SET_DOC = new InjectionToken<
  (ref: DocumentReference<RaceDay>, data: Partial<RaceDay>) => Promise<void>
>('RACE_DAY_SET_DOC');

/** yyyy-mm-dd in Europe/London (matches the server's race-day document id). */
export function raceDayDateId(date?: string, now: Date = new Date()): string {
  if (date !== undefined) return date;
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

/**
 * Today's duty team from `race-days/{date}`. The document is populated server-side;
 * a missing document or empty team means there is no duty team to show.
 */
@Injectable({
  providedIn: 'root',
})
export class DutiesService {
  private readonly tenant = inject(FirestoreTenantService);
  private readonly raceDayDocData =
    inject(RACE_DAY_DOC_DATA, { optional: true }) ??
    ((ref: DocumentReference<RaceDay>) => docData(ref));
  private readonly raceDaySetDoc =
    inject(RACE_DAY_SET_DOC, { optional: true }) ??
    ((ref: DocumentReference<RaceDay>, data: Partial<RaceDay>) =>
      firestoreWrite(setDoc(ref, data, { merge: true }), 'Updating duty status'));

  /** `undefined` = today. Set explicitly for testing. */
  private readonly requestedDate = signal<string | undefined>(undefined);
  private readonly writeError = signal<string | null>(null);

  readonly raceDayDate = computed(() => raceDayDateId(this.requestedDate()));

  private readonly raceDayResource = rxResource<RaceDay | undefined, string>({
    params: () => this.raceDayDate(),
    stream: ({ params: date }) => this.raceDayDocData(this.tenant.docRef<RaceDay>('race-days', date)),
  });

  readonly duties = computed((): RaceDayDutyMember[] =>
    this.raceDayResource.value()?.dutyTeam ?? [],
  );

  readonly hasDutyTeam = computed(() => this.duties().length > 0);

  readonly loading = computed(() => this.raceDayResource.isLoading());

  readonly error = computed(() => {
    const writeError = this.writeError();
    if (writeError) return writeError;
    const loadError = this.raceDayResource.error();
    if (!loadError) return null;
    return this.errorMessage(loadError, 'Could not load duty team.');
  });

  /** Override the duty day (testing). Omit or pass `undefined` for today. */
  setRequestedDate(date?: string): void {
    this.writeError.set(null);
    this.requestedDate.set(date);
  }

  reload(): void {
    this.writeError.set(null);
    this.raceDayResource.reload();
  }

  async setStatus(member: RaceDayDutyMember, status: DutyAttendanceStatus): Promise<boolean> {
    const date = this.raceDayDate();
    const current = this.raceDayResource.value();
    if (!current) return false;

    this.writeError.set(null);
    try {
      const dutyTeam = current.dutyTeam.map(m =>
        m.key === member.key ? { ...m, status } : m,
      );
      await this.raceDaySetDoc(this.tenant.docRef<RaceDay>('race-days', date), { dutyTeam });
      return true;
    } catch (err: unknown) {
      console.error('DutiesService.setStatus: failed', err);
      this.writeError.set(this.errorMessage(err, 'Could not update duty attendance.'));
      return false;
    }
  }

  private errorMessage(err: unknown, fallback: string): string {
    if (err && typeof err === 'object' && 'message' in err) {
      const message = (err as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
    return fallback;
  }
}
