import { computed, effect, Injectable, inject, signal, resource } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from '@angular/fire/functions';
import { ClubTenant } from 'app/club-tenant';
import type { DutyMember } from '@shared/duty-member';
import { environment } from '../../../environments/environment';

/** Island Barn (IBRSC) — duty register integration is club-specific. */
export const DUTY_REGISTER_CLUB_ID = 'ibrsc';

interface GetDutyTeamResponse {
  duties: DutyMember[] | null;
}

interface DutyLoadParams {
  date?: string;
}

@Injectable({
  providedIn: 'root',
})
export class DutiesService {
  private readonly app = inject(FirebaseApp);
  private readonly clubTenant = inject(ClubTenant);

  /** `undefined` = today's duty team (omit date on the API). Set explicitly for testing. */
  private readonly requestedDate = signal<string | undefined>(undefined);
  private readonly attendanceByAckKey = signal<ReadonlyMap<string, boolean>>(new Map());
  private readonly _actionError = signal<string | null>(null);
  private readonly _updatingAckKeys = signal<ReadonlySet<string>>(new Set());

  private readonly dutiesResource = resource<DutyMember[], DutyLoadParams | null>({
    params: () => {
      if (this.clubTenant.clubId !== DUTY_REGISTER_CLUB_ID) return null;
      return { date: this.requestedDate() };
    },
    loader: async ({ params }) => {
      if (!params) return [];
      return this.fetchDutyTeam(params.date);
    },
    defaultValue: [],
  });

  readonly duties = computed(() => {
    const base = this.dutiesResource.value() ?? [];
    const attendance = this.attendanceByAckKey();
    if (attendance.size === 0) return base;
    return base.map(member => {
      const attending = attendance.get(member.key);
      return attending !== undefined ? { ...member, attending } : member;
    });
  });

  readonly loading = this.dutiesResource.isLoading;
  readonly error = computed(() => {
    const actionError = this._actionError();
    if (actionError) return actionError;
    const loadError = this.dutiesResource.error();
    if (!loadError) return null;
    return this.errorMessage(loadError, 'Could not load duty team.');
  });
  readonly updatingAckKeys = this._updatingAckKeys.asReadonly();

  constructor() {
    effect(() => {
      this.dutiesResource.value();
      this.attendanceByAckKey.set(new Map());
      this._actionError.set(null);
    });
  }

  /** Override the duty day (testing). Omit or pass `undefined` for today. */
  setRequestedDate(date?: string): void {
    this.requestedDate.set(date);
  }

  reload(): void {
    this._actionError.set(null);
    this.dutiesResource.reload();
  }

  async setAttending(member: DutyMember, attending: boolean): Promise<void> {
    const ackKey = member.key;
    this._updatingAckKeys.update(keys => new Set([...keys, ackKey]));
    this._actionError.set(null);
    this.attendanceByAckKey.update(map => new Map(map).set(ackKey, attending));
    try {
      const fn = httpsCallable<{ key: string; attending: boolean }, { success: true }>(
        this.functions(),
        'setDutyAttendance',
      );
      await fn({ key: ackKey, attending });
    } catch (err: unknown) {
      console.error('DutiesService.setAttending: failed', err);
      this.attendanceByAckKey.update(map => {
        const next = new Map(map);
        next.delete(ackKey);
        return next;
      });
      this._actionError.set(this.errorMessage(err, 'Could not update duty attendance.'));
    } finally {
      this._updatingAckKeys.update(keys => {
        const next = new Set(keys);
        next.delete(ackKey);
        return next;
      });
    }
  }

  private async fetchDutyTeam(date?: string): Promise<DutyMember[]> {
    const fn = httpsCallable<{ date?: string }, GetDutyTeamResponse>(
      this.functions(),
      'getDutyTeamForDay',
    );
    const result = await fn(date ? { date } : {});
    return result.data.duties ?? [];
  }

  private functions() {
    const functions = getFunctions(this.app, 'europe-west1');
    if (environment.useEmulators) {
      try {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      } catch {
        /* already configured */
      }
    }
    return functions;
  }

  private errorMessage(err: unknown, fallback: string): string {
    if (err && typeof err === 'object' && 'message' in err) {
      const message = (err as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
    return fallback;
  }
}
