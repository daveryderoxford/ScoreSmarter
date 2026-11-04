import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { sailNumberValidator } from 'app/boats/model/sail-number';
import { isSinglehanderClass } from 'app/club-tenant/model/boat-class';
import { ClubStore } from 'app/club-tenant/services/club-store';
import type { Series } from 'app/race-calendar/model/series';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { startWith } from 'rxjs';
import { type EventEntryDetails, mapDivisionsByName } from '../services/event-entry.service';

export interface EventEntryDialogData {
  series: Series[];
  /** Edit an existing entry; omit to add one. */
  entry?: SeriesEntry;
  /** Moving to another series is only offered before racing starts. */
  canMove: boolean;
}

/** Add or edit one event entry. Choosing another series on edit moves the entry. */
@Component({
  selector: 'app-event-entry-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatAutocompleteModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.entry ? 'Edit entry' : 'Add entry' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field>
          <mat-label>Series</mat-label>
          <mat-select formControlName="seriesId">
            @for (s of data.series; track s.id) {
              <mat-option [value]="s.id">{{ s.name }}</mat-option>
            }
          </mat-select>
          @if (data.entry && !data.canMove) {
            <mat-hint>Racing has started. To change class, add a new entry in the other series.</mat-hint>
          } @else if (moving()) {
            <mat-hint>The entry moves to {{ selectedSeries()?.name }}</mat-hint>
          }
        </mat-form-field>

        <mat-form-field>
          <mat-label>Class</mat-label>
          <input matInput formControlName="boatClass" [matAutocomplete]="classAuto">
          <mat-autocomplete #classAuto="matAutocomplete">
            @for (name of classOptions(); track name) {
              <mat-option [value]="name">{{ name }}</mat-option>
            }
          </mat-autocomplete>
          <mat-error>Class required</mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Sail number</mat-label>
          <input matInput formControlName="sailNumber">
          <mat-error>Sail number required</mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Helm</mat-label>
          <input matInput formControlName="helm">
          <mat-error>Helm required</mat-error>
        </mat-form-field>

        @if (!singlehander()) {
          <mat-form-field>
            <mat-label>Crew</mat-label>
            <input matInput formControlName="crew">
          </mat-form-field>
        }

        <mat-form-field>
          <mat-label>Club</mat-label>
          <input matInput formControlName="club">
        </mat-form-field>

        <mat-form-field>
          <mat-label>Boat name</mat-label>
          <input matInput formControlName="boatName">
        </mat-form-field>

        @if (divisionOptions().length > 0) {
          <mat-form-field>
            <mat-label>Divisions</mat-label>
            <mat-select formControlName="divisions" multiple>
              @for (d of divisionOptions(); track d.id) {
                <mat-option [value]="d.id">{{ d.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="button" [disabled]="form.invalid" (click)="save()">
        {{ moving() ? 'Move entry' : 'Save' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form { display: flex; flex-direction: column; min-width: min(360px, 80vw); padding-top: 8px; }
  `,
})
export class EventEntryDialog {
  protected readonly data = inject<EventEntryDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<EventEntryDialog, EventEntryDetails | undefined>);
  private readonly clubStore = inject(ClubStore);

  readonly form = new FormGroup({
    seriesId: new FormControl(this.data.entry?.seriesId ?? this.data.series[0]?.id ?? '', { nonNullable: true, validators: [Validators.required] }),
    boatClass: new FormControl(this.data.entry?.boatClass ?? '', { nonNullable: true, validators: [Validators.required] }),
    sailNumber: new FormControl(String(this.data.entry?.sailNumber ?? ''), { nonNullable: true, validators: [Validators.required, sailNumberValidator] }),
    helm: new FormControl(this.data.entry?.helm ?? '', { nonNullable: true, validators: [Validators.required] }),
    crew: new FormControl(this.data.entry?.crew ?? '', { nonNullable: true }),
    club: new FormControl(this.data.entry?.club ?? '', { nonNullable: true }),
    boatName: new FormControl(this.data.entry?.boatName ?? '', { nonNullable: true }),
    divisions: new FormControl<string[]>([...(this.data.entry?.divisions ?? [])], { nonNullable: true }),
  });

  private readonly seriesId = toSignal(
    this.form.controls.seriesId.valueChanges.pipe(startWith(this.form.controls.seriesId.value)),
    { initialValue: this.form.controls.seriesId.value },
  );
  private readonly boatClass = toSignal(
    this.form.controls.boatClass.valueChanges.pipe(startWith(this.form.controls.boatClass.value)),
    { initialValue: this.form.controls.boatClass.value },
  );

  readonly selectedSeries = computed(() => this.data.series.find(s => s.id === this.seriesId()));
  readonly moving = computed(() => !!this.data.entry && this.seriesId() !== this.data.entry.seriesId);
  readonly divisionOptions = computed(() => this.selectedSeries()?.divisions ?? []);
  readonly singlehander = computed(() => isSinglehanderClass(this.boatClass().trim(), this.clubStore.club().classes));

  readonly classOptions = computed(() => {
    const term = this.boatClass().trim().toLowerCase();
    return this.clubStore.club().classes
      .map(c => c.name)
      .filter(name => !term || name.toLowerCase().includes(term))
      .slice(0, 20);
  });

  private lastSeriesId = this.form.controls.seriesId.value;

  constructor() {
    if (this.data.entry && !this.data.canMove) this.form.controls.seriesId.disable();
    this.applySeriesFleet(this.form.controls.seriesId.value, false);
    this.form.controls.seriesId.valueChanges.subscribe(id => this.applySeriesFleet(id, true));
  }

  /** A class series fixes the class; divisions carry over by name. */
  private applySeriesFleet(seriesId: string, changed: boolean): void {
    const series = this.data.series.find(s => s.id === seriesId);
    const fleet = series?.primaryScoringConfiguration.fleet;
    if (fleet?.type === 'BoatClass') {
      this.form.controls.boatClass.setValue(fleet.boatClassId);
      this.form.controls.boatClass.disable();
    } else {
      this.form.controls.boatClass.enable();
    }
    const previous = this.data.series.find(s => s.id === this.lastSeriesId);
    if (changed && series) {
      this.form.controls.divisions.setValue(
        previous ? mapDivisionsByName(this.form.controls.divisions.value, previous, series) : [],
      );
    }
    this.lastSeriesId = seriesId;
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.dialogRef.close({
      seriesId: v.seriesId,
      helm: v.helm.trim(),
      crew: this.singlehander() ? '' : v.crew.trim(),
      club: v.club.trim(),
      boatName: v.boatName.trim(),
      boatClass: v.boatClass.trim(),
      sailNumber: v.sailNumber.trim(),
      divisions: v.divisions,
    });
  }
}
