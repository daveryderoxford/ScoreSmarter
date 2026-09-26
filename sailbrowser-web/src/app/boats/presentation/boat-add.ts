import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { BoatForm } from './boat-form/boat-form';
import { BoatsStore } from '../services/boats.store';
import { DuplicateBoatCheck } from './duplicate-boat-check/duplicate-check-service';
import { Boat } from '../model/boat';
import { DetailHeading } from 'app/shared/layout/detail-heading';

/** Detail fragment inside `BoatsPage`. Do not wrap in `PageLayout`. */
@Component({
  selector: 'app-boat-add',
  imports: [BoatForm, DetailHeading],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-detail-heading>Add Boat</app-detail-heading>
    <app-boat-form (submitted)="submitted($event)" [busy]="busy()"/>
  `,
})
export class BoatAdd {
  private bs = inject(BoatsStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);
  private dupCheck = inject(DuplicateBoatCheck);

  busy = signal(false);

  readonly form = viewChild.required(BoatForm);

  async submitted(boat: Partial<Boat>) {
    try {
      this.busy.set(true);

      const save = await this.dupCheck.duplicateCheck(boat);

      if (save) {
        await this.bs.add(boat);
        this.router.navigate(["/boats"]);
      }
    } catch (error: any) {
      this.snackbar.open("Error encountered adding Boat", "Dismiss", { duration: 3000 });
      console.log('AddBoat:  Error adding Boat: ' + error.toString());
    } finally {
      this.busy.set(false);
    }
  }

  canDeactivate(): boolean {
    return this.form().canDeactivate();
  }

  discardChanges(): void {
    this.form().discardChanges();
  }
}
