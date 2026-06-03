import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Auth, sendPasswordResetEmail } from '@angular/fire/auth';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { FirebaseError } from '@angular/fire/app';
import { AuthService } from 'app/auth/auth.service';
import { getFirebaseErrorMessage } from 'app/auth/firebase-error-messages';
import { SubmitButton } from 'app/shared/components/submit-button';
import { Toolbar } from 'app/shared/components/toolbar';
import type { UserData } from '../model/user';
import { UserDataService } from '../services/user-data.service';

@Component({
  selector: 'app-user',
  templateUrl: './user-page.html',
  styleUrls: ['./user-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Toolbar,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatButtonModule,
    RouterLink,
    SubmitButton,
  ],
})
export class UserPage {
  protected readonly auth = inject(AuthService);
  private readonly firebaseAuth = inject(Auth);
  private readonly router = inject(Router);
  private readonly userData = inject(UserDataService);
  private readonly snackBar = inject(MatSnackBar);

  readonly userForm = new FormGroup({
    firstname: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    surname: new FormControl('', { validators: [Validators.required], nonNullable: true }),
  });

  readonly busy = signal(false);
  readonly refreshingClaims = signal(false);
  readonly resettingPassword = signal(false);

  readonly profileRole = computed(() => this.userData.user()?.role ?? null);

  constructor() {
    effect(() => {
      const data = this.userData.user();
      if (data) {
        this.userForm.patchValue(
          { firstname: data.firstname ?? '', surname: data.surname ?? '' },
          { emitEvent: false },
        );
      }
    });

    effect(() => {
      if (!this.auth.loggedIn()) {
        void this.router.navigate(['/auth/login']);
      }
    });
  }

  async save(): Promise<void> {
    if (this.userForm.invalid || this.busy()) return;

    this.busy.set(true);
    try {
      await this.userData.updateDetails(this.userForm.getRawValue() as Partial<UserData>);
      this.snackBar.open('Profile saved.', 'Dismiss', { duration: 3000 });
      this.userForm.markAsPristine();
    } catch (e) {
      console.error('UserPage: error saving profile', e);
      this.snackBar.open('Error saving profile.', 'Dismiss', { duration: 4000 });
    } finally {
      this.busy.set(false);
    }
  }

  async refreshClaims(): Promise<void> {
    if (this.refreshingClaims()) return;
    this.refreshingClaims.set(true);
    try {
      await this.auth.refreshIdToken();
      this.snackBar.open('Claims refreshed.', 'Dismiss', { duration: 3000 });
    } catch (e) {
      console.error('UserPage: error refreshing claims', e);
      this.snackBar.open('Could not refresh claims.', 'Dismiss', { duration: 4000 });
    } finally {
      this.refreshingClaims.set(false);
    }
  }

  async sendPasswordReset(): Promise<void> {
    const email = this.auth.user()?.email;
    if (!email || this.resettingPassword()) return;

    this.resettingPassword.set(true);
    try {
      await sendPasswordResetEmail(this.firebaseAuth, email);
      this.snackBar.open(`Password reset email sent to ${email}.`, 'Dismiss', { duration: 5000 });
    } catch (e: unknown) {
      const msg =
        e instanceof FirebaseError ? getFirebaseErrorMessage(e) : 'Could not send reset email.';
      console.error('UserPage: password reset failed', e);
      this.snackBar.open(msg, 'Dismiss', { duration: 5000 });
    } finally {
      this.resettingPassword.set(false);
    }
  }

  canDeactivate(): boolean {
    return !this.userForm.dirty;
  }
}
