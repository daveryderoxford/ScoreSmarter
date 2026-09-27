import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Auth, updatePassword } from '@angular/fire/auth';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { Toolbar } from 'app/shared/components/toolbar';
import { DetailPane } from 'app/shared/layout/detail-pane';
import { PageLayout } from 'app/shared/layout/page-layout';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FirebaseError } from '@angular/fire/app';
import { getFirebaseErrorMessage } from '../firebase-error-messages';

@Component({
  selector: 'app-change-password',
  templateUrl: './change-password.html',
  styleUrls: ['./change-password.scss'],
  imports: [FlexModule, MatCardModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, Toolbar, PageLayout, DetailPane],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChangePassword {
  private router = inject(Router);
  private formBuilder = inject(FormBuilder);
  private afAuth = inject(Auth);
  private snackBar = inject(MatSnackBar);

  form = this.formBuilder.group({
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
  }, { validators: this.passwordMissMatch });

  passwordMissMatch(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');

    if (password?.value !== confirmPassword?.value && 
       (password?.touched || confirmPassword?.touched)) {
      return { passwordMissMatch: true };
    }

    return null;
  }

  async changePassword() {
    if (this.form.invalid) {
      return;
    }

    const user = this.afAuth.currentUser;
    if (!user) {
      console.error('ChangePassword: User is not authenticated.');
      this.snackBar.open('You must be logged in to change your password.', 'Close', { duration: 3000 });
      return;
    }

    const password = this.form.get('password')!.value!;

    try {
      await updatePassword(user, password);
      this.snackBar.open('Password updated successfully!', 'Close', { duration: 3000 });
      this.router.navigateByUrl('/');
    } catch (e: unknown) {
      let msg = 'Unexpected error updating password. Please try again.';
      if (e instanceof FirebaseError) {
        msg = getFirebaseErrorMessage(e);
        console.error(`ChangePassword: Error updating password. Error code: ${e.code}`, e);
      } else if (e instanceof Error) {
        msg = e.message;
        console.error(`ChangePassword: Error updating password:`, e);
      } else {
        console.error('ChangePassword: Unexpected error updating password', e);
      }
      this.snackBar.open(msg, 'Close', { duration: 5000 });
    }
  }
}
