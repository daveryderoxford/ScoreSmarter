import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { collectionData } from '@angular/fire/firestore';
import { ClubTenant, FirestoreTenantService } from 'app/club-tenant';
import { cloudCallable } from 'app/shared/firebase/cloud-functions';
import { AuthorizedKiosk } from '../model/authorized-kiosk';

type ManageAction = 'register' | 'revoke' | 'activate';

@Injectable({ providedIn: 'root' })
export class KioskDevicesService {
  private readonly tenant = inject(FirestoreTenantService);
  private readonly clubTenant = inject(ClubTenant);

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
    const fn = await cloudCallable<
      { clubId: string; deviceId: string; action: ManageAction; label?: string },
      { kiosk: AuthorizedKiosk }
    >('manageAuthorizedKiosk');
    const result = await fn({
      clubId,
      deviceId: deviceId.trim(),
      action,
      ...(label?.trim() ? { label: label.trim() } : {}),
    });
    return result.data.kiosk;
  }
}
