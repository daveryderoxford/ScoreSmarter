import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { Auth, sendEmailVerification } from '@angular/fire/auth';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { Toolbar } from 'app/shared/components/toolbar';
import { DetailPane } from 'app/shared/layout/detail-pane';
import { PageLayout } from 'app/shared/layout/page-layout';
import { UserDataService } from 'app/user/services/user-data.service';
import { AuthService } from '../auth.service';
import { emailVerificationActionCodeSettings, needsEmailVerification } from '../email-verification';

const AUTO_CHECK_INTERVAL_MS = 5_000;
const RESEND_COOLDOWN_SECONDS = 60;

@Component({
  selector: 'app-verify-email',
  templateUrl: './verify-email.html',
  styleUrls: ['./verify-email.scss'],
  imports: [FlexModule, MatButtonModule, RouterLink, Toolbar, PageLayout, DetailPane],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmail {
  private readonly afAuth = inject(Auth);
  private readonly auth = inject(AuthService);
  private readonly userData = inject(UserDataService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  /** Optional redirect after verification (route query param). */
  readonly returnUrl = input('/');

  protected readonly email = computed(() => this.auth.user()?.email ?? '');
  protected readonly sender = 'noreply@scoresmarter.app';
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly resendCooldown = signal(0);

  private checking = false;
  private cooldownTimer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    afterNextRender(() => {
      // After Firebase's Continue button, emailVerified is stale until reload. Keep
      // checking while the page is open so returning from the email app continues.
      void this.refreshAndContinueIfVerified();
      const checkIfVisible = () => {
        if (document.visibilityState === 'visible') void this.refreshAndContinueIfVerified();
      };
      const timer = setInterval(checkIfVisible, AUTO_CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', checkIfVisible);
      this.destroyRef.onDestroy(() => {
        clearInterval(timer);
        clearInterval(this.cooldownTimer);
        document.removeEventListener('visibilitychange', checkIfVisible);
      });
    });
  }

  /** Silent reload — navigates away only when already verified. */
  private async refreshAndContinueIfVerified(): Promise<void> {
    const user = this.afAuth.currentUser;
    if (!user || this.checking) return;
    this.checking = true;
    try {
      await user.reload();
      if (!needsEmailVerification(this.afAuth.currentUser)) await this.continue();
    } catch {
      // User can still use “I’ve verified my email”.
    } finally {
      this.checking = false;
    }
  }

  /** Verified: refresh the token, re-check club access (e.g. first club admin), then go on. */
  private async continue(): Promise<void> {
    await this.auth.refreshIdToken();
    try {
      await this.userData.ensureUserData();
    } catch (err: unknown) {
      console.error('VerifyEmail: ensureUserData failed', err);
    }
    await this.router.navigateByUrl(this.returnUrl() || '/');
  }

  async resend(): Promise<void> {
    const user = this.afAuth.currentUser;
    if (!user) {
      await this.router.navigateByUrl('/auth/login');
      return;
    }

    this.busy.set(true);
    this.message.set('');
    try {
      await sendEmailVerification(user, emailVerificationActionCodeSettings());
      this.message.set('Verification email sent. Check your inbox (and spam folder).');
      this.snackBar.open('Verification email sent', 'Close', { duration: 4000 });
      this.startResendCooldown();
    } catch (err: unknown) {
      console.error('VerifyEmail: resend failed', err);
      this.message.set('Could not send verification email. Please try again shortly.');
    } finally {
      this.busy.set(false);
    }
  }

  private startResendCooldown(): void {
    clearInterval(this.cooldownTimer);
    this.resendCooldown.set(RESEND_COOLDOWN_SECONDS);
    this.cooldownTimer = setInterval(() => {
      this.resendCooldown.update(s => s - 1);
      if (this.resendCooldown() <= 0) clearInterval(this.cooldownTimer);
    }, 1000);
  }

  async checkVerified(): Promise<void> {
    const user = this.afAuth.currentUser;
    if (!user) {
      await this.router.navigateByUrl('/auth/login');
      return;
    }

    this.busy.set(true);
    this.message.set('');
    try {
      await user.reload();
      if (!needsEmailVerification(this.afAuth.currentUser)) {
        await this.continue();
        return;
      }
      this.message.set('Email not verified yet. Open the link in the email, then try again.');
    } catch (err: unknown) {
      console.error('VerifyEmail: reload failed', err);
      this.message.set('Could not check verification status. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/auth/login');
  }
}
