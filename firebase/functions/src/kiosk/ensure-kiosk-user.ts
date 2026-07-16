import { Auth } from "firebase-admin/auth";

/** Create the Auth user for a kiosk UID if it does not already exist. */
export async function ensureKioskAuthUser(
  auth: Auth,
  authUid: string,
  displayName: string,
): Promise<void> {
  try {
    await auth.getUser(authUid);
  } catch (error: unknown) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: string }).code)
        : "";
    if (code !== "auth/user-not-found") {
      throw error;
    }
    await auth.createUser({
      uid: authUid,
      displayName,
      disabled: false,
    });
  }
}
