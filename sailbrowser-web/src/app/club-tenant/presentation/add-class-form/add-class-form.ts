import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import {
  getHandicapSchemeMetadata,
  getSchemesForTarget,
  handicapControlName,
} from 'app/scoring/model/handicap-scheme-metadata';
import { HandicapSchemeInputs } from 'app/shared/components/handicap-scheme-inputs';
import { SubmitButton } from 'app/shared/components/submit-button';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';
import type { BoatClass, ClassKind } from '../../model/boat-class';
import { isRyaClass, normaliseClassName, ryaPn, suggestCatalogClass, type CatalogClass } from '../../model/catalog-class';
import { ryaConfigurationLabel } from '../../model/club-class';
import { ClassCatalogueStore } from '../../services/class-catalogue-store';
import { ClubClassService } from '../../services/club-class.service';
import { ClubStore } from '../../services/club-store';

const MAX_OPTIONS = 30;

/**
 * Adds a class to the club list: an RYA class picked from the RYA list (which includes
 * the RYA's crew, spinnaker and age variants), or a local class for anything else.
 */
@Component({
  selector: 'app-add-class-form',
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    HandicapSchemeInputs,
    SubmitButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form (ngSubmit)="submit()" [formGroup]="form" novalidate>
      <mat-button-toggle-group class="kind" [value]="kind()" (change)="kind.set($event.value)" aria-label="Class type">
        <mat-button-toggle value="rya">RYA class</mat-button-toggle>
        <mat-button-toggle value="local">Local class</mat-button-toggle>
      </mat-button-toggle-group>

      @if (kind() === 'rya') {
        <mat-form-field>
          <mat-label>RYA class</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput formControlName="search" [matAutocomplete]="auto" placeholder="Class name or RYA number">
          <mat-autocomplete #auto="matAutocomplete" [displayWith]="displayEntry">
            @for (entry of options(); track entry.catalogueId) {
              <mat-option [value]="entry" [disabled]="inClub(entry)">
                <span class="option-name">{{ entry.name }}</span>
                <span class="option-detail">{{ entryDetail(entry) }}@if (inClub(entry)) { · in club }</span>
              </mat-option>
            }
          </mat-autocomplete>
          <mat-hint>Includes the RYA's crew, spinnaker and age variants</mat-hint>
        </mat-form-field>

        @if (selected(); as entry) {
          <div class="summary">
            <div class="summary-name">{{ entry.name }}</div>
            <div class="summary-detail">{{ entryDetail(entry) }}</div>
          </div>
          @if (selectedPn() !== undefined) {
            <mat-checkbox formControlName="overridePy">Override RYA PY ({{ selectedPn() }})</mat-checkbox>
          } @else {
            <p class="note">The RYA list has no PN for this class, so enter the club's PY.</p>
          }
        }
      } @else {
        <mat-form-field>
          <mat-label>Name</mat-label>
          <input matInput formControlName="name">
          <mat-error>Class name is required</mat-error>
        </mat-form-field>
        @if (localNameProblem(); as problem) {
          <p class="note warn">{{ problem }}</p>
        }
        <mat-checkbox formControlName="isSinglehander">Single-hander</mat-checkbox>
      }

      <app-handicap-scheme-inputs [form]="form" [schemes]="visibleSchemes()" />

      @if (error(); as message) {
        <p class="note warn" role="alert">{{ message }}</p>
      }

      <div class="button-row">
        <ng-content select="[formActions]" />
        <app-submit-button [disabled]="!canSubmit()" [busy]="busy()">Add class</app-submit-button>
      </div>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }
    form {
      display: flex;
      flex-direction: column;
    }
    .kind {
      align-self: flex-start;
      margin-bottom: 16px;
    }
    .option-name {
      display: block;
    }
    .option-detail,
    .summary-detail,
    .note {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .option-detail {
      display: block;
    }
    .summary {
      margin: 4px 0 12px;
    }
    .summary-name {
      font: var(--mat-sys-title-small);
    }
    .note {
      margin: 0 0 12px;
    }
    .warn {
      color: var(--mat-sys-error);
    }
    .button-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
    }
  `,
})
export class AddClassForm {
  private readonly clubStore = inject(ClubStore);
  private readonly catalogue = inject(ClassCatalogueStore);
  private readonly classService = inject(ClubClassService);

  /** Pre-fills the search and local name, e.g. with a class name the club doesn't have. */
  initialName = input('');
  added = output<BoatClass>();

  protected readonly kind = signal<ClassKind>('rya');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly classSchemes = computed(() =>
    getSchemesForTarget(this.clubStore.club().supportedHandicapSchemes, 'boatClass'),
  );

  readonly form = new FormGroup({
    search: new FormControl<string | CatalogClass>('', { nonNullable: true }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    isSinglehander: new FormControl(false, { nonNullable: true }),
    overridePy: new FormControl(false, { nonNullable: true }),
  }) as FormGroup;

  private readonly changes = toSignal(this.form.valueChanges, { initialValue: null });

  private readonly ryaEntries = computed(() => this.catalogue.classes().filter(isRyaClass));
  private readonly clubCatalogueIds = computed(
    () => new Set(this.clubStore.club().classes.map(c => c.catalogueId).filter(id => id !== undefined)),
  );

  protected readonly selected = computed(() => {
    this.changes();
    const value = this.form.controls['search'].value as string | CatalogClass;
    return typeof value === 'string' ? undefined : value;
  });
  protected readonly selectedPn = computed(() => ryaPn(this.selected()));

  protected readonly options = computed(() => {
    this.changes();
    const value = this.form.controls['search'].value as string | CatalogClass;
    const term = normaliseClassName(typeof value === 'string' ? value : value.name);
    const entries = this.ryaEntries();
    const matches = term
      ? entries.filter(c =>
          [c.name, c.rya?.name ?? '', String(c.catalogueId), ...(c.aliases ?? [])].some(v =>
            normaliseClassName(v).includes(term),
          ),
        )
      : entries;
    return matches.slice(0, MAX_OPTIONS);
  });

  protected readonly visibleSchemes = computed<HandicapScheme[]>(() => {
    this.changes();
    if (this.kind() === 'local') return this.classSchemes();
    if (!this.selected()) return [];
    const showPy = this.selectedPn() === undefined || this.form.controls['overridePy'].value === true;
    return this.classSchemes().filter(s => s !== 'PY' || showPy);
  });

  protected readonly localNameProblem = computed(() => {
    this.changes();
    const name = normaliseWhitespace(this.form.controls['name'].value as string);
    if (!name) return undefined;
    const key = name.toLowerCase();
    const existing = this.clubStore.club().classes.find(c => c.name.toLowerCase() === key);
    if (existing) return `The club already has a class called ${existing.name}.`;
    const rya = this.ryaEntries().find(c => normaliseClassName(c.name) === normaliseClassName(name));
    return rya ? `${rya.name} is in the RYA list; add it as an RYA class.` : undefined;
  });

  protected readonly canSubmit = computed(() => {
    this.changes();
    const handicapsValid = this.visibleSchemes().every(s => this.form.controls[handicapControlName(s)]?.valid);
    if (!handicapsValid || this.busy()) return false;
    if (this.kind() === 'rya') {
      const entry = this.selected();
      return !!entry && !this.inClub(entry);
    }
    return this.form.controls['name'].valid && !this.localNameProblem();
  });

  protected readonly displayEntry = (value: string | CatalogClass | null) =>
    typeof value === 'string' ? value : (value?.name ?? '');

  constructor() {
    for (const scheme of this.classSchemes()) {
      const meta = getHandicapSchemeMetadata(scheme);
      this.form.addControl(
        handicapControlName(scheme),
        new FormControl<number | null>(meta.defaultValue, {
          validators: [Validators.required, Validators.min(meta.min), Validators.max(meta.max)],
        }),
      );
    }

    effect(() => {
      const name = normaliseWhitespace(this.initialName());
      if (!name) return;
      untracked(() => {
        const match = suggestCatalogClass(name, this.ryaEntries());
        this.form.patchValue({ name, search: match && !this.inClub(match) ? match : name });
        if (!match) this.kind.set('local');
      });
    });

    // Start an override from the RYA PN.
    effect(() => {
      const pn = this.selectedPn();
      const py = this.form.controls[handicapControlName('PY')];
      if (pn !== undefined && py) untracked(() => py.setValue(pn));
    });
  }

  protected inClub(entry: CatalogClass): boolean {
    return this.clubCatalogueIds().has(entry.catalogueId);
  }

  protected entryDetail(entry: CatalogClass): string {
    const pn = ryaPn(entry);
    return `RYA ${entry.catalogueId} · ${ryaConfigurationLabel(entry)}${pn ? ` · PN ${pn}` : ''}`;
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    const handicaps = this.visibleSchemes().map(scheme => ({
      scheme,
      value: Number(this.form.controls[handicapControlName(scheme)].value),
    }));
    const entry = this.selected();
    const request =
      this.kind() === 'rya' && entry
        ? { kind: 'rya' as const, catalogueId: entry.catalogueId, handicaps }
        : {
            kind: 'local' as const,
            name: normaliseWhitespace(this.form.controls['name'].value as string),
            isSinglehander: this.form.controls['isSinglehander'].value === true,
            handicaps,
          };

    this.busy.set(true);
    this.error.set(null);
    try {
      const boatClass = await this.classService.add(request);
      this.form.markAsPristine();
      this.added.emit(boatClass);
    } catch (e: unknown) {
      console.error('Adding class failed', e);
      this.error.set(e instanceof Error && e.message ? e.message : 'The class could not be added.');
    } finally {
      this.busy.set(false);
    }
  }

  canDeactivate(): boolean {
    return !this.form.dirty;
  }
}
