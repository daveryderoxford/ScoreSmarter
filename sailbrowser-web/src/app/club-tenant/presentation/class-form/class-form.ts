import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule, type MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { SubmitButton } from 'app/shared/components/submit-button';
import { BoatClass } from '../../model/boat-class';
import {
  catalogClassLabel,
  catalogClassPrefill,
  normaliseClassName,
  suggestCatalogClass,
  type CatalogClass,
} from '../../model/catalog-class';
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

const MAX_CATALOGUE_OPTIONS = 30;

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

    .catalogue-hint {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: -8px 0 12px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
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
    MatAutocompleteModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
    SubmitButton,
    HandicapSchemeInputs,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassForm {
  protected readonly clubStore = inject(ClubStore);
  protected readonly catalogue = inject(ClassCatalogueStore);
  protected readonly catalogClassLabel = catalogClassLabel;

  boatClass = input<BoatClass | undefined>();

  busy = input<boolean>(false);
  submitted = output<Partial<BoatClass>>();

  form: FormGroup = new FormGroup({
    name: new FormControl('', { validators: [Validators.required] }),
    isSinglehander: new FormControl(false, { nonNullable: true }),
    catalogueId: new FormControl<number | null>(null),
  });

  /** Text typed in the catalogue search box. */
  protected readonly catalogueSearch = signal('');
  private readonly catalogueId = signal<number | null>(null);

  readonly classSchemes = computed(() =>
    getSchemesForTarget(this.clubStore.club().supportedHandicapSchemes, 'boatClass')
  );

  protected readonly linkedEntry = computed(() => {
    const id = this.catalogueId();
    return id === null ? undefined : this.catalogue.byId().get(id);
  });

  protected readonly catalogueOptions = computed(() => {
    const term = normaliseClassName(this.catalogueSearch());
    const classes = this.catalogue.classes();
    const matches = term
      ? classes.filter(c =>
          [c.name, c.rya?.name ?? '', String(c.catalogueId), ...(c.aliases ?? [])].some(v =>
            normaliseClassName(v).includes(term),
          ),
        )
      : classes;
    return matches.slice(0, MAX_CATALOGUE_OPTIONS);
  });

  /** A linked class whose name differs from its catalogue entry's ScoreSmarter name. */
  protected readonly catalogueNameDiffers = computed(() => {
    const entry = this.linkedEntry();
    return !!entry && this.nameValue() !== entry.name;
  });

  private readonly nameValue = signal('');

  /** For an unlinked existing class, a catalogue entry matching its name. */
  protected readonly suggestion = computed(() => {
    const bc = this.boatClass();
    if (!bc || this.catalogueId() !== null) return undefined;
    return suggestCatalogClass(bc.name, this.catalogue.classes());
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
      if (!bc) return;
      const patch: Record<string, unknown> = {
        name: bc.name,
        isSinglehander: bc.isSinglehander === true,
        catalogueId: bc.catalogueId ?? null,
      };
      for (const scheme of HANDICAP_SCHEMES) {
        const meta = getHandicapSchemeMetadata(scheme);
        patch[handicapControlName(scheme)] = getHandicapValue(bc.handicaps, scheme) ?? meta.defaultValue;
      }
      this.form.patchValue(patch);
      this.catalogueId.set(bc.catalogueId ?? null);
    });

    this.form.controls['name'].valueChanges.subscribe(v => this.nameValue.set(String(v ?? '')));

    // A linked class takes its name from the catalogue; only unlinked classes are named freely.
    effect(() => {
      const name = this.form.controls['name'];
      if (this.catalogueId() !== null) name.disable({ emitEvent: false });
      else name.enable({ emitEvent: false });
    });
  }

  protected onCatalogueSelected(event: MatAutocompleteSelectedEvent): void {
    const entry = this.catalogue.byId().get(event.option.value as number);
    if (entry) this.linkCatalogClass(entry);
  }

  /**
   * Links the class to a catalogue entry, which sets its name to the catalogue's
   * ScoreSmarter name (saving an existing class then renames it). Adding a class also
   * takes the single-hander flag and the RYA PN as the PY handicap.
   */
  protected linkCatalogClass(entry: CatalogClass): void {
    const prefill = catalogClassPrefill(entry);
    const patch: Record<string, unknown> = { catalogueId: prefill.catalogueId, name: prefill.name };
    if (!this.boatClass()) {
      patch['isSinglehander'] = prefill.isSinglehander;
      if (prefill.pyHandicap && this.classSchemes().includes('PY')) {
        patch[handicapControlName('PY')] = prefill.pyHandicap;
      }
    }
    this.form.patchValue(patch);
    this.form.markAsDirty();
    this.catalogueId.set(prefill.catalogueId);
    this.catalogueSearch.set('');
  }

  protected useCatalogueName(): void {
    const entry = this.linkedEntry();
    if (!entry) return;
    this.form.patchValue({ name: entry.name });
    this.form.markAsDirty();
  }

  protected unlinkCatalogClass(): void {
    this.form.patchValue({ catalogueId: null });
    this.form.markAsDirty();
    this.catalogueId.set(null);
  }

  submit() {
    const raw = this.form.getRawValue() as Record<string, number | string | boolean | null>;
    const handicaps = this.classSchemes().map((scheme: HandicapScheme) => {
      const meta = getHandicapSchemeMetadata(scheme);
      const value = Number(raw[handicapControlName(scheme)] ?? meta.defaultValue);
      return { scheme, value: Number.isFinite(value) && value > 0 ? value : meta.defaultValue };
    });
    const catalogueId = typeof raw['catalogueId'] === 'number' ? raw['catalogueId'] : undefined;
    const output: Partial<BoatClass> = {
      name: (raw['name'] as string) ?? '',
      handicaps,
      isSinglehander: raw['isSinglehander'] === true,
      catalogueId,
    };
    this.submitted.emit(output);
    // Keep values (the parent may cancel, e.g. a rename confirmation); clear dirty so leaving after save is allowed.
    this.form.markAsPristine();
  }

  public canDeactivate(): boolean {
    return !this.form.dirty;
  }
}
