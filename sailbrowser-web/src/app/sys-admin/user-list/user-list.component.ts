import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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

@Component({
  selector: 'app-user-list',
  styleUrl: './user-list.component.scss',
  imports: [MatListModule, MatProgressSpinnerModule, Toolbar, LoadingCentered, MatSelectModule, MatFormFieldModule, MatDividerModule, MatSlideToggleModule],
  template: `
    <app-toolbar title="User Admin" style="grid-area: toolbar">
      <div center>
        @if (auth.isSysAdmin()) {
          <mat-slide-toggle [checked]="uas.isGlobal()" (change)="toggleGlobal($event.checked)">
            Show Global Users
          </mat-slide-toggle>
        }
      </div>
    </app-toolbar>

    @switch (uas.status()) {
      @case ('loading') {
        <app-loading-centered/>
      }
      @case ('error') {
        <div class="alert alert-danger">
          <p>Error loading users:</p>
          <pre>{{ uas.error()?.message }}</pre>
        </div>
      }
      @case ('resolved') {
        <mat-list>
          @for (user of uas.users(); track user.key) {
            <mat-list-item>
              <div matListItemTitle>{{ user.firstname }} {{ user.surname }}</div>
              <div matListItemLine>Email: {{ user.email }} </div>
              <div matListItemLine>UID: {{user.key }}</div>
              
              <div matListItemMeta>
                <mat-form-field appearance="outline" class="role-select">
                  <mat-label>Role</mat-label>
                  <mat-select [value]="user.role || 'user'" (selectionChange)="updateRole(user.key, $event.value)">
                    <mat-option value="user">User</mat-option>
                    <mat-option value="race-officer">Race Officer</mat-option>
                    @if (auth.isSysAdmin()) {
                      <mat-option value="club-admin">Club Admin</mat-option>
                      <mat-option value="sys-admin">Sys Admin</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              </div>
            </mat-list-item>
            <mat-divider/>
          } @empty {
            <p>No users found.</p>
          }
        </mat-list>
      }
    } `,
  styles: [`
    .role-select {
      width: 150px;
      margin-top: 8px;
    }
    mat-list-item {
      height: auto !important;
      padding: 16px 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserListComponent {
  protected uas = inject(UserAdminService);
  protected auth = inject(AuthService);

  constructor() {
    this.uas.load();
  }

  toggleGlobal(isGlobal: boolean) {
    if (isGlobal) {
      this.uas.loadGlobal();
    } else {
      this.uas.load();
    }
  }

  async updateRole(uid: string, role: string) {
    try {
      await this.uas.assignRole(uid, role);
    } catch (e) {
      console.error('Error updating role', e);
    }
  }
}