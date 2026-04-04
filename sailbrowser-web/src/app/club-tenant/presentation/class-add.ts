import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { ClubStore } from '../services/club-store';
import { ClassForm } from './class-form/class-form';
import { BoatClass } from '../model/boat-class';

@Component({
  selector: 'app-class-add',
  imports: [ClassForm, Toolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar title="Add Class" showBack/>
    <app-class-form (submitted)="submitted($event)" [busy]="busy()"></app-class-form>
  `,
  styles: [],
})
export class ClassAdd {
  private cs = inject(ClubStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);

  busy = signal(false);

  readonly form = viewChild.required(ClassForm);

  async submitted(data: Partial<BoatClass>) {
    try {
      this.busy.set(true);
      const id = data.name!.trim();
      
      if (this.cs.club().classes.some(c => c.id === id)) {
        this.snackbar.open(`Class with name '${id}' already exists`, "Dismiss", { duration: 3000 });
        return;
      }

      const newClass: BoatClass = {
        id,
        name: data.name!,
        handicaps: data.handicaps!,
      };
      await this.cs.addClass(newClass);
      this.router.navigate(["/club/classes"]);
    } catch (error: any) {
      this.snackbar.open("Error encountered adding class", "Dismiss", { duration: 3000 });
      console.log('ClassAdd. Error adding class: ' + error.toString());
    } finally {
      this.busy.set(false);
    }
  }

  canDeactivate(): boolean {
    return this.form().canDeactivate();
  }
}
