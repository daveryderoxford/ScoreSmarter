import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatNativeDateModule, MatOption, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { Toolbar } from "app/shared/components/toolbar";
import { Router } from '@angular/router';
import { addDays, isAfter, startOfDay } from 'date-fns';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Race, RaceCalendarStore } from 'app/race-calender';

@Component({
  selector: 'app-add-race',
  templateUrl: 'add-race.html',
  providers: [provideNativeDateAdapter()],
  styles: [`
    @use "mixins" as mix;

    @include mix.centered-column-page(".content", 480px);

  .actions {
      margin-top: 5px;
      margin-right: 10px;
      display: flex;
      justify-content: end;
      gap: 12px;
    }

    mat-form-field, mat-checkbox, mat-radio-group {
      display: block;
      margin-bottom: 8px;
    }
    mat-radio-button {
      margin-right: 16px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatOption,
    MatSelectModule,
    Toolbar
  ],
})
export class RaceAdd {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly rcs = inject(RaceCalendarStore);
  private snackbar = inject(MatSnackBar);

  seriesId = input.required<string>(); // Route parameter

  private series = this.rcs.getSeries(this.seriesId);

  busy = signal(false);

  readonly isPrimaryLevelRatingSeries = computed(() =>
    this.series()?.primaryScoringConfiguration.type === 'LevelRating'
  );

  readonly derivedRaceTypeLabel = computed(() =>
    this.isPrimaryLevelRatingSeries()
      ? 'Level Rating'
      : (this.detailsForm.controls.isPursuit.value ? 'Pursuit' : 'Handicap')
  );

  detailsForm = this.fb.group({
    isPursuit: [false, Validators.required],
    isDiscardable: [true, Validators.required],
    isAverageLap: [true, Validators.required],
  });

  intervals: { name: string; increment: number; }[] = [
    { name: 'This date only', increment: 0 },
    { name: 'Consecutive days', increment: 1 },
    { name: 'Consecutive weeks', increment: 7 }
  ];

  schedForm = this.fb.group({
    firstRaceDate: [new Date(), Validators.required],
    firstStartTime: ['10:30:00', Validators.required],
    lastRaceDate: [new Date(), Validators.required],
    racesPerDay: [1, [Validators.required, Validators.min(1)]],
    repeatInterval: [this.intervals[0], Validators.required],
  });

  async onSave() {
    if (this.detailsForm.valid && this.schedForm.valid) {
      const schedData = this.schedForm.getRawValue();
      const details = this.detailsForm.getRawValue();
      const raceType: Race['type'] = this.isPrimaryLevelRatingSeries()
        ? 'Level Rating'
        : (details.isPursuit ? 'Pursuit' : 'Handicap');

      const firstRaceDate = schedData.firstRaceDate!;
      const lastRaceDate = schedData.repeatInterval!.increment
        ? schedData.lastRaceDate!
        : firstRaceDate;
      const firstStartTime = schedData.firstStartTime || '00:00:00';
      const firstStart = this.mergeDateAndTime(firstRaceDate, firstStartTime);

      const repeatIncrement = schedData.repeatInterval!.increment;
      const dayStarts: Date[] = [];
      let cursor = firstStart;
      const lastDay = startOfDay(lastRaceDate);

      while (!isAfter(startOfDay(cursor), lastDay)) {
        dayStarts.push(cursor);
        if (repeatIncrement === 0) break;
        cursor = addDays(cursor, repeatIncrement);
      }

      const races: Partial<Race>[] = [];

      for (const start of dayStarts) {
        for (let perDay = 0; perDay < schedData.racesPerDay!; perDay++) {
          const race: Partial<Race> = {
            type: raceType,
            isDiscardable: details.isDiscardable ?? true,
            isAverageLap: details.isAverageLap ?? true,
            scheduledStart: start
          };
          races.push(race);
        }
      }

      try {
        this.busy.set(true);
        const series = this.series()!;
        await this.rcs.addRaces({
          id: series.id,
          name: series.name,
          fleetId: series.primaryScoringConfiguration.fleet.id
        }, races);
      } catch (error: any) {
        this.snackbar.open("Error encountered adding races", "Dismiss", { duration: 3000 });
        console.log('AddRace: Error adding races ' + error.toString());
      } finally {
        this.busy.set(false);
      }

      this.detailsForm.reset();
      this.schedForm.reset();

      this.router.navigate(['/race-calender/series-details/', this.seriesId()]);
    }
  }

  canDeactivate = () => !this.detailsForm.dirty && !this.schedForm.dirty;

  private mergeDateAndTime(date: Date, hhmmss: string): Date {
    const [h, m, s] = hhmmss.split(':').map(v => Number(v || 0));
    const merged = new Date(date);
    merged.setHours(h || 0, m || 0, s || 0, 0);
    return merged;
  }

}
