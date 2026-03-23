import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { FleetForm } from './fleet-form/fleet-form';
import { Toolbar } from 'app/shared/components/toolbar';
import { Fleet, getFleetName } from 'app/club-tenant/model/fleet';
import { ClubStore } from '../services/club-store';

@Component({
  selector: 'app-fleet-edit',
  standalone: true,
  imports: [FleetForm, Toolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
   <app-toolbar [title]="'Edit Fleet - ' + getFleetName(fleet())" showBack/>
    @if (fleet()) {
      <app-fleet-form [fleet]="fleet()" (submitted)="submitted($event)"></app-fleet-form>
    }
  `,
})
export class FleetEdit {
  private store = inject(ClubStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);

  id = input.required<string>();

  fleet = computed(() => this.store.club().fleets.find(f => f.id === this.id()));
  getFleetName = (f: Fleet | undefined) => f ? getFleetName(f) : '';

  busy = signal(false);

  readonly form = viewChild.required(FleetForm);

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

  canDeactivate(): boolean {
    return this.form().canDeactivate();
  }
}
