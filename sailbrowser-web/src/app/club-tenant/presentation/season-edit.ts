import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { DetailPane } from 'app/shared/layout/detail-pane';
import { PageLayout } from 'app/shared/layout/page-layout';
import { ClubStore } from '../services/club-store';
import { SeasonForm } from './season-form/season-form';
import { Season } from 'app/race-calender/model/season';

@Component({
  selector: 'app-season-edit',
  imports: [SeasonForm, Toolbar, PageLayout, DetailPane],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-layout>
      <app-toolbar [title]="'Edit Season - ' + season()?.name" showBack/>
      <app-detail-pane maxWidth="350px">
        <app-season-form [season]="season()" (submitted)="submitted($event)" [busy]="busy()"></app-season-form>
      </app-detail-pane>
    </app-page-layout>
  `,
  styles: [],
})
export class SeasonEdit {
  private cs = inject(ClubStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);

  id = input.required<string>();

  season = computed(() => this.cs.club().seasons.find(s => s.id === this.id()));

  busy = signal(false);

  readonly form = viewChild.required(SeasonForm);

  async submitted(data: Partial<Season>) {
    try {
      this.busy.set(true);
      const oldSeason = this.season();
      if (oldSeason) {
        const newSeason: Season = {
          ...oldSeason,
          name: data.name!,
          status: data.status === 'archived' ? 'archived' : 'current',
        };
        await this.cs.updateSeason(oldSeason, newSeason);
        this.router.navigate(["/club/seasons"]);
      }
    } catch (error: any) {
      this.snackbar.open("Error encountered updating season", "Dismiss", { duration: 3000 });
      console.log('SeasonEdit. Error updating season: ' + error.toString());
    } finally {
      this.busy.set(false);
    }
  }

  canDeactivate(): boolean {
    return this.form().canDeactivate();
  }
}
