import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FirebaseError } from '@angular/fire/app';
import {
  Auth,
  FacebookAuthProvider, GoogleAuthProvider,
  signInWithEmailAndPassword, signInWithPopup
} from '@angular/fire/auth';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { getFirebaseErrorMessage } from '../firebase-error-messages';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { AuthService } from '../auth.service';

export type AuthType = "EmailAndPassword" | "Google" | "Facebook";

const facebookAuthProvider = new FacebookAuthProvider();
const googleAuthProvider = new GoogleAuthProvider();

@Component({
  selector: 'app-login',
  templateUrl: 'login.html',
  styleUrls: ['login.scss'],
  imports: [MatCardModule, Toolbar, FlexModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, RouterLink, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private router = inject(Router);
  private formBuilder = inject(NonNullableFormBuilder);
  private afAuth = inject(Auth);
  private dialogs = inject(DialogsService);
  private authService = inject(AuthService);

  loginForm = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  protected loading = signal(false);

  protected errorMessage = signal('');

   returnUrl = input('/'); //Route parameter

  async loginFormSubmit() {
    if (this.loginForm.valid) {
      await this.signInWith("EmailAndPassword", this.loginForm.getRawValue());
    }
  }

  /**
   * Email/password or OAuth. For Google/Facebook, {@link signInWithPopup} must run in the
   * same synchronous turn as the button click (no prior await) so mobile browsers keep the
   * user-gesture and allow the popup. Returns a promise that settles after success or
   * in-page error handling (errors are not rethrown).
   */
  signInWith(provider: AuthType, credentials?: { email: string, password: string; }): Promise<void> {
    this.errorMessage.set('');
    this.loading.set(true);

    if (provider === 'EmailAndPassword') {
      return this._signInWithEmail(credentials);
    }

    const oauthProvider = provider === 'Google' ? googleAuthProvider : facebookAuthProvider;
    // Invoke popup immediately — do not await anything before this call.
    return signInWithPopup(this.afAuth, oauthProvider)
      .then((userDetails) => {
        if (userDetails) {
          this._handleSignInSuccess();
        }
      })
      .catch((err: unknown) => this._handleSigninError(err))
      .finally(() => this.loading.set(false));
  }

  private async _signInWithEmail(credentials: { email: string; password: string } | undefined): Promise<void> {
    
    try {
      if (!credentials) throw Error('Credentials not specified');

      const userDetails = await signInWithEmailAndPassword(
        this.afAuth,
        credentials.email,
        credentials.password,
      );
      if (userDetails) {
        this._handleSignInSuccess();
      }
    } catch (err) {
      this._handleSigninError(err);
    } finally {
      this.loading.set(false);
    }
  }

  private _handleSigninError(err: unknown) {
    let errorMessage = 'An unexpected error occurred. Please try again.';

    if (err instanceof FirebaseError) {
      errorMessage = getFirebaseErrorMessage(err);
      console.log(`LoginComponent: Firebase error code: ${err.code} message: ${errorMessage}`);

      // Show dialog to highlight duplicate crdentials to highlight this error 
      if (err.code === 'auth/account-exists-with-different-credential') {
        const email = this.loginForm.get('email')!.value;
        this.dialogs.message('Account Exists',
          `An account already exists for ${email} but with a different sign-in method.
                Please sign in using the method you originally used.`);
        return;
      }
    } else if (err instanceof Error) {
      console.log(`LoginComponent: Error logging in:${err.message}`);
      errorMessage = `An unexpected error occurred. ${err.message}.  Please try again.`;
    } else {
      console.log('LoginComponent: unexpected error');
    }
    this.errorMessage.set(errorMessage);
  }

  private _handleSignInSuccess() {
    console.log('LoginComponent: Successful login');
      this.router.navigateByUrl(this.returnUrl() ?? '/');
  }
}
