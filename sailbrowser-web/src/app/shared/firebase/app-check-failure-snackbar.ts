import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_SNACK_BAR_DATA,
  MatSnackBarAction,
  MatSnackBarActions,
  MatSnackBarLabel,
  MatSnackBarRef,
} from '@angular/material/snack-bar';
import type { AppCheckSupportCode } from './app-check-errors';

export interface AppCheckFailureSnackbarData {
  supportCode: AppCheckSupportCode;
  details: string;
}

@Component({
  selector: 'app-app-check-failure-snackbar',
  imports: [MatButtonModule, MatSnackBarLabel, MatSnackBarActions, MatSnackBarAction],
  template: `
    <div class="content" role="alert">
      <span matSnackBarLabel>
        Security check failed ({{ data.supportCode }}). Quote this code to support.
      </span>
      <span matSnackBarActions>
        <button matButton matSnackBarAction type="button" (click)="copy()">Copy details</button>
        <button matButton matSnackBarAction type="button" (click)="reload()">Reload</button>
        <button matButton matSnackBarAction type="button" (click)="dismiss()">Dismiss</button>
      </span>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .content {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.5rem;
    }
  `,
})
export class AppCheckFailureSnackbar {
  readonly data = inject<AppCheckFailureSnackbarData>(MAT_SNACK_BAR_DATA);
  private readonly ref = inject(MatSnackBarRef<AppCheckFailureSnackbar>);

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.data.details);
    } catch {
      console.info('App Check support details:\n' + this.data.details);
    }
  }

  reload(): void {
    location.reload();
  }

  dismiss(): void {
    this.ref.dismiss();
  }
}
