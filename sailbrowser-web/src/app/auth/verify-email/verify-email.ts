import { afterNextRender, ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Auth, sendEmailVerification } from '@angular/fire/auth';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { Toolbar } from 'app/shared/components/toolbar';
import { DetailPane } from 'app/shared/layout/detail-pane';
import { PageLayout } from 'app/shared/layout/page-layout';
import { AuthService } from '../auth.service';
import { emailVerificationActionCodeSettings, needsEmailVerification } from '../email-verification';

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
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  /** Optional redirect after verification (route query param). */
  readonly returnUrl = input('/');

  protected readonly email = computed(() => this.auth.user()?.email ?? '');
  protected readonly busy = signal(false);
  protected readonly message = signal('');

  constructor() {
    afterNextRender(() => {
      // After Firebase's Continue button, emailVerified is stale until reload.
      void this.refreshAndContinueIfVerified();
    });
  }

  /** Silent reload — navigates away only when already verified. */
  private async refreshAndContinueIfVerified(): Promise<void> {
    const user = this.afAuth.currentUser;
    if (!user) return;
    try {
      await user.reload();
      await this.auth.refreshIdToken();
      if (!needsEmailVerification(this.afAuth.currentUser)) {
        await this.router.navigateByUrl(this.returnUrl() || '/');
      }
    } catch {
      // User can still use “I’ve verified my email”.
    }
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
    } catch (err: unknown) {
      console.error('VerifyEmail: resend failed', err);
      this.message.set('Could not send verification email. Please try again shortly.');
    } finally {
      this.busy.set(false);
    }
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
      await this.auth.refreshIdToken();
      if (!needsEmailVerification(this.afAuth.currentUser)) {
        await this.router.navigateByUrl(this.returnUrl() || '/');
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
