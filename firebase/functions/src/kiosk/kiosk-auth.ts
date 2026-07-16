/** Max length for Fully Kiosk hardware device IDs. */
export const MAX_DEVICE_ID_LENGTH = 128;

/** Max length for optional display labels. */
export const MAX_LABEL_LENGTH = 80;

export type KioskStatus = "active" | "revoked";

export interface AuthorizedKiosk {
  deviceId: string;
  label?: string;
  status: KioskStatus;
  authUid: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Validates a hardware device ID from Fully Kiosk (or admin registration).
 * Allows alphanumeric, hyphen, underscore, and colon (common Android IDs).
 */
export function validateDeviceId(deviceId: unknown): string {
  if (typeof deviceId !== "string" || deviceId.trim().length === 0) {
    throw new Error("missing_device_id");
  }
  const trimmed = deviceId.trim();
  if (trimmed.length > MAX_DEVICE_ID_LENGTH) {
    throw new Error("device_id_too_long");
  }
  if (!/^[a-zA-Z0-9_.:-]+$/.test(trimmed)) {
    throw new Error("device_id_invalid_chars");
  }
  return trimmed;
}

export function validateClubId(clubId: unknown): string {
  if (typeof clubId !== "string" || clubId.trim().length === 0) {
    throw new Error("missing_club_id");
  }
  const trimmed = clubId.trim();
  if (trimmed.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Error("club_id_invalid");
  }
  return trimmed;
}

/**
 * Sanitize for Firebase Auth UID: alphanumeric + underscore only, prefixed.
 * Doc ID in Firestore remains the raw deviceId.
 */
export function sanitizeDeviceId(deviceId: string): string {
  return deviceId.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 120);
}

export function kioskUid(deviceId: string): string {
  return `kiosk_${sanitizeDeviceId(deviceId)}`;
}

export function kioskClaims(clubId: string, deviceId: string): Record<string, unknown> {
  return {
    clubs: { [clubId]: "race-officer" },
    kiosk: true,
    deviceId,
  };
}

export function kioskDocPath(clubId: string, deviceId: string): string {
  return `clubs/${clubId}/authorized_kiosks/${deviceId}`;
}
