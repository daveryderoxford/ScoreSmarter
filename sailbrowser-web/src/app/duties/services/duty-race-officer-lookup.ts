import { inject, Injectable } from '@angular/core';
import { getDoc } from '@angular/fire/firestore';
import { FirestoreTenantService } from 'app/club-tenant';
import { dutyRaceOfficer, type RaceDay } from '../model/duty-member';
import { raceDayDateId } from './duties.service';

/** Looks up the rostered race officer for a day on demand; each day is read at most once per session. */
@Injectable({ providedIn: 'root' })
export class DutyRaceOfficerLookup {
  private readonly tenant = inject(FirestoreTenantService);
  private readonly cache = new Map<string, Promise<string | undefined>>();

  raceOfficerOn(date: Date): Promise<string | undefined> {
    const dateId = raceDayDateId(undefined, date);
    let lookup = this.cache.get(dateId);
    if (!lookup) {
      lookup = this.read(dateId);
      this.cache.set(dateId, lookup);
    }
    return lookup;
  }

  private async read(dateId: string): Promise<string | undefined> {
    try {
      const snap = await getDoc(this.tenant.docRef<RaceDay>('race-days', dateId));
      return dutyRaceOfficer(snap.data()?.dutyTeam ?? []);
    } catch (e: unknown) {
      console.warn(`DutyRaceOfficerLookup: could not read duty roster for ${dateId}`, e);
      this.cache.delete(dateId);
      return undefined;
    }
  }
}
