import { describe, expect, it } from 'vitest';
import { welcomeLinkProblem, welcomeState, type ClubWelcomeDetails } from './welcome-state';

const details = (accountExists: boolean): ClubWelcomeDetails => ({
  clubName: 'West Bay SC',
  contactName: 'Sam Secretary',
  contactEmail: 'sec@westbay.org',
  accountExists,
});

describe('welcomeState', () => {
  it('offers a new account when nobody is signed in and the email has no account', () => {
    expect(welcomeState(details(false), false)).toBe('new-account');
  });

  it('asks the contact to sign in when an account already uses their email', () => {
    expect(welcomeState(details(true), false)).toBe('existing-account');
  });

  it('continues as the signed-in account whether or not the email has an account', () => {
    expect(welcomeState(details(false), true)).toBe('signed-in');
    expect(welcomeState(details(true), true)).toBe('signed-in');
  });
});

describe('welcomeLinkProblem', () => {
  it('explains expired, used and invalid links', () => {
    expect(welcomeLinkProblem('expired')).toMatch(/expired/);
    expect(welcomeLinkProblem('claimed')).toMatch(/already been used/);
    expect(welcomeLinkProblem(undefined)).toMatch(/not valid/);
  });
});
