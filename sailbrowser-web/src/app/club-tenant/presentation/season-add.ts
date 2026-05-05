import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { ClubStore } from '../services/club-store';
import { SeasonForm } from './season-form/season-form';
import { Season } from 'app/race-calender/model/season';

@Component({
  selector: 'app-season-add',
  imports: [SeasonForm, Toolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar title="Add Season" showBack/>
    <app-season-form (submitted)="submitted($event)" [busy]="busy()"></app-season-form>
  `,
  styles: [],
})
export class SeasonAdd {
  private cs = inject(ClubStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);

  busy = signal(false);

  readonly form = viewChild.required(SeasonForm);

  async submitted(data: Partial<Season>) {
    try {
      this.busy.set(true);
      const id = data.name!.trim();
      
      if (this.cs.club().seasons.some(s => s.id === id)) {
        this.snackbar.open(`Season with name '${id}' already exists`, "Dismiss", { duration: 3000 });
        return;
      }

      const newSeason: Season = {
        id,
        name: data.name!,
        status: data.status === 'archived' ? 'archived' : 'current',
      };
      await this.cs.addSeason(newSeason);
      this.router.navigate(["/club/seasons"]);
    } catch (error: any) {
      this.snackbar.open("Error encountered adding season", "Dismiss", { duration: 3000 });
      console.log('SeasonAdd. Error adding season: ' + error.toString());
    } finally {
      this.busy.set(false);
    }
  }

  canDeactivate(): boolean {
    return this.form().canDeactivate();
  }
}
