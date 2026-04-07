import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FirebaseError } from '@angular/fire/app';
import {
  Auth,
  FacebookAuthProvider, GoogleAuthProvider, UserCredential,
  signInWithEmailAndPassword, signInWithPopup, signInWithRedirect
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

const isInStandaloneMode = () =>
  (window.matchMedia('(display-mode: standalone)').matches) ||
  ((window.navigator as any).standalone) ||
  document.referrer.includes('android-app://');

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

   /** OAuth redirect completion runs in `ClubTenant.initialize()` (before this component exists). */

  async loginFormSubmit() {
    if (this.loginForm.valid) {
      await this.signInWith("EmailAndPassword", this.loginForm.getRawValue());
    }
  }

  async signInWith(provider: AuthType, credentials?: { email: string, password: string; }) {
    this.errorMessage.set('');

    try {
      this.loading.set(true);

      let userDetails: UserCredential | null = null;

      switch (provider) {

        case "EmailAndPassword":
          userDetails = await signInWithEmailAndPassword(this.afAuth, credentials!.email, credentials!.password);
          // Note in the case of sign with redirect the user detils 
          if (userDetails) {
            this._handleSignInSuccess();
          }
          break;

        case "Google":
          userDetails = await this._thirdPartySignIn(googleAuthProvider);
          if (userDetails) {
            this._handleSignInSuccess();
          }
          break;

        case "Facebook":
          userDetails = await this._thirdPartySignIn(facebookAuthProvider);
          if (userDetails) {
            this._handleSignInSuccess();
          }
          break;
      }

    } catch (err) {
      this._handleSigninError(err);
    } finally {
      this.loading.set(false);
    }
  }

   /** Sign in with redirect for PWA and popup for browser.
    * Sign in with popup avoids re-loading the application on the browser.
  */
   private async _thirdPartySignIn(provider: GoogleAuthProvider | FacebookAuthProvider): Promise<UserCredential | null> {
      // Use redirect for mobile devices and PWA standalone mode to avoid popup blockers
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isInStandaloneMode() || isMobile) {
         await signInWithRedirect(this.afAuth, provider);
         return null;
      } else {
         return await signInWithPopup(this.afAuth, provider);
    }
  }

  private _handleSigninError(err: any) {
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
