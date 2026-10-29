import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { SubmitButton } from 'app/shared/components/submit-button';
import { BoatClass } from '../../model/boat-class';
import { ryaPn } from '../../model/catalog-class';
import { classKind, ryaConfigurationLabel } from '../../model/club-class';
import { ClassCatalogueStore } from '../../services/class-catalogue-store';
import { getHandicapValue } from 'app/scoring/model/handicap';
import { HANDICAP_SCHEMES, HandicapScheme } from 'app/scoring/model/handicap-scheme';
import {
  getHandicapSchemeMetadata,
  getSchemesForTarget,
  handicapControlName,
} from 'app/scoring/model/handicap-scheme-metadata';
import { HandicapSchemeInputs } from 'app/shared/components/handicap-scheme-inputs';
import { ClubStore } from 'app/club-tenant';

/** Edits a club class. RYA classes take their name from the RYA list; local classes are named freely. */
@Component({
  selector: 'app-class-form',
  templateUrl: './class-form.html',
  styles: `
    :host {
      display: block;
    }

    form {
      display: flex;
      flex-direction: column;
    }

    .rya-detail {
      margin: 0 0 16px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .py-choice {
      display: flex;
      flex-direction: column;
      margin-bottom: 8px;
    }

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
    MatCheckboxModule,
    MatRadioModule,
    SubmitButton,
    HandicapSchemeInputs,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassForm {
  protected readonly clubStore = inject(ClubStore);
  private readonly catalogue = inject(ClassCatalogueStore);

  boatClass = input.required<BoatClass>();
  busy = input<boolean>(false);
  submitted = output<Partial<BoatClass>>();

  form: FormGroup = new FormGroup({
    name: new FormControl('', { validators: [Validators.required] }),
    isSinglehander: new FormControl(false, { nonNullable: true }),
    pyChoice: new FormControl<'rya' | 'override'>('rya', { nonNullable: true }),
  });

  private readonly changes = toSignal(this.form.valueChanges, { initialValue: null });

  readonly classSchemes = computed(() =>
    getSchemesForTarget(this.clubStore.club().supportedHandicapSchemes, 'boatClass')
  );

  protected readonly isRya = computed(() => classKind(this.boatClass()) === 'rya');

  protected readonly ryaEntry = computed(() => {
    const id = this.boatClass().catalogueId;
    return this.isRya() && id !== undefined ? this.catalogue.byId().get(id) : undefined;
  });

  protected readonly ryaPn = computed(() => ryaPn(this.ryaEntry()));

  protected readonly ryaDetail = computed(() => {
    const entry = this.ryaEntry();
    const id = this.boatClass().catalogueId;
    if (!entry) return `RYA ${id} · not in the current RYA list`;
    const pn = this.ryaPn();
    return `RYA ${id} · ${ryaConfigurationLabel(entry)} · ${pn ? `RYA PN ${pn}` : 'no RYA PN'}`;
  });

  /** Schemes with an input: PY is hidden while an RYA class uses the RYA PN. */
  protected readonly visibleSchemes = computed<HandicapScheme[]>(() => {
    this.changes();
    const usesRyaPy = this.isRya() && this.ryaPn() !== undefined && this.form.controls['pyChoice'].value === 'rya';
    return this.classSchemes().filter(s => s !== 'PY' || !usesRyaPy);
  });

  constructor() {
    const clubSchemes = this.clubStore.club().supportedHandicapSchemes;
    for (const scheme of getSchemesForTarget(clubSchemes, 'boatClass')) {
      const meta = getHandicapSchemeMetadata(scheme);
      this.form.addControl(
        handicapControlName(scheme),
        new FormControl<number | null>(meta.defaultValue, {
          validators: [Validators.required, Validators.min(meta.min), Validators.max(meta.max)],
        })
      );
    }

    effect(() => {
      const bc = this.boatClass();
      const patch: Record<string, unknown> = {
        name: bc.name,
        isSinglehander: bc.isSinglehander === true,
        pyChoice: bc.pyOverridden ? 'override' : 'rya',
      };
      for (const scheme of HANDICAP_SCHEMES) {
        const meta = getHandicapSchemeMetadata(scheme);
        patch[handicapControlName(scheme)] = getHandicapValue(bc.handicaps, scheme) ?? meta.defaultValue;
      }
      this.form.patchValue(patch);
      this.form.markAsPristine();
    });

    // RYA classes take their name and crew from the RYA list.
    effect(() => {
      for (const control of ['name', 'isSinglehander']) {
        if (this.isRya()) this.form.controls[control].disable({ emitEvent: false });
        else this.form.controls[control].enable({ emitEvent: false });
      }
    });
  }

  protected formInvalid(): boolean {
    this.changes();
    const handicapsValid = this.visibleSchemes().every(s => this.form.controls[handicapControlName(s)]?.valid);
    return !handicapsValid || (!this.isRya() && this.form.controls['name'].invalid);
  }

  submit() {
    const raw = this.form.getRawValue() as Record<string, number | string | boolean | null>;
    const pn = this.ryaPn();
    const usesRyaPy = this.isRya() && pn !== undefined && raw['pyChoice'] === 'rya';
    const handicaps = this.classSchemes().map((scheme: HandicapScheme) => {
      if (scheme === 'PY' && usesRyaPy) return { scheme, value: pn! };
      const meta = getHandicapSchemeMetadata(scheme);
      const value = Number(raw[handicapControlName(scheme)] ?? meta.defaultValue);
      return { scheme, value: Number.isFinite(value) && value > 0 ? value : meta.defaultValue };
    });
    const output: Partial<BoatClass> = this.isRya()
      ? { handicaps, pyOverridden: pn !== undefined && !usesRyaPy && getHandicapValue(handicaps, 'PY') !== pn }
      : { name: (raw['name'] as string) ?? '', handicaps, isSinglehander: raw['isSinglehander'] === true };
    this.submitted.emit(output);
    // Keep values (the parent may cancel, e.g. a rename confirmation); clear dirty so leaving after save is allowed.
    this.form.markAsPristine();
  }

  public canDeactivate(): boolean {
    return !this.form.dirty;
  }
}
