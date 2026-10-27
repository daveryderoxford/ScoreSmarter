import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Auth, createUserWithEmailAndPassword, sendEmailVerification, updateProfile, type User } from '@angular/fire/auth';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink } from '@angular/router';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { Toolbar } from "app/shared/components/toolbar";
import { DetailPane } from 'app/shared/layout/detail-pane';
import { PageLayout } from 'app/shared/layout/page-layout';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FirebaseError } from '@angular/fire/app';
import { isOAuthProviderEnabled } from '../auth-providers';
import { emailVerificationActionCodeSettings } from '../email-verification';
import { getFirebaseErrorMessage } from '../firebase-error-messages';
import { UserDataService } from 'app/user/services/user-data.service';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';

@Component({
   selector: 'app-signup',
   templateUrl: './signup.html',
   styleUrls: ['./signup.scss'],
   imports: [MatToolbarModule, FlexModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, RouterLink, Toolbar, PageLayout, DetailPane],
   changeDetection: ChangeDetectionStrategy.OnPush
})
export class Signup {
   private router = inject(Router);
   private formBuilder = inject(FormBuilder);
   private afAuth = inject(Auth);
   private snackBar = inject(MatSnackBar);
   private userData = inject(UserDataService);

   loading = signal(false);

   protected readonly googleEnabled = isOAuthProviderEnabled('Google');
   protected hidePassword = signal(true);
   protected hideConfirmPassword = signal(true);

   signupForm = this.formBuilder.group({
      firstname: ['', [Validators.required]],
      surname: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
   }, { validator: this.passwordMissMatch });

   passwordMissMatch(g: FormGroup): any {
      const p1 = g.get('password')!;
      const p2 = g.get('confirmPassword')!;
      let ret: { [error: string]: any; } = {};

      if ((p1.touched || p2.touched) &&
         (p1.value !== p2.value) &&
         (p2 !== null)) {
         ret = { passwordMissMatch: true };
      }

      return (ret);
   }

   async signup() {

      const firstname = normaliseWhitespace(this.signupForm.get('firstname')!.value);
      const surname = normaliseWhitespace(this.signupForm.get('surname')!.value);
      const email = this.signupForm.get('email')!.value!;
      const password = this.signupForm.get('password')!.value!;

      try {
         this.loading.set(true);

         const { user } = await createUserWithEmailAndPassword(this.afAuth, email, password);

         await this.saveName(user, firstname, surname);
         await sendEmailVerification(user, emailVerificationActionCodeSettings());

         await this.router.navigateByUrl('/auth/verify-email');

      } catch (error) {
         this.handleError(error);
      } finally {
         this.loading.set(false);
      }
   }

   /** Not fatal: the user can still set their name later under User details. */
   private async saveName(user: User, firstname: string, surname: string): Promise<void> {
      try {
         await updateProfile(user, { displayName: `${firstname} ${surname}`.trim() });
         await this.userData.ensureUserData({ firstname, surname });
      } catch (error) {
         console.error('Signup: failed to save name', error);
      }
   }

   private handleError(error: any) {
      let errorMessage = 'An unexpected error occurred. Please try again.';

      if (error instanceof FirebaseError) {
         errorMessage = getFirebaseErrorMessage(error);
         console.log(`SignupComponent: Firebase error code: ${error.code} messsage: ${errorMessage}`);
      } else if (error instanceof Error) {
         console.log('SignupComponent: Error creating user:' + error.message);
         errorMessage = `Error: ${error.message}`;
      } else {
         console.log('SignupComponent: unexpected error');
      }
      this.snackBar.open(errorMessage, 'Close', { duration: 5000 });

   }
}