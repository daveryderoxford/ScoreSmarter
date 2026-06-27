import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-kiosk-new-helm-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>New helm</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field class="full-width">
          <mat-label>Helm name</mat-label>
          <input matInput formControlName="helm" autocomplete="off" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="cancel()">Cancel</button>
      <button matButton="filled" type="button" (click)="save()" [disabled]="form.invalid">Continue</button>
    </mat-dialog-actions>
  `,
  styles: `
    .dialog-form {
      padding-top: 8px;
      min-width: min(420px, 90vw);
    }

    .full-width {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KioskNewHelmDialog {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<KioskNewHelmDialog, string | undefined>);

  readonly form = this.fb.nonNullable.group({
    helm: ['', Validators.required],
  });

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  save(): void {
    if (this.form.invalid) return;
    this.dialogRef.close(this.form.controls.helm.value.trim());
  }
}
