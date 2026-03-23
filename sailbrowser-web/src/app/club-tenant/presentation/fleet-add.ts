import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { generateSecureID } from 'app/shared/firebase/firestore-helper';
import { Fleet, getFleetName } from '../model/fleet';
import { ClubStore } from '../services/club-store';
import { FleetForm } from './fleet-form/fleet-form';

@Component({
  selector: 'app-fleet-add',
  imports: [FleetForm, Toolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
   <app-toolbar title="Add Fleet" showBack/>
    <app-fleet-form (submitted)="submitted($event)" [busy]="busy()"/>
  `,
})
export class FleetAdd {
  private store = inject(ClubStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);

  busy = signal(false);

  readonly form = viewChild.required(FleetForm);

  async submitted(fleet: Partial<Fleet>) {
    const f = (fleet as Fleet);
    try {
      this.busy.set(true);

      // Create Id with 
      const id = generateSecureID( 100, getFleetName(f));

      const newFleet = { ...fleet, id } as Fleet;
      await this.store.addFleet(newFleet);
      this.router.navigate(["/club/fleets"]); 
    } catch (error: any) {
      this.snackbar.open("Error encountered adding Fleet", "Dismiss", { duration: 3000 });
      console.error('AddFleet: Error adding Fleet: ', error);
    } finally {
      this.busy.set(false);
    }
  }

  canDeactivate(): boolean {
    return this.form().canDeactivate();
  }
}
