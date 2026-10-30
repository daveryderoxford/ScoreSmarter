import { ChangeDetectionStrategy, Component, DestroyRef, inject, Injectable } from '@angular/core';
import type { AbstractControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AuthService } from 'app/auth/auth.service';
import { firstValueFrom, type Subscription } from 'rxjs';
import type { BoatClass } from '../model/boat-class';
import { AddClassForm } from './add-class-form/add-class-form';

/** Value of the "Add class…" option at the end of a class dropdown. */
export const ADD_CLASS_OPTION = '\u0000add-class';

export interface AddClassDialogData {
  /** E.g. a scanned class name the club doesn't have. */
  initialName?: string;
}

@Component({
  selector: 'app-add-class-dialog',
  imports: [MatDialogModule, MatButtonModule, AddClassForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Add class</h2>
    <mat-dialog-content>
      <p class="intro">The class is added to the club's class list.</p>
      <app-add-class-form [initialName]="data?.initialName ?? ''" (added)="dialogRef.close($event)">
        <button formActions matButton type="button" mat-dialog-close>Cancel</button>
      </app-add-class-form>
    </mat-dialog-content>
  `,
  styles: `
    mat-dialog-content {
      min-width: 320px;
      max-width: 440px;
    }
    .intro {
      margin: 0 0 16px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AddClassDialog {
  protected readonly data = inject<AddClassDialogData | null>(MAT_DIALOG_DATA, { optional: true });
  protected readonly dialogRef = inject(MatDialogRef<AddClassDialog, BoatClass | undefined>);
}

/** Offers "Add class…" in class dropdowns to race officers and above (not the entry kiosk). */
@Injectable({ providedIn: 'root' })
export class AddClassLauncher {
  private readonly dialog = inject(MatDialog);
  readonly canAdd = inject(AuthService).canAddClubClass;

  /** The name of the class added, or undefined if the dialog was cancelled. */
  async open(initialName?: string): Promise<string | undefined> {
    const ref = this.dialog.open<AddClassDialog, AddClassDialogData, BoatClass | undefined>(AddClassDialog, {
      data: { initialName },
      width: '440px',
      maxWidth: '95vw',
    });
    return (await firstValueFrom(ref.afterClosed()))?.name;
  }

  /**
   * When `control` is set to {@link ADD_CLASS_OPTION}, restores its previous value, opens
   * the dialog and selects the added class.
   */
  attach(control: AbstractControl<string>, initialName: () => string | undefined = () => undefined): Subscription {
    let previous = control.value;
    return control.valueChanges.subscribe(async value => {
      if (value !== ADD_CLASS_OPTION) {
        previous = value;
        return;
      }
      control.setValue(previous);
      const name = await this.open(initialName());
      if (name) {
        control.setValue(name);
        control.markAsDirty();
      }
    });
  }

  /** {@link attach}, unsubscribing when `destroyRef` is destroyed. */
  attachUntilDestroyed(
    control: AbstractControl<string>,
    destroyRef: DestroyRef,
    initialName?: () => string | undefined,
  ): void {
    const subscription = this.attach(control, initialName);
    destroyRef.onDestroy(() => subscription.unsubscribe());
  }
}
