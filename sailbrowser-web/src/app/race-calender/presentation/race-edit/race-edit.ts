import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Toolbar } from "app/shared/components/toolbar";
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SubmitButton } from "app/shared/components/submit-button";
import { Race, RaceCalendarStore } from 'app/race-calender';

@Component({
  selector: 'app-race-edit',
  templateUrl: 'race-edit.html',
  styles: [`
    @use "mixins" as mix;
    @include mix.form-page("form", 350px);

    mat-form-field, mat-checkbox {
      display: block;
      margin-bottom: 16px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule,
    MatCheckboxModule, MatButtonModule, MatSelectModule, Toolbar, SubmitButton],
})
export class RaceEdit {
  private readonly fb = inject(FormBuilder);
  private rcs = inject(RaceCalendarStore);
  private readonly router = inject(Router);
  private snackbar = inject(MatSnackBar);

  raceId = input.required<string>();
  race = this.rcs.getRace(this.raceId);
  readonly series = computed(() => {
    const race = this.race();
    if (!race) return undefined;
    return this.rcs.allSeries().find(s => s.id === race.seriesId);
  });

  readonly isPrimaryLevelRatingSeries = computed(() =>
    this.series()?.primaryScoringConfiguration.type === 'LevelRating'
  );
  readonly derivedRaceTypeLabel = computed(() =>
    this.isPrimaryLevelRatingSeries()
      ? 'Level Rating'
      : (this.form.controls.isPursuit.value ? 'Pursuit' : 'Handicap')
  );

  busy = signal(false);

  form = this.fb.group({
    isPursuit: [false, Validators.required],
    isDiscardable: [true, Validators.required],
    isAverageLap: [true, Validators.required],
  });

  constructor() {
    effect(() => {
      const race = this.race();
      if (!race) return;
      this.form.patchValue({
        isPursuit: race.type === 'Pursuit',
        isDiscardable: race.isDiscardable,
        isAverageLap: race.isAverageLap,
      });
    });
  }

  async submit() {
    if (this.form.valid) {
      const race = this.race()!;
      const value = this.form.getRawValue();
      const type: Race['type'] = this.isPrimaryLevelRatingSeries()
        ? 'Level Rating'
        : (value.isPursuit ? 'Pursuit' : 'Handicap');
      const update: Partial<Race> = {
        type,
        isDiscardable: value.isDiscardable ?? true,
        isAverageLap: value.isAverageLap ?? true,
      };

      try {
        this.busy.set(true);
        await this.rcs.updateRace(race.id, update);
        this.form.reset();
        this.router.navigate(['/race-calender/series-details/', race.seriesId]);
      } catch (error: any) {
        this.snackbar.open("Error encountered adding races", "Dismiss", { duration: 3000 });
        console.log('AddRace: Error adding races ' + error.toString());
      } finally {
        this.busy.set(false);
      }
    }
  }

  canDeactivate = () => !this.form.dirty;

}
