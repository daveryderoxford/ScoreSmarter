import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SubmitButton } from 'app/shared/components/submit-button';
import { BoatClass } from '../../model/boat-class';
import { getHandicapValue } from 'app/scoring/model/handicap';
import { HANDICAP_SCHEMES, HandicapScheme } from 'app/scoring/model/handicap-scheme';
import {
  getHandicapSchemeMetadata,
  getSchemesForTarget,
  handicapControlName,
} from 'app/scoring/model/handicap-scheme-metadata';
import { HandicapSchemeInputs } from 'app/shared/components/handicap-scheme-inputs';
import { ClubStore } from 'app/club-tenant';

@Component({
  selector: 'app-class-form',
  templateUrl: './class-form.html',
  styles: `
    @use "mixins" as mix;

    @include mix.form-page("form", 350px);

    .button-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 16px;
    }
  `,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    SubmitButton,
    HandicapSchemeInputs,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassForm {
  protected readonly clubStore = inject(ClubStore);

  boatClass = input<BoatClass | undefined>();

  busy = input<boolean>(false);
  submitted = output<Partial<BoatClass>>();

  form: FormGroup = new FormGroup({
    name: new FormControl('', { validators: [Validators.required] }),
  });

  readonly classSchemes = computed(() =>
    getSchemesForTarget(this.clubStore.club().supportedHandicapSchemes, 'boatClass')
  );

  constructor() {
    for (const scheme of HANDICAP_SCHEMES) {
      const meta = getHandicapSchemeMetadata(scheme);
      this.form.addControl(
        handicapControlName(scheme),
        new FormControl<number>(meta.defaultValue, {
          validators: [Validators.required, Validators.min(meta.min), Validators.max(meta.max)],
        })
      );
    }

    effect(() => {
      const bc = this.boatClass();
      if (!bc) return;
      const patch: Record<string, unknown> = { name: bc.name };
      for (const scheme of HANDICAP_SCHEMES) {
        const meta = getHandicapSchemeMetadata(scheme);
        patch[handicapControlName(scheme)] = getHandicapValue(bc.handicaps, scheme) ?? meta.defaultValue;
      }
      this.form.patchValue(patch);
    });
  }

  submit() {
    const raw = this.form.getRawValue() as Record<string, number | string | null>;
    const handicaps = this.classSchemes().map((scheme: HandicapScheme) => {
      const meta = getHandicapSchemeMetadata(scheme);
      const value = Number(raw[handicapControlName(scheme)] ?? meta.defaultValue);
      return { scheme, value: Number.isFinite(value) && value > 0 ? value : meta.defaultValue };
    });
    const output: Partial<BoatClass> = {
      name: (raw['name'] as string) ?? '',
      handicaps,
    };
    this.submitted.emit(output);
    this.form.reset();
  }

  public canDeactivate(): boolean {
    return !this.form.dirty;
  }
}
