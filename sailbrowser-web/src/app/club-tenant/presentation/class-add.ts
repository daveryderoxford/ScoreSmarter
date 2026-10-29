import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { DetailHeading } from 'app/shared/layout/detail-heading';
import { ClubStore } from '../services/club-store';
import { ClassForm } from './class-form/class-form';
import { BoatClass } from '../model/boat-class';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';

/** Detail fragment inside `ClassPage`. Do not wrap in `PageLayout`. */
@Component({
  selector: 'app-class-add',
  imports: [ClassForm, DetailHeading],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-detail-heading>Add Class</app-detail-heading>
    <app-class-form (submitted)="submitted($event)" [busy]="busy()"></app-class-form>
  `,
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
      const id = normaliseWhitespace(data.name);
      
      if (this.cs.club().classes.some(c => c.id === id)) {
        this.snackbar.open(`Class with name '${id}' already exists`, "Dismiss", { duration: 3000 });
        return;
      }

      const newClass: BoatClass = {
        id,
        name: id,
        handicaps: data.handicaps!,
        isSinglehander: data.isSinglehander ?? false,
        ...(data.catalogueId !== undefined ? { catalogueId: data.catalogueId } : {}),
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
