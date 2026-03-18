
export const USER_ROLES = ['sys-admin', 'club-admin', 'race-officer', 'user'] as const;
export type Role = typeof USER_ROLES[number];

export interface UserData {
  id: string;
  role: Role,
  tenantId: string;
  updatedBy: string;
  updatedAt: string;
  firstname: string;
  surname: string;
  email?: string;
  boats: [];
}
