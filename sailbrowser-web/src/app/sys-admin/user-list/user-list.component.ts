import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { UserAdminService } from './user-admin.service';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Toolbar } from "app/shared/components/toolbar";
import { LoadingCentered } from "app/shared/components/loading-centered";
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AuthService } from 'app/auth/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatOptionModule } from '@angular/material/core';
import { CenteredText } from "app/shared/components/centered-text";

@Component({
  selector: 'app-user-list',
  styleUrl: './user-list.component.scss',
  imports: [MatListModule, MatProgressSpinnerModule, Toolbar, LoadingCentered, MatSelectModule, MatOptionModule, MatFormFieldModule, MatDividerModule, MatSlideToggleModule, CenteredText],
  templateUrl: './user-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserListComponent {
  protected uas = inject(UserAdminService);
  protected auth = inject(AuthService);
  protected snackbar = inject(MatSnackBar) ;
  protected roleUpdateError = signal<string | null>(null);

  constructor() {
    this.uas.load();
  }

  toggleGlobal(isGlobal: boolean) {
    this.roleUpdateError.set(null);
    if (isGlobal) {
      this.uas.loadGlobal();
    } else {
      this.uas.load();
    }
  }

  async updateRole(uid: string, role: string) {
    this.roleUpdateError.set(null);
    try {
      await this.uas.assignRole(uid, role);
    } catch (e: any) {
      console.error('Error updating role', e);
      this.roleUpdateError.set(e.message || 'Error assigning role to the user');
    }
  }
}