import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { SeriesForm } from './series-form';
import { RaceCalendarStore } from '../services/full-race-calander';
import { Series } from '../model/series';


@Component({
  selector: 'app-series-add',
  imports: [SeriesForm, Toolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar title="Add Series" showBack/>
    <app-series-form [busy]="busy()" (save)="submitted($event)"></app-series-form>
  `
})
export class SeriesAdd {
  private rcs = inject(RaceCalendarStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);
  readonly form = viewChild.required(SeriesForm);

  busy = signal(false);

  async submitted(series: Partial<Series>) {
    try {
      this.busy.set(true);
      await this.rcs.addSeries(series);
    } catch (error: any) {
      console.log('Add Series error ' + error.message);
      this.snackbar.open('Error adding Series', 'Close', { duration: 3000 });
    } finally  {
      this.busy.set(false);
    }
    this.router.navigate(['/race-calender']);
  }

  canDeactivate = () => this.form().canDeactivate();
}
