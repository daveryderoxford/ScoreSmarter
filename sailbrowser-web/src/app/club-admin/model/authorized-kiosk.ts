export type KioskDeviceStatus = 'active' | 'revoked';

export interface AuthorizedKiosk {
  deviceId: string;
  label?: string;
  status: KioskDeviceStatus;
  authUid: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}
