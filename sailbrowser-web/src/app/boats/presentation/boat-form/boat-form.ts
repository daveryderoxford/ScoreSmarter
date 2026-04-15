
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { SubmitButton } from 'app/shared/components/submit-button';
import { Boat } from 'app/boats';
import { ClubStore } from 'app/club-tenant';
import { getHandicapValue, type Handicap } from 'app/scoring/model/handicap';
import { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import { HANDICAP_SCHEMES } from 'app/scoring/model/handicap-scheme';
import {
  getHandicapSchemeMetadata,
  getSchemesForTarget,
  handicapControlName,
  HANDICAP_SCHEME_METADATA,
} from 'app/scoring/model/handicap-scheme-metadata';
import { startWith } from 'rxjs';
import { BoatCoreFields } from './boat-core-fields';

@Component({
  selector: 'app-boat-form',
  templateUrl: './boat-form.html',
  styleUrl: 'boat-form.scss',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    SubmitButton,
    BoatCoreFields,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoatForm {

  cs = inject(ClubStore);

  boat = input<Boat | undefined>();
  busy = input<boolean>(false);
  mode = input<'full' | 'entryDialog'>('full');
  submitted = output<Partial<Boat>>();

  readonly boatLevelSchemes = computed(() =>
    getSchemesForTarget(this.cs.club().supportedHandicapSchemes, 'boat')
  );

  // Note: the handicap scheme controls are added dynamically, so we can't keep
  // a strict typed FormGroup<Partial<Boat>> definition here.
  form = new FormGroup({
    boatClass: new FormControl('', { validators: [Validators.required] }),
    sailNumber: new FormControl<number>(0, { validators: [Validators.required, Validators.min(0)] }),
    name: new FormControl(''),
    helm: new FormControl('', Validators.required),
    crew: new FormControl(''),
    isClub: new FormControl<boolean>(false),
    personalHandicapBand: new FormControl<PersonalHandicapBand | 'unknown'>('unknown'),
  }) as FormGroup<any>;

  constructor() {
    const suported = this.cs.club().supportedHandicapSchemes;
    for (const scheme of getSchemesForTarget(suported, 'boat')) {
      if (scheme === 'Personal') continue;
      const meta = getHandicapSchemeMetadata(scheme);
      this.form.addControl(
        handicapControlName(scheme),
        new FormControl<number | null>(meta.defaultValue, {
          validators: [Validators.required, Validators.min(meta.min), Validators.max(meta.max)],
        })
      );
    }

    effect(() => {
      const active = new Set(this.boatLevelSchemes());
      for (const scheme of HANDICAP_SCHEMES) {
        if (HANDICAP_SCHEME_METADATA[scheme].appliesTo !== 'boat') continue;
        const c = this.form.get(handicapControlName(scheme));
        if (!c) continue;
        const meta = getHandicapSchemeMetadata(scheme);
        if (!active.has(scheme)) {
          c.clearValidators();
          c.disable({ emitEvent: false });
        } else {
          c.enable({ emitEvent: false });
          c.setValidators([
            Validators.required,
            Validators.min(meta.min),
            Validators.max(meta.max),
          ]);
        }
        c.updateValueAndValidity({ emitEvent: false });
      }
    });

    effect(() => {
      if (this.boat()) {
        const b = this.boat()!;
        const patch: Record<string, unknown> = { ...b };
        patch['personalHandicapBand'] = b.personalHandicapBand ?? 'unknown';
        for (const scheme of HANDICAP_SCHEMES) {
          if (HANDICAP_SCHEME_METADATA[scheme].appliesTo !== 'boat') continue;
          const meta = getHandicapSchemeMetadata(scheme);
          patch[handicapControlName(scheme)] =
            getHandicapValue(b.handicaps, scheme) ?? meta.defaultValue;
        }
        this.form.patchValue(patch as object);
      }
    });

    this.form.controls['isClub'].valueChanges
      .pipe(startWith(this.form.controls['isClub'].value))
      .subscribe(isClub => this.applyClubBoatState(!!isClub));

    effect(() => {
      if (this.mode() !== 'entryDialog') {
        this.form.controls['isClub'].enable({ emitEvent: false });
        return;
      }
      // Entry dialog always creates private boats.
      this.form.controls['isClub'].setValue(false, { emitEvent: false });
      this.form.controls['isClub'].disable({ emitEvent: false });
      this.applyClubBoatState(false);
    });
  }

  submit() {
    const v = this.form.getRawValue() as Record<string, unknown>;
    const helm = ((v['helm'] as string | undefined) ?? '').trim();
    const boatHandicaps: Handicap[] = this.boatLevelSchemes().filter(s => s !== 'Personal').map(scheme => {
      const meta = getHandicapSchemeMetadata(scheme);
      const raw = v[handicapControlName(scheme)];
      const value = Number(raw ?? meta.defaultValue);
      return {
        scheme,
        value: Number.isFinite(value) && value > 0 ? value : meta.defaultValue,
      };
    });

    const output: Partial<Boat> = {
      boatClass: (v['boatClass'] as string) ?? '',
      sailNumber: Number(v['sailNumber']),
      name: (v['name'] as string) ?? '',
      helm: helm || '',
      crew: (v['crew'] as string) ?? '',
      isClub: !!v['isClub'],
      handicaps: boatHandicaps.length ? boatHandicaps : undefined,
      personalHandicapBand: v['personalHandicapBand'] === 'unknown'
        ? undefined
        : (v['personalHandicapBand'] as PersonalHandicapBand | undefined),
    };
    this.submitted.emit(output);
    this.form.reset();
  }

  public canDeactivate(): boolean {
    return !this.form.dirty;
  }

  private applyClubBoatState(isClub: boolean): void {
    const helmControl = this.form.controls['helm'];
    const crewControl = this.form.controls['crew'];

    if (isClub) {
      helmControl.setValue('', { emitEvent: false });
      crewControl.setValue('', { emitEvent: false });
      helmControl.clearValidators();
      helmControl.disable({ emitEvent: false });
      crewControl.disable({ emitEvent: false });
    } else {
      helmControl.setValidators([Validators.required]);
      helmControl.enable({ emitEvent: false });
      crewControl.enable({ emitEvent: false });
    }
    helmControl.updateValueAndValidity({ emitEvent: false });
    crewControl.updateValueAndValidity({ emitEvent: false });
  }
}
