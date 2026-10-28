/**
 * A club id is the first label of the club's host name ({id}.ro.scoresmarter.app), so it
 * must be a valid DNS label. Keep in step with the registration form on the home site
 * and the `club-registrations` rule in firestore.rules.
 */
export const CLUB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CLUB_ID_MIN_LENGTH = 3;
export const CLUB_ID_MAX_LENGTH = 12;

/** Host labels used by ScoreSmarter itself, which must never become clubs. */
export const RESERVED_CLUB_IDS: ReadonlySet<string> = new Set([
  "www", "auth", "ro", "api", "app", "admin", "mail", "email", "support", "help",
  "dev", "staging", "test-site", "scoresmarter", "tenant-apps", "sys-admin",
]);

/** Why `id` can't be used as a club id, or undefined when it can. */
export function clubIdProblem(id: string): string | undefined {
  if (id.length < CLUB_ID_MIN_LENGTH || id.length > CLUB_ID_MAX_LENGTH) {
    return `must be ${CLUB_ID_MIN_LENGTH} to ${CLUB_ID_MAX_LENGTH} characters`;
  }
  if (!CLUB_ID_PATTERN.test(id)) {
    return "may only use lowercase letters, digits and single hyphens between them";
  }
  if (RESERVED_CLUB_IDS.has(id)) return "is reserved";
  return undefined;
}
