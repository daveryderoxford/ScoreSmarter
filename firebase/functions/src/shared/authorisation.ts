import { DecodedIdToken } from "firebase-admin/auth";
import { CallableRequest } from "firebase-functions/v2/https";
import { Role } from "../model/user-data.js";
import { detailedHttpsError } from "./https-error.js";

type CallableAuth = NonNullable<CallableRequest["auth"]>;

export function assertAuthenticated(
  auth: CallableRequest["auth"],
  details: Record<string, unknown> = {},
): asserts auth is CallableAuth {
  if (!auth) {
    throw detailedHttpsError("unauthenticated", "You must be logged in.", {
      stage: "validate_input",
      cause: "no_auth",
      ...details,
    });
  }
}

export function callerClaims(auth: CallableAuth): DecodedIdToken {
  return auth.token;
}

export function assertRole(
  role: Role,
  token: DecodedIdToken,
  clubId: string,
): void {
  if (hasPermissions(role, token, clubId)) {
    return;
  }

  console.error(`Request denied due to lack of ${role} permissions`);
  throw detailedHttpsError("permission-denied", `Request denied as you do not have ${role} permission`, {
    stage: "assert_permissions",
    cause: role,
    clubId,
  });
}

export function assertCallerRole(
  role: Role,
  auth: CallableAuth,
  clubId: string,
): void {
  assertRole(role, callerClaims(auth), clubId);
}

/**
 * Authorize role assignment: sys-admin may assign any role; club-admin may assign
 * race-officer or user within their club only.
 */
export function assertCanAssignRole(
  callerClaims: DecodedIdToken,
  targetRole: Role,
  clubId: string | undefined,
): void {
  const callerIsSysAdmin = isSysAdmin(callerClaims);
  const callerIsClubAdmin = clubId ? isClubAdmin(callerClaims, clubId) : false;

  if (!callerIsSysAdmin && !callerIsClubAdmin) {
    throw detailedHttpsError("permission-denied", "You do not have permission to assign roles.", {
      stage: "assert_assign_role",
      cause: "insufficient_caller_role",
      clubId,
    });
  }

  if (!callerIsSysAdmin && (targetRole === "club-admin" || targetRole === "sys-admin")) {
    throw detailedHttpsError("permission-denied", "Only sys-admins can assign administrative roles.", {
      stage: "assert_assign_role",
      cause: "admin_role_requires_sys_admin",
      clubId,
      targetRole,
    });
  }

  if (targetRole !== "sys-admin" && !clubId) {
    throw detailedHttpsError("invalid-argument", "Club ID is required for non-sys-admin roles.", {
      stage: "assert_assign_role",
      cause: "missing_club_id",
      targetRole,
    });
  }
}

export function hasPermissions(role: Role, claims: DecodedIdToken, clubId: string): boolean {
  switch (role) {
    case "sys-admin":
      return hasSysAdminRights(claims);
    case "club-admin":
      return hasClubAdminRights(claims, clubId);
    case "race-officer":
      return hasRORights(claims, clubId);
    case "user":
      return hasUserRights(claims, clubId);
  }
}

export const hasSysAdminRights = (claims: DecodedIdToken) => isSysAdmin(claims);
export const hasClubAdminRights = (claims: DecodedIdToken, clubId: string) =>
  (hasSysAdminRights(claims) || isClubAdmin(claims, clubId));
export const hasRORights = (claims: DecodedIdToken, clubId: string) =>
  (hasClubAdminRights(claims, clubId) || isRO(claims, clubId));
export const hasUserRights = (claims: DecodedIdToken, clubId: string) =>
  (hasRORights(claims, clubId) || isUser(claims, clubId));

export const isSysAdmin = (claims: DecodedIdToken) => 
  claims.sysAdmin === true || 
  claims.uid === 'Uw4HKGlcHla1Fm8Zw8B7DBVyl1j1' || // Google login
  claims.uid === 'ybV4KPBh7xY067dNQBSYfrzwtVI2';
export const isClubAdmin = (claims: DecodedIdToken, clubId: string) =>
  (claims.clubs?.[clubId] === "club-admin");
export const isRO = (claims: DecodedIdToken, clubId: string) =>
  (claims.clubs?.[clubId] === "race-officer");
export const isUser = (claims: DecodedIdToken, clubId: string) =>
  (claims.clubs?.[clubId] === "user");
