import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { AuthService } from 'app/auth/auth.service';
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
    MatFormFieldModule,
    MatInputModule,
    SubmitButton,
  ],
})
export class UserPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly userData = inject(UserDataService);
  private readonly snackBar = inject(MatSnackBar);

  readonly userForm = new FormGroup({
    firstname: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    surname: new FormControl('', { validators: [Validators.required], nonNullable: true }),
  });

  readonly busy = signal(false);

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

  canDeactivate(): boolean {
    return !this.userForm.dirty;
  }
}
