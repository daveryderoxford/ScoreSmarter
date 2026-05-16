import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { ClubTagDefinition } from '../../model/club-tag';
import { TagDefinitionForm } from './tag-definition-form';

export interface TagDefinitionEditDialogData {
  value: ClubTagDefinition | null;
  existingIds: readonly string[];
  mode: 'create' | 'edit';
}

/**
 * Thin modal wrapper around `app-tag-definition-form`. Only handles the
 * Cancel/Save plumbing - all field-level work lives in the form itself.
 */
@Component({
  selector: 'app-tag-definition-edit-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, TagDefinitionForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.mode === 'edit' ? 'Edit tag' : 'New tag' }}</h2>
    <mat-dialog-content>
      <app-tag-definition-form
        [value]="data.value"
        [existingIds]="data.existingIds"
        [mode]="data.mode"
        (valueChange)="onValueChange($event)"
        (validChange)="onValidChange($event)" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="cancel()">Cancel</button>
      <button matButton="tonal" type="button" [disabled]="!canSave()" (click)="save()">
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 360px;
    }
  `],
})
export class TagDefinitionEditDialog {
  protected readonly data = inject<TagDefinitionEditDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<TagDefinitionEditDialog, ClubTagDefinition | undefined>);
  private readonly formRef = viewChild.required(TagDefinitionForm);

  protected readonly canSave = signal(false);
  private readonly draft = signal<ClubTagDefinition | null>(this.data.value);

  protected onValueChange(value: ClubTagDefinition): void {
    this.draft.set(value);
  }

  protected onValidChange(valid: boolean): void {
    this.canSave.set(valid);
  }

  protected cancel(): void {
    this.dialogRef.close(undefined);
  }

  protected save(): void {
    const snap = this.formRef().snapshot() ?? this.draft();
    if (!snap) return;
    this.dialogRef.close(snap);
  }
}
