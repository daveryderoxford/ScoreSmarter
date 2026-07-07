import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
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
import { isSinglehanderClass } from 'app/club-tenant/model/boat-class';
import { HelmNameAutocomplete } from 'app/boats/presentation/helm-name-autocomplete';
import { TagValuePicker } from 'app/club-tenant/presentation/tags/tag-value-picker';
import { Series } from 'app/race-calender/model/series';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { Handicap } from 'app/scoring/model/handicap';
import { handicapSchemesRequiredForSeries } from 'app/scoring/model/handicap-race-requirements';
import { handicapControlName } from 'app/scoring/model/handicap-scheme-metadata';
import {
  PERSONAL_HANDICAP_BANDS,
  type PersonalHandicapBand,
} from 'app/scoring/model/personal-handicap';
import { SeriesTypoEditCommand } from '../../services/race-competitor-edit.service';
import { SubmitButton } from 'app/shared/components/submit-button';
import { HandicapSchemeInputs } from 'app/shared/components/handicap-scheme-inputs';

type PersonalBandFormValue = 'unknown' | PersonalHandicapBand;

@Component({
  selector: 'app-series-edit-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    SubmitButton,
    TagValuePicker,
    HandicapSchemeInputs,
    HelmNameAutocomplete,
  ],
  templateUrl: './series-edit-form.html',
  styleUrls: ['../_competitor-edit-form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesEditForm implements OnInit {
  readonly competitor = input.required<ResolvedRaceCompetitor>();
  readonly series = input.required<Series>();

  readonly submitCommand = output<SeriesTypoEditCommand>();
  readonly cancelled = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly clubStore = inject(ClubStore);

  readonly personalBands = PERSONAL_HANDICAP_BANDS;

  readonly availableTags = computed(() => this.clubStore.club().tagDefinitions);

  readonly editableHandicapSchemes = computed(() =>
    handicapSchemesRequiredForSeries(this.series()).filter(
      s => s !== 'Personal' && s !== 'Level Rating',
    ),
  );

  readonly supportsPersonalBand = computed(() =>
    handicapSchemesRequiredForSeries(this.series()).includes('Personal'),
  );

  readonly isSinglehander = computed(() =>
    isSinglehanderClass(this.competitor().entry.boatClass, this.clubStore.club().classes),
  );

  readonly form = this.fb.group({
    helm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    crew: new FormControl('', { nonNullable: true }),
    club: new FormControl('', { nonNullable: true }),
    personalHandicapBand: new FormControl<PersonalBandFormValue>('unknown', {
      nonNullable: true,
    }),
    tags: new FormControl<string[]>([], { nonNullable: true }),
    handicaps: this.fb.group({}),
  });

  get handicapsGroup(): import('@angular/forms').FormGroup {
    return this.form.controls.handicaps as import('@angular/forms').FormGroup;
  }

  ngOnInit(): void {
    const c = this.competitor();
    const schemes = this.editableHandicapSchemes();
    const handicapsGroup = this.form.controls.handicaps as import('@angular/forms').FormGroup;
    for (const scheme of schemes) {
      handicapsGroup.addControl(
        handicapControlName(scheme),
        new FormControl<number | null>(null),
      );
    }

    const bandForm: PersonalBandFormValue = c.personalHandicapBand ?? 'unknown';
    this.form.patchValue({
      helm: c.helm,
      crew: this.isSinglehander() ? '' : (c.entry.crew ?? ''),
      club: c.club ?? '',
      personalHandicapBand: bandForm,
      tags: c.entry.tags ?? [],
    });

    const patch: Record<string, number> = {};
    for (const scheme of schemes) {
      const h = c.handicaps.find(x => x.scheme === scheme);
      if (h) patch[handicapControlName(scheme)] = h.value;
    }
    handicapsGroup.patchValue(patch);
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const supports = this.supportsPersonalBand();
    const rawBand = v.personalHandicapBand;
    const personalHandicapBand = supports
      ? rawBand === 'unknown'
        ? null
        : rawBand
      : undefined;

    const handicaps: Handicap[] = [];
    const handicapsVal = v.handicaps as Record<string, number>;
    for (const scheme of this.editableHandicapSchemes()) {
      const val = handicapsVal[handicapControlName(scheme)];
      if (val !== undefined && val !== null) {
        handicaps.push({ scheme, value: val });
      }
    }

    this.submitCommand.emit({
      competitorId: this.competitor().id,
      helm: v.helm,
      crew: this.isSinglehander() ? undefined : (v.crew || undefined),
      club: v.club || undefined,
      personalHandicapBand: supports ? personalHandicapBand : undefined,
      tags: [...v.tags],
      handicaps,
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
