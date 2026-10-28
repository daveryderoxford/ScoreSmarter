/** What `getClubWelcome` returns for a valid welcome link. */
export interface ClubWelcomeDetails {
  clubName: string;
  contactName: string;
  contactEmail: string;
  accountExists: boolean;
}

/**
 * Which form the welcome page shows:
 * - `signed-in`: continue as the signed-in account (any account may claim with the link);
 * - `existing-account`: an account already uses the contact email, so sign in first;
 * - `new-account`: choose a password for a new account, or continue with Google.
 */
export type WelcomeState = 'signed-in' | 'existing-account' | 'new-account';

export function welcomeState(details: ClubWelcomeDetails, signedIn: boolean): WelcomeState {
  if (signedIn) return 'signed-in';
  return details.accountExists ? 'existing-account' : 'new-account';
}

/** Message for a link `getClubWelcome` or `completeClubWelcome` refused. */
export function welcomeLinkProblem(reason: unknown): string {
  switch (reason) {
    case 'expired':
      return 'This welcome link has expired.';
    case 'claimed':
      return 'This welcome link has already been used. If you set up the account, sign in to continue.';
    default:
      return 'This welcome link is not valid.';
  }
}
