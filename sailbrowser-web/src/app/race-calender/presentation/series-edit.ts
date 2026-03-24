import { ChangeDetectionStrategy, Component, effect, inject, input, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { RaceCalendarStore } from '../services/full-race-calander';
import { Series } from '../model/series';
import { SeriesForm } from './series-form';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';

@Component({
  selector: 'app-series-edit',
  imports: [SeriesForm, Toolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar [title]="'Edit Series - ' + series()?.name" showBack/>
    @if (series()) {
      <app-series-form [series]="series()" [busy]="busy()" (save)="submitted($event)"></app-series-form>
    }
  `
})
export class SeriesEdit {
  private rcs = inject(RaceCalendarStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);
  private ds = inject(DialogsService);

  id = input.required<string>();

  busy = signal(false);

  series = this.rcs.getSeries(this.id);
  readonly form = viewChild(SeriesForm);

  async submitted(data: Partial<Series>) {
    try {
      this.busy.set(true);
      await this.rcs.updateSeries(this.id(), data);
    } catch (e) { 
      this.snackbar.open('Error updating Series', 'Dismiss', { duration: 3000 }); 
    } finally {
      this.busy.set(false);
    }
    this.router.navigate(['race-calender/series-details', this.id()]);
  }

  canDeactivate = () => this.form()?.canDeactivate() ?? true;
}
