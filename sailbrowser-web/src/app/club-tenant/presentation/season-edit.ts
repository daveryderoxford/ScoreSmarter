import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { DeleteButton } from 'app/shared/components/delete-button';
import { DetailHeading } from 'app/shared/layout/detail-heading';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { ClubStore } from '../services/club-store';
import { SeasonForm } from './season-form/season-form';
import { Season } from 'app/race-calender/model/season';

/** Detail fragment inside `SeasonPage`. Do not wrap in `PageLayout`. */
@Component({
  selector: 'app-season-edit',
  imports: [SeasonForm, DetailHeading, DeleteButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (season(); as season) {
      <app-detail-heading>{{ season.name }}</app-detail-heading>
      @for (currentId of [id()]; track currentId) {
        <app-season-form [season]="season" (submitted)="submitted($event)" [busy]="busy()"></app-season-form>
      }
      <div class="delete-row">
        <app-delete-button [busy]="deleting()" (delete)="deleteSeason(season)">Delete season</app-delete-button>
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
export class SeasonEdit {
  private cs = inject(ClubStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);
  private ds = inject(DialogsService);

  id = input.required<string>();

  season = computed(() => this.cs.club().seasons.find(s => s.id === this.id()));

  busy = signal(false);
  deleting = signal(false);

  readonly form = viewChild(SeasonForm);

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

  async deleteSeason(season: Season) {
    if (!await this.ds.confirm('Delete season?', `${season.name} will be deleted.`, { confirm: 'Delete' })) return;
    try {
      this.deleting.set(true);
      await this.cs.removeSeason(season);
      this.form()?.form.markAsPristine();
      await this.router.navigate(['/club/seasons']);
      this.snackbar.open("Season deleted", "Dismiss", { duration: 3000 });
    } catch (error: unknown) {
      this.snackbar.open("Error deleting season", "Dismiss", { duration: 3000 });
      console.error('Error deleting season:', error);
    } finally {
      this.deleting.set(false);
    }
  }

  canDeactivate(): boolean {
    return this.form()?.canDeactivate() ?? true;
  }
}
