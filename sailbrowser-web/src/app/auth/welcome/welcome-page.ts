import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FirebaseError } from '@angular/fire/app';
import { Auth, signInWithEmailAndPassword, signInWithPopup } from '@angular/fire/auth';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { ClubTenant } from 'app/club-tenant';
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { Toolbar } from 'app/shared/components/toolbar';
import { cloudCallable } from 'app/shared/firebase/cloud-functions';
import { DetailPane } from 'app/shared/layout/detail-pane';
import { PageLayout } from 'app/shared/layout/page-layout';
import { isOAuthProviderEnabled, oauthAuthProvider } from '../auth-providers';
import { AuthService } from '../auth.service';
import { getFirebaseErrorMessage } from '../firebase-error-messages';
import { ClubWelcomeDetails, welcomeLinkProblem, welcomeState } from './welcome-state';

/** Matches the minimum enforced by completeClubWelcome and Firebase Auth. */
const MIN_PASSWORD_LENGTH = 6;

const passwordsMatch = (group: AbstractControl): ValidationErrors | null =>
  group.get('password')?.value === group.get('confirmPassword')?.value ? null : { passwordMismatch: true };

/**
 * Opened from the welcome email sent when a club is approved. The link's one-time code
 * lets whoever holds it become the club's first administrator, so no further email
 * verification is needed.
 */
@Component({
  selector: 'app-welcome-page',
  templateUrl: './welcome-page.html',
  styleUrl: './welcome-page.scss',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, RouterLink,
    Toolbar, PageLayout, DetailPane, LoadingCentered],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomePage implements OnInit {
  private readonly afAuth = inject(Auth);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly clubId = inject(ClubTenant).clubId;

  /** The welcome link's one-time code (query parameter). */
  readonly code = input('');

  protected readonly details = signal<ClubWelcomeDetails | undefined>(undefined);
  protected readonly linkProblem = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly hidePassword = signal(true);
  protected readonly googleEnabled = isOAuthProviderEnabled('Google');
  protected readonly minPasswordLength = MIN_PASSWORD_LENGTH;

  protected readonly signedInEmail = computed(() => this.auth.user()?.email ?? '');
  protected readonly state = computed(() => {
    const details = this.details();
    return details ? welcomeState(details, this.auth.loggedIn()) : undefined;
  });
  protected readonly loginReturnUrl = computed(() => `/auth/welcome?code=${encodeURIComponent(this.code())}`);

  protected readonly passwordForm = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
    confirmPassword: ['', Validators.required],
  }, { validators: passwordsMatch });

  async ngOnInit(): Promise<void> {
    if (!this.code()) {
      this.linkProblem.set(welcomeLinkProblem(undefined));
      return;
    }
    try {
      const getWelcome = await cloudCallable<{ clubId: string; code: string }, ClubWelcomeDetails>('getClubWelcome');
      this.details.set((await getWelcome({ clubId: this.clubId, code: this.code() })).data);
    } catch (err: unknown) {
      console.error('WelcomePage: getClubWelcome failed', err);
      this.linkProblem.set(welcomeLinkProblem(reasonOf(err)));
    }
  }

  /** New account with the contact email; the server creates it already verified. */
  async createAccount(): Promise<void> {
    this.passwordForm.markAllAsTouched();
    if (this.passwordForm.invalid) return;
    const { password } = this.passwordForm.getRawValue();
    await this.run(async () => {
      const { email } = await this.complete(password);
      await signInWithEmailAndPassword(this.afAuth, email, password);
    });
  }

  /** {@link signInWithPopup} must run in the click's synchronous turn so the popup is allowed. */
  continueWithGoogle(): Promise<void> {
    const provider = oauthAuthProvider('Google');
    if (!provider) return Promise.resolve();
    const popup = signInWithPopup(this.afAuth, provider);
    return this.run(async () => {
      await popup;
      await this.complete();
    });
  }

  continueAsSignedIn(): Promise<void> {
    return this.run(async () => {
      await this.complete();
    });
  }

  async useDifferentAccount(): Promise<void> {
    await this.auth.signOut();
  }

  private async complete(password?: string): Promise<{ created: boolean; email: string }> {
    const completeWelcome = await cloudCallable<
      { clubId: string; code: string; password?: string },
      { created: boolean; email: string }
    >('completeClubWelcome');
    const result = await completeWelcome({ clubId: this.clubId, code: this.code(), password });
    return result.data;
  }

  /** Runs a welcome action, then takes the new administrator to Club admin. */
  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      await this.auth.refreshIdToken();
      this.snackBar.open('You are now the club administrator.', 'Close', { duration: 8000 });
      await this.router.navigateByUrl('/club-admin');
    } catch (err: unknown) {
      console.error('WelcomePage: welcome failed', err);
      const reason = reasonOf(err);
      if (reason === 'expired' || reason === 'claimed' || reason === 'invalid') {
        this.linkProblem.set(welcomeLinkProblem(reason));
      } else if (err instanceof FirebaseError && err.code.startsWith('auth/')) {
        this.error.set(getFirebaseErrorMessage(err));
      } else {
        this.error.set(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      this.busy.set(false);
    }
  }
}

/** `details.reason` from a callable's HttpsError, e.g. "expired" or "account-exists". */
function reasonOf(err: unknown): unknown {
  return (err as { details?: { reason?: unknown } } | undefined)?.details?.reason;
}
