import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { DetailHeading } from 'app/shared/layout/detail-heading';
import { BoatClass } from '../model/boat-class';
import { AddClassForm } from './add-class-form/add-class-form';

/** Detail fragment inside `ClassPage`. Do not wrap in `PageLayout`. */
@Component({
  selector: 'app-class-add',
  imports: [AddClassForm, DetailHeading],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-detail-heading>Add Class</app-detail-heading>
    <app-add-class-form (added)="added($event)" />
  `,
})
export class ClassAdd {
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);

  readonly form = viewChild.required(AddClassForm);

  added(boatClass: BoatClass) {
    this.snackbar.open(`${boatClass.name} added`, 'Dismiss', { duration: 3000 });
    this.router.navigate(['/club/classes']);
  }

  canDeactivate(): boolean {
    return this.form().canDeactivate();
  }
}
