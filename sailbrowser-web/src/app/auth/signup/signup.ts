import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Auth, createUserWithEmailAndPassword, sendEmailVerification } from '@angular/fire/auth';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink } from '@angular/router';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { Toolbar } from "app/shared/components/toolbar";
import { DetailPane } from 'app/shared/layout/detail-pane';
import { PageLayout } from 'app/shared/layout/page-layout';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FirebaseError } from '@angular/fire/app';
import { getFirebaseErrorMessage } from '../firebase-error-messages';

@Component({
   selector: 'app-signup',
   templateUrl: './signup.html',
   styleUrls: ['./signup.scss'],
   imports: [MatToolbarModule, FlexModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, RouterLink, Toolbar, PageLayout, DetailPane],
   changeDetection: ChangeDetectionStrategy.OnPush
})
export class Signup {
   private router = inject(Router);
   private formBuilder = inject(FormBuilder);
   private afAuth = inject(Auth);
   private snackBar = inject(MatSnackBar);

   loading = signal(false);

   signupForm = this.formBuilder.group({
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

      const email = this.signupForm.get('email')!.value!;
      const password = this.signupForm.get('password')!.value!;

      try {
         this.loading.set(true);

         await createUserWithEmailAndPassword(this.afAuth, email, password);

         // User is automatically signed in so get the current user and send verification email
         const user = await this.afAuth.currentUser;
         if (user) {
            await sendEmailVerification(user);
         } else {
            console.log('Signup:  User enexpectely null');
         }

         await this.router.navigateByUrl('/user');

      } catch (error) {
         this.handleError(error);
      } finally {
         this.loading.set(false);
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