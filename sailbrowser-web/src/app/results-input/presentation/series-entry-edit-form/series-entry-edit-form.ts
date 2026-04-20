import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
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
import { ClubStore } from 'app/club-tenant';
import { Series } from 'app/race-calender/model/series';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { resolveHandicapsForSeries } from 'app/entry/services/entry-helpers';
import { handicapSchemesRequiredForSeries } from 'app/scoring/model/handicap-race-requirements';
import {
  PERSONAL_HANDICAP_BANDS,
  type PersonalHandicapBand,
} from 'app/scoring/model/personal-handicap';
import { SeriesEntryEditCommand } from '../../services/race-competitor-edit.service';
import { SubmitButton } from "../../../shared/components/submit-button";

/** Same sentinel as `BoatCoreFields` / new-boat dialog for "no band yet". */
type PersonalBandFormValue = 'unknown' | PersonalHandicapBand;

/**
 * Post-entry correction form for a single `ResolvedRaceCompetitor`.
 *
 * Crew is always saved for the current race only (`crewOverride`). Helm,
 * class, sail, and personal band (when the series uses Personal handicap)
 * update the `SeriesEntry` via `applyEdit`.
 *
 * Handicaps are read-only chips resolved from class + band via
 * `resolveHandicapsForSeries`.
 */
@Component({
  selector: 'app-series-entry-edit-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    SubmitButton
],
  templateUrl: './series-entry-edit-form.html',
  styleUrls: ['./series-entry-edit-form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesEntryEditForm implements OnInit {
  readonly competitor = input.required<ResolvedRaceCompetitor>();
  readonly series = input.required<Series>();

  readonly submitCommand = output<SeriesEntryEditCommand>();
  readonly cancelled = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly clubStore = inject(ClubStore);

  readonly personalBands = PERSONAL_HANDICAP_BANDS;

  readonly form = this.fb.group({
    helm: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    crew: new FormControl('', { nonNullable: true }),
    boatClass: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    sailNumber: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1), Validators.pattern(/^[0-9]+$/)],
    }),
    personalHandicapBand: new FormControl<PersonalBandFormValue>('unknown', {
      nonNullable: true,
    }),
  });

  private readonly boatClassValue = signal<string>('');
  /** `null` when the form is on "unknown" / no allocated band. */
  private readonly personalBandValue = signal<PersonalHandicapBand | null>(null);

  readonly clubClasses = computed(() => this.clubStore.club().classes);

  /** Same rule as `BoatCoreFields`: only show when the series scoring needs Personal. */
  readonly supportsPersonalBand = computed(() =>
    handicapSchemesRequiredForSeries(this.series()).includes('Personal'),
  );

  /**
   * Class options for the select. Matches `boat-form`'s simple mat-select
   * pattern; additionally, if the existing entry's boat class is no longer
   * in the club list (stale data from when the class was removed) we append
   * it so the control still shows the current value instead of silently
   * blanking it out.
   */
  readonly classOptions = computed(() => {
    const clubNames = this.clubClasses().map(c => c.name);
    const current = this.boatClassValue().trim();
    if (current && !clubNames.some(n => n.toLowerCase() === current.toLowerCase())) {
      return [...clubNames, current];
    }
    return clubNames;
  });

  /**
   * True when the selected class name exists in the club's class list. We
   * use this to decide whether handicap chips come from the club class
   * defaults or have fallen back to metadata defaults (stale class).
   */
  readonly isKnownClass = computed(() => {
    const name = this.boatClassValue().trim().toLowerCase();
    if (!name) return false;
    return this.clubClasses().some(c => c.name.toLowerCase() === name);
  });

  readonly previewHandicaps = computed(() => {
    const series = this.series();
    const boatClassName = this.boatClassValue().trim();
    if (!boatClassName) return [];
    const supports = this.supportsPersonalBand();
    const personalHandicapBand = supports
      ? (this.personalBandValue() ?? undefined)
      : (this.competitor().personalHandicapBand ?? undefined);
    const personalHandicapUnknown = supports
      ? this.personalBandValue() == null
      : !this.competitor().personalHandicapBand;
    const c = this.competitor();
    const classMatchesEntry =
      boatClassName.toLowerCase() === c.boatClass.trim().toLowerCase();
    // While the user has picked a different class than the saved entry, do
    // not treat the entry's handicaps as overrides — otherwise PY chips would
    // stay on the old number until save (same rule as `applyEdit`).
    return resolveHandicapsForSeries(
      series,
      {
        boatClassName,
        handicaps: classMatchesEntry ? c.handicaps : undefined,
        personalHandicapBand,
        personalHandicapUnknown,
      },
      this.clubClasses(),
    );
  });

  constructor() {
    this.form.controls.boatClass.valueChanges.subscribe(v =>
      this.boatClassValue.set(v ?? ''),
    );
    this.form.controls.personalHandicapBand.valueChanges.subscribe(v =>
      this.personalBandValue.set(v === 'unknown' ? null : v),
    );
  }

  ngOnInit(): void {
    const c = this.competitor();
    const bandForm: PersonalBandFormValue = c.personalHandicapBand ?? 'unknown';
    this.form.patchValue(
      {
        helm: c.helm,
        crew: c.crew ?? '',
        boatClass: c.boatClass,
        sailNumber: c.sailNumber,
        personalHandicapBand: bandForm,
      },
      { emitEvent: true },
    );
    this.boatClassValue.set(c.boatClass);
    this.personalBandValue.set(c.personalHandicapBand ?? null);
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const supports = this.supportsPersonalBand();
    const rawBand = v.personalHandicapBand;
    const personalHandicapBand = supports
      ? (rawBand === 'unknown' ? undefined : rawBand)
      : (this.competitor().personalHandicapBand ?? undefined);

    this.submitCommand.emit({
      competitorId: this.competitor().id,
      helm: v.helm,
      crew: v.crew,
      crewScope: 'raceOnly',
      boatClass: v.boatClass,
      sailNumber: Number(v.sailNumber),
      personalHandicapBand,
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
