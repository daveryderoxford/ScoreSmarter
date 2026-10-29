import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { BoatForm } from './boat-form/boat-form';
import { BoatsStore } from '../services/boats.store';
import { DuplicateBoatCheck } from './duplicate-boat-check/duplicate-check-service';
import { Boat } from '../model/boat';
import { DeleteButton } from 'app/shared/components/delete-button';
import { DetailHeading } from 'app/shared/layout/detail-heading';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';

/** Detail fragment inside `BoatsPage`. Do not wrap in `PageLayout`. */
@Component({
  selector: 'app-boat-edit',
  imports: [BoatForm, DetailHeading, DeleteButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (boat(); as boat) {
      <app-detail-heading>{{ boat.boatClass }} {{ boat.sailNumber }}</app-detail-heading>
      @for (currentId of [id()]; track currentId) {
        <app-boat-form [boat]="boat" (submitted)="submitted($event)"></app-boat-form>
      }
      <div class="delete-row">
        <app-delete-button [busy]="deleting()" (delete)="deleteBoat(boat)">Delete boat</app-delete-button>
      </div>
    }
  `,
  styles: `
    .delete-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 24px;
    }
  `,
})
export class BoatEdit {
  private bs = inject(BoatsStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);
  private dupCheck = inject(DuplicateBoatCheck);
  private ds = inject(DialogsService);

  id = input.required<string>();   // Route parameter

  boat = computed(() => this.bs.boats().find(l => l.id === this.id()));

  busy = signal(false);
  deleting = signal(false);

  readonly form = viewChild(BoatForm);

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

  async deleteBoat(boat: Boat) {
    const label = `${boat.boatClass} ${boat.isClub ? `Club Boat ${boat.sailNumber}` : boat.sailNumber}`;
    if (!await this.ds.confirm('Delete boat?', `${label} will be deleted.`, { confirm: 'Delete' })) return;
    try {
      this.deleting.set(true);
      await this.bs.delete(boat.id);
      this.discardChanges();
      await this.router.navigate(['/boats']);
      this.snackbar.open("Boat deleted", "Dismiss", { duration: 3000 });
    } catch (error: unknown) {
      this.snackbar.open("Error deleting boat", "Dismiss", { duration: 3000 });
      console.error('Error deleting boat:', error);
    } finally {
      this.deleting.set(false);
    }
  }

  canDeactivate(): boolean {
    return this.form()?.canDeactivate() ?? true;
  }

  discardChanges(): void {
    this.form()?.discardChanges();
  }
}
