import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { BoatForm } from './boat-form/boat-form';
import { BoatsStore } from '../services/boats.store';
import { DuplicateBoatCheck } from './duplicate-boat-check/duplicate-check-service';
import { Boat } from '../model/boat';
import { DetailHeading } from 'app/shared/layout/detail-heading';

@Component({
  selector: 'app-boat-edit',
  imports: [BoatForm, DetailHeading],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-detail-heading>Edit Boat - {{ boat().boatClass }}  {{ boat().sailNumber }}</app-detail-heading>
    @for (currentId of [id()]; track currentId) {
      <app-boat-form [boat]="boat()" (submitted)="submitted($event)"></app-boat-form>
    }
  `,
})
export class BoatEdit {
  private bs = inject(BoatsStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);
  private dupCheck = inject(DuplicateBoatCheck);

  id = input.required<string>();   // Route parameter

  boat = computed(() => this.bs.boats().find(l => l.id === this.id())!);

  busy = signal(false);

  readonly form = viewChild.required(BoatForm);

  async submitted(data: Partial<Boat>) {
    try {
      this.busy.set(true);
      const save = await this.dupCheck.duplicateCheck(data, { excludeBoatId: this.id() });
      if (save) {
        await this.bs.update(this.id(), data);
        this.router.navigate(["/boats"]);
      }
    } catch (error: any) {
      this.snackbar.open("Error encountered updating boat details", "Dismiss", { duration: 3000 });
      console.log('UpdateBoat. Error updating boat details: ' + error.toString());
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
