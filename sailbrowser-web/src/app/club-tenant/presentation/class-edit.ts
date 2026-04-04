import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { ClubStore } from '../services/club-store';
import { ClassForm } from './class-form/class-form';
import { BoatClass } from '../model/boat-class';

@Component({
  selector: 'app-class-edit',
  imports: [ClassForm, Toolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar [title]="'Edit Class - ' + boatClass()?.name" showBack/>
    <app-class-form [boatClass]="boatClass()" (submitted)="submitted($event)" [busy]="busy()"></app-class-form>
  `,
  styles: [],
})
export class ClassEdit {
  private cs = inject(ClubStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);

  id = input.required<string>();

  boatClass = computed(() => this.cs.club().classes.find(c => c.id === this.id()));

  busy = signal(false);

  readonly form = viewChild.required(ClassForm);

  async submitted(data: Partial<BoatClass>) {
    try {
      this.busy.set(true);
      const oldClass = this.boatClass();
      if (oldClass) {
        const newClass: BoatClass = {
          ...oldClass,
          name: data.name!,
        handicaps: data.handicaps!,
        };
        await this.cs.updateClass(oldClass, newClass);
        this.router.navigate(["/club/classes"]);
      }
    } catch (error: any) {
      this.snackbar.open("Error encountered updating class", "Dismiss", { duration: 3000 });
      console.log('ClassEdit. Error updating class: ' + error.toString());
    } finally {
      this.busy.set(false);
    }
  }

  canDeactivate(): boolean {
    return this.form().canDeactivate();
  }
}
