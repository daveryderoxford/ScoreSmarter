import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ClubStore } from 'app/club-tenant';
import { isSinglehanderClass } from 'app/club-tenant/model/boat-class';
import { ADD_CLASS_OPTION, AddClassLauncher } from 'app/club-tenant/presentation/add-class-dialog';
import { DivisionValuePicker } from 'app/club-tenant/presentation/divisions/division-value-picker';
import { normalizeSailNumber, sailNumberValidator } from 'app/boats/model/sail-number';
import { HelmNameAutocomplete } from 'app/boats/presentation/helm-name-autocomplete';
import { SailNumberInput } from 'app/boats/presentation/sail-number-input';
import { entryDivisionIds } from 'app/race-calendar/model/division';
import { Series } from 'app/race-calendar/model/series';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { Handicap } from 'app/scoring/model/handicap';
import { handicapSchemesRequiredForSeries } from 'app/scoring/model/handicap-race-requirements';
import { handicapControlName } from 'app/scoring/model/handicap-scheme-metadata';
import {
  PERSONAL_HANDICAP_BANDS,
  type PersonalHandicapBand,
} from 'app/scoring/model/personal-handicap';
import { HandicapSchemeInputs } from 'app/shared/components/handicap-scheme-inputs';
import { SubmitButton } from 'app/shared/components/submit-button';
import { EntryEditCommand } from '../../services/race-competitor-edit.service';

type PersonalBandFormValue = 'unknown' | PersonalHandicapBand;

@Component({
  selector: 'app-entry-edit-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    SailNumberInput,
    HelmNameAutocomplete,
    DivisionValuePicker,
    HandicapSchemeInputs,
    SubmitButton,
  ],
  templateUrl: './entry-edit-form.html',
  styleUrls: ['../_competitor-edit-form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryEditForm implements OnInit {
  readonly competitor = input.required<ResolvedRaceCompetitor>();
  readonly series = input.required<Series>();
  /** Last submitted values, restored when returning from the scope step. */
  readonly initialCommand = input<EntryEditCommand | undefined>();
  readonly busy = input(false);

  readonly submitCommand = output<EntryEditCommand>();
  readonly cancelled = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly clubStore = inject(ClubStore);
  protected readonly addClass = inject(AddClassLauncher);
  protected readonly addClassOption = ADD_CLASS_OPTION;

  readonly personalBands = PERSONAL_HANDICAP_BANDS;

  private readonly boatClassValue = signal('');

  readonly form = this.fb.group({
    helm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    boatClass: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    sailNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, sailNumberValidator],
    }),
    crew: new FormControl('', { nonNullable: true }),
    club: new FormControl('', { nonNullable: true }),
    boatName: new FormControl('', { nonNullable: true }),
    personalHandicapBand: new FormControl<PersonalBandFormValue>('unknown', { nonNullable: true }),
    divisions: new FormControl<string[]>([], { nonNullable: true }),
    handicaps: this.fb.group({}),
  });

  get handicapsGroup(): FormGroup {
    return this.form.controls.handicaps as FormGroup;
  }

  readonly availableDivisions = computed(() => this.series().divisions ?? []);

  readonly editableHandicapSchemes = computed(() =>
    handicapSchemesRequiredForSeries(this.series()).filter(
      s => s !== 'Personal' && s !== 'Level Rating',
    ),
  );

  readonly supportsPersonalBand = computed(() =>
    handicapSchemesRequiredForSeries(this.series()).includes('Personal'),
  );

  readonly isSinglehander = computed(() =>
    isSinglehanderClass(this.boatClassValue() || this.competitor().boatClass, this.clubStore.club().classes),
  );

  readonly classChanged = computed(
    () => !sameText(this.boatClassValue(), this.competitor().boatClass),
  );

  readonly hasCrewOverride = computed(() => this.competitor().crewOverride !== undefined);

  readonly classOptions = computed(() => {
    const clubNames = this.clubStore.club().classes.map(c => c.name);
    const current = this.boatClassValue().trim() || this.competitor().boatClass.trim();
    if (current && !clubNames.some(n => sameText(n, current))) {
      return [...clubNames, current];
    }
    return clubNames;
  });

  readonly compareBoatClass = (a: string, b: string): boolean => sameText(a ?? '', b ?? '');

  constructor() {
    this.form.controls.boatClass.valueChanges.subscribe(v => this.boatClassValue.set(v ?? ''));
    this.addClass.attachUntilDestroyed(this.form.controls.boatClass, inject(DestroyRef), () => {
      const entered = this.competitor().boatClass.trim();
      const known = this.clubStore.club().classes.some(c => sameText(c.name, entered));
      return known ? undefined : entered;
    });
  }

  ngOnInit(): void {
    const c = this.competitor();
    for (const scheme of this.editableHandicapSchemes()) {
      this.handicapsGroup.addControl(handicapControlName(scheme), new FormControl<number | null>(null));
    }

    const restored = this.initialCommand();
    const source = restored ?? {
      helm: c.helm,
      boatClass: c.boatClass,
      sailNumber: c.sailNumber,
      crew: c.entry.crew ?? '',
      club: c.club ?? '',
      boatName: c.boatName ?? '',
      personalHandicapBand: c.personalHandicapBand ?? null,
      divisions: entryDivisionIds(c.entry),
      handicaps: c.handicaps,
    };

    const boatClass = this.resolveBoatClassForSelect(source.boatClass);
    this.boatClassValue.set(boatClass);
    this.form.patchValue({
      helm: source.helm,
      boatClass,
      sailNumber: source.sailNumber,
      crew: this.isSinglehander() ? '' : (source.crew ?? ''),
      club: source.club,
      boatName: source.boatName,
      personalHandicapBand: source.personalHandicapBand ?? 'unknown',
      divisions: source.divisions,
    });

    const handicapPatch: Record<string, number> = {};
    for (const scheme of this.editableHandicapSchemes()) {
      const h = source.handicaps.find(x => x.scheme === scheme);
      if (h) handicapPatch[handicapControlName(scheme)] = h.value;
    }
    this.handicapsGroup.patchValue(handicapPatch);
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();

    const handicaps: Handicap[] = [];
    const handicapValues = v.handicaps as Record<string, number | null>;
    for (const scheme of this.editableHandicapSchemes()) {
      const value = handicapValues[handicapControlName(scheme)];
      if (value !== undefined && value !== null) handicaps.push({ scheme, value });
    }

    this.submitCommand.emit({
      competitorId: this.competitor().id,
      helm: v.helm,
      boatClass: v.boatClass,
      sailNumber: normalizeSailNumber(v.sailNumber),
      crew: this.isSinglehander() ? undefined : v.crew,
      club: v.club,
      boatName: v.boatName,
      personalHandicapBand: this.supportsPersonalBand()
        ? (v.personalHandicapBand === 'unknown' ? null : v.personalHandicapBand)
        : undefined,
      divisions: [...v.divisions],
      handicaps,
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  /** Align stored class name with a mat-option value (exact club name when possible). */
  private resolveBoatClassForSelect(stored: string): string {
    const trimmed = stored.trim();
    const match = this.clubStore.club().classes.find(c => sameText(c.name, trimmed));
    return match?.name ?? trimmed;
  }
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
