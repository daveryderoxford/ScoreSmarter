import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ClubStore } from 'app/club-tenant';
import { normalizeSailNumber, sailNumberValidator } from 'app/boats/model/sail-number';
import { HelmNameAutocomplete } from 'app/boats/presentation/helm-name-autocomplete';
import { SailNumberInput } from 'app/boats/presentation/sail-number-input';
import { seriesEntryMatchingStrategys } from 'app/entry/model/entry-grouping';
import { Series } from 'app/race-calender/model/series';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { ChangeEnteredCompetitorCommand } from '../../services/race-competitor-edit.service';
import { SubmitButton } from 'app/shared/components/submit-button';

@Component({
  selector: 'app-change-entered-competitor-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    SailNumberInput,
    HelmNameAutocomplete,
    SubmitButton,
  ],
  templateUrl: './change-entered-competitor-form.html',
  styleUrls: ['../_competitor-edit-form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangeEnteredCompetitorForm implements OnInit {
  readonly competitor = input.required<ResolvedRaceCompetitor>();
  readonly series = input.required<Series>();

  readonly submitCommand = output<ChangeEnteredCompetitorCommand>();
  readonly cancelled = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly clubStore = inject(ClubStore);

  private readonly boatClassValue = signal('');

  readonly form = this.fb.group({
    helm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    boatClass: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    sailNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, sailNumberValidator],
    }),
  });

  readonly mergeHint = computed(() => {
    const strategy = this.series().entryAlgorithm ?? 'classSailNumberHelm';
    return seriesEntryMatchingStrategys.find(s => s.name === strategy)?.hint ?? '';
  });

  readonly classOptions = computed(() => {
    const clubNames = this.clubStore.club().classes.map(c => c.name);
    const entryClass = this.competitor().boatClass.trim();
    const current = this.boatClassValue().trim() || entryClass;
    if (current && !clubNames.some(n => n.toLowerCase() === current.toLowerCase())) {
      return [...clubNames, current];
    }
    return clubNames;
  });

  /** Case-insensitive match so mat-select shows the existing class. */
  readonly compareBoatClass = (a: string, b: string): boolean =>
    (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

  constructor() {
    this.form.controls.boatClass.valueChanges.subscribe(v => {
      this.boatClassValue.set(v ?? '');
    });
  }

  ngOnInit(): void {
    const c = this.competitor();
    const boatClass = this.resolveBoatClassForSelect(c.boatClass);
    this.boatClassValue.set(boatClass);
    this.form.patchValue({
      helm: c.helm,
      boatClass,
      sailNumber: c.sailNumber,
    });
  }

  /** Align stored class name with a mat-option value (exact club name when possible). */
  private resolveBoatClassForSelect(stored: string): string {
    const trimmed = stored.trim();
    const match = this.clubStore.club().classes.find(
      c => c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    return match?.name ?? trimmed;
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.submitCommand.emit({
      competitorId: this.competitor().id,
      helm: v.helm,
      boatClass: v.boatClass,
      sailNumber: normalizeSailNumber(v.sailNumber),
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
