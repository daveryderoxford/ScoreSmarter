import { computed, effect, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { type DocumentReference, docData, setDoc } from '@angular/fire/firestore';
import { rxResource } from '@angular/core/rxjs-interop';
import { ClubTenant, FirestoreTenantService } from 'app/club-tenant';
import type { DutyAttendanceStatus, RaceDay, RaceDayDutyMember } from '@shared/race-day';
import { cloudCallable } from 'app/shared/firebase/cloud-functions';
import { firestoreWrite } from 'app/shared/utils/with-timeout';
import { type Observable, of } from 'rxjs';

/** Island Barn (IBRSC) — duty register integration is club-specific. */
export const DUTY_REGISTER_CLUB_ID = 'ibrsc';

/** Override in tests to avoid a live Firestore listener. */
export const RACE_DAY_DOC_DATA = new InjectionToken<
  (ref: DocumentReference<RaceDay>) => Observable<RaceDay | undefined>
>('RACE_DAY_DOC_DATA');

/** Override in tests to avoid a live Firestore write. */
export const RACE_DAY_SET_DOC = new InjectionToken<
  (ref: DocumentReference<RaceDay>, data: Partial<RaceDay>) => Promise<void>
>('RACE_DAY_SET_DOC');

/** yyyy-mm-dd in Europe/London (matches ensureRaceDay when date omitted). */
export function raceDayDateId(date?: string, now: Date = new Date()): string {
  if (date !== undefined) return date;
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

@Injectable({
  providedIn: 'root',
})
export class DutiesService {
  private readonly app = inject(FirebaseApp);
  private readonly clubTenant = inject(ClubTenant);
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
  private readonly ensuring = signal(false);
  private readonly ensureError = signal<string | null>(null);
  private readonly writeError = signal<string | null>(null);
  /** Date for which ensure has been started or skipped (doc already present). */
  private readonly ensureAttemptedFor = signal<string | null>(null);

  readonly raceDayDate = computed(() => {
    if (this.clubTenant.clubId !== DUTY_REGISTER_CLUB_ID) return undefined;
    return raceDayDateId(this.requestedDate());
  });

  private readonly raceDayResource = rxResource<RaceDay | undefined, string | undefined>({
    params: () => this.raceDayDate(),
    stream: ({ params: date }) => {
      if (!date) return of(undefined);
      return this.raceDayDocData(this.tenant.docRef<RaceDay>('race-days', date));
    },
  });

  readonly duties = computed((): RaceDayDutyMember[] =>
    this.raceDayResource.value()?.dutyTeam ?? [],
  );

  readonly loading = computed(() => {
    if (this.raceDayResource.value() !== undefined) return false;
    if (this.ensuring()) return true;
    // Ensure finished (or skipped) but Listen still hung — don't spin forever.
    if (this.ensureAttemptedFor() === this.raceDayDate()) return false;
    return this.raceDayResource.isLoading();
  });

  readonly error = computed(() => {
    const writeError = this.writeError();
    if (writeError) return writeError;
    const ensureError = this.ensureError();
    if (ensureError) return ensureError;
    const loadError = this.raceDayResource.error();
    if (!loadError) return null;
    return this.errorMessage(loadError, 'Could not load duty team.');
  });

  constructor() {
    effect(() => {
      const date = this.raceDayDate();
      if (!date) return;
      if (this.ensureAttemptedFor() === date || this.ensuring()) return;

      // Let a synchronous cache/snapshot emission win before calling ensure.
      queueMicrotask(() => {
        if (this.raceDayDate() !== date) return;
        if (this.ensureAttemptedFor() === date || this.ensuring()) return;
        if (this.raceDayResource.value() !== undefined) {
          this.ensureAttemptedFor.set(date);
          return;
        }
        // Do not wait for Listen to finish — offline/blocked streams never leave loading.
        void this.ensureMissing(date);
      });
    });
  }

  /** Override the duty day (testing). Omit or pass `undefined` for today. */
  setRequestedDate(date?: string): void {
    this.ensureError.set(null);
    this.writeError.set(null);
    this.ensureAttemptedFor.set(null);
    this.requestedDate.set(date);
  }

  reload(): void {
    this.ensureError.set(null);
    this.writeError.set(null);
    this.ensureAttemptedFor.set(null);
    this.raceDayResource.reload();
  }

  async setStatus(member: RaceDayDutyMember, status: DutyAttendanceStatus): Promise<boolean> {
    const date = this.raceDayDate();
    const current = this.raceDayResource.value();
    if (!date || !current) return false;

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

  private async ensureMissing(date: string): Promise<void> {
    this.ensureAttemptedFor.set(date);
    this.ensuring.set(true);
    this.ensureError.set(null);
    try {
      const fn = await cloudCallable<{ clubId: string; date: string }, { date: string; created: boolean }>(
        'ensureRaceDay',
        undefined,
        this.app,
      );
      await fn({ clubId: DUTY_REGISTER_CLUB_ID, date });
    } catch (err: unknown) {
      console.error('DutiesService.ensureMissing: failed', err);
      this.ensureError.set(this.errorMessage(err, 'Could not load duty team.'));
    } finally {
      this.ensuring.set(false);
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
