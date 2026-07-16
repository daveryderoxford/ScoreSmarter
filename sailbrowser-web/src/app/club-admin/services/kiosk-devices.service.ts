import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { collectionData } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { ClubTenant, FirestoreTenantService } from 'app/club-tenant';
import { AuthorizedKiosk } from '../model/authorized-kiosk';

type ManageAction = 'register' | 'revoke' | 'activate';

@Injectable({ providedIn: 'root' })
export class KioskDevicesService {
  private readonly tenant = inject(FirestoreTenantService);
  private readonly clubTenant = inject(ClubTenant);
  private readonly functions = inject(Functions);

  readonly kiosks = toSignal(
    collectionData(this.tenant.collectionRef<AuthorizedKiosk>('authorized_kiosks'), {
      idField: 'deviceId',
    }),
    { initialValue: [] as AuthorizedKiosk[] },
  );

  async manage(
    deviceId: string,
    action: ManageAction,
    label?: string,
  ): Promise<AuthorizedKiosk> {
    const clubId = this.clubTenant.clubId;
    const fn = httpsCallable<
      { clubId: string; deviceId: string; action: ManageAction; label?: string },
      { kiosk: AuthorizedKiosk }
    >(this.functions, 'manageAuthorizedKiosk');
    const result = await fn({
      clubId,
      deviceId: deviceId.trim(),
      action,
      ...(label?.trim() ? { label: label.trim() } : {}),
    });
    return result.data.kiosk;
  }
}
