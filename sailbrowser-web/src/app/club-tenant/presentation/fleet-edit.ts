import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { FleetForm } from './fleet-form/fleet-form';
import { Fleet, getFleetName } from 'app/club-tenant/model/fleet';
import { ClubStore } from '../services/club-store';
import { DeleteButton } from 'app/shared/components/delete-button';
import { DetailHeading } from 'app/shared/layout/detail-heading';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';

/** Detail fragment inside `FleetPage`. Do not wrap in `PageLayout`. */
@Component({
  selector: 'app-fleet-edit',
  standalone: true,
  imports: [FleetForm, DetailHeading, DeleteButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-detail-heading>{{ getFleetName(fleet()) }}</app-detail-heading>
    @for (currentId of [id()]; track currentId) {
      @if (fleet()) {
        <app-fleet-form [fleet]="fleet()" (submitted)="submitted($event)"></app-fleet-form>
      }
    }
    @if (fleet(); as fleet) {
      <div class="delete-row">
        <app-delete-button [busy]="deleting()" (delete)="deleteFleet(fleet)">Delete fleet</app-delete-button>
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
export class FleetEdit {
  private store = inject(ClubStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);
  private ds = inject(DialogsService);

  id = input.required<string>();

  fleet = computed(() => this.store.club().fleets.find(f => f.id === this.id()));
  getFleetName = (f: Fleet | undefined) => f ? getFleetName(f) : '';

  busy = signal(false);
  deleting = signal(false);

  readonly form = viewChild(FleetForm);

  async submitted(data: Partial<Fleet>) {
    try {
      this.busy.set(true);
      const currentFleet = this.fleet()!;
      if (!currentFleet) return;

      const update = { id: currentFleet.id, ...data  } as Fleet;
      await this.store.updateFleet(update);

      this.router.navigate(["/club/fleets"]);
    } catch (error: any) {
      this.snackbar.open("Error encountered updating fleet details", "Dismiss", { duration: 3000 });
      console.error('UpdateFleet. Error updating fleet details: ', error);
    } finally {
      this.busy.set(false);
    }
  }

  async deleteFleet(fleet: Fleet) {
    if (!await this.ds.confirm('Delete fleet?', `${getFleetName(fleet)} will be deleted.`, { confirm: 'Delete' })) return;
    try {
      this.deleting.set(true);
      await this.store.removeFleet(fleet);
      this.discardChanges();
      await this.router.navigate(['/club/fleets']);
      this.snackbar.open("Fleet deleted", "Dismiss", { duration: 3000 });
    } catch (error: unknown) {
      this.snackbar.open("Error deleting fleet", "Dismiss", { duration: 3000 });
      console.error('Error deleting fleet:', error);
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
