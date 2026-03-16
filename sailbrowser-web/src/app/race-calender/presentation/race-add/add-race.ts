import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatNativeDateModule, MatOption, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { Toolbar } from "app/shared/components/toolbar";
import { Router } from '@angular/router';
import { addDays } from 'date-fns';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Race, RACE_TYPES, RaceCalendarStore } from 'app/race-calender';

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
    MatRadioModule,
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

  raceTypes = RACE_TYPES;

  detailsForm = this.fb.group({
    type: ['Handicap', Validators.required],
    isDiscardable: [true, Validators.required],
    isAverageLap: [true, Validators.required],
  });

  intervals: { name: string; increment: number; }[] = [
    { name: 'This date only', increment: 0 },
    { name: 'Consecutive days', increment: 1 },
    { name: 'Consecutive weeks', increment: 7 }
  ];

  schedForm = this.fb.group({
    scheduledStart: [new Date(), Validators.required],
    racesPerDay: [1, [Validators.required, Validators.min(0)]],
    repeatInterval: [this.intervals[0], Validators.required],
    repeatNumber: [1, [Validators.required, Validators.min(0)]],
  });

  async onSave() {
    if (this.detailsForm.valid && this.schedForm.valid) {
      const schedData = this.schedForm.getRawValue();
      const details = this.detailsForm.getRawValue() as Partial<Race>;

      let start = schedData.scheduledStart!;
      const races: Partial<Race>[] = [];

      for (let repeat = 0; repeat < schedData.repeatNumber!; repeat++) {
        for (let perDay = 0; perDay < schedData.racesPerDay!; perDay++) {
          const race: Partial<Race> = { ...details, scheduledStart: start };
          races.push(race);
        }
        start = addDays(start, schedData.repeatInterval!.increment);
      }

      try {
        this.busy.set(true);
        await this.rcs.addRaces(this.series()!, races);
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

}
