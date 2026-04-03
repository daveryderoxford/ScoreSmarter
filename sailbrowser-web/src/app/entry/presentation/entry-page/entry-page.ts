import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { Router } from '@angular/router';
import { Boat, boatFilter, BoatsStore } from 'app/boats';
import { ClubStore } from 'app/club-tenant';
import { Race, RaceCalendarStore } from 'app/race-calender';
import { CurrentRaces } from 'app/results-input';
import {
  handicapSchemesRequiredForRaces,
  schemesRequiredAndSupportedByClub,
} from 'app/scoring/model/handicap-race-requirements';
import { BusyButton } from 'app/shared/components/busy-button';
import { CenteredText } from 'app/shared/components/centered-text';
import { Toolbar } from 'app/shared/components/toolbar';
import { debounceTime, map, startWith } from 'rxjs';
import { EntryService } from '../../services/entry.service';
import { HANDICAP_SCHEMES, HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getHandicapValue, type Handicap } from 'app/scoring/model/handicap';
import {
  getHandicapSchemeMetadata,
  getSchemesForTarget,
  handicapControlName,
  HANDICAP_SCHEME_METADATA,
} from 'app/scoring/model/handicap-scheme-metadata';
import { HandicapSchemeInputs } from 'app/shared/components/handicap-scheme-inputs';

@Component({
  selector: 'app-entry',
  imports: [
    MatStepperModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatListModule,
    DatePipe,
    MatAutocompleteModule,
    Toolbar,
    MatSelectModule,
    MatCheckboxModule,
    MatIcon,
    BusyButton,
    CenteredText,
    HandicapSchemeInputs,
  ],
  templateUrl: 'entry-page.html',
  styles: [
    `
    @use "mixins" as mix;

    @include mix.centered-column-page(".content", 480px);

    .actions {
      margin-top: 5px;
      margin-right: 10px;
      display: flex;
      justify-content: end;
      gap: 12px;
    }
    mat-form-field {
      display: block;
      margin-bottom: 8px;
    }
    .boat-selection {
      display: flex;
      align-items: baseline;
      gap: 5px;
      margin-top: 10px;
    }
    .search-field {
      flex-grow: 1;
      font-size: 15px;
    }
    .placeholder {
      padding: 15px;
      text-align: center;
      font: var(--mat-sys-body-large);
    }
    .class-row {
      display: flex;
      flex-direction: row;
      gap: 20px;
    }
    .save-boat-cb {
      display: block;
      margin-bottom: 15px;
    }
  `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly _entryService = inject(EntryService);
  private readonly bs = inject(BoatsStore);
  private readonly rc = inject(RaceCalendarStore);
  protected readonly cs = inject(ClubStore);
  protected readonly currentRacesStore = inject(CurrentRaces);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);

  selectedBoat = signal<Boat | null>(null);
  isNewBoat = signal(false);

  busy = signal(false);

  showForm = computed(() => !!this.selectedBoat() || this.isNewBoat());

  readonly raceSelectionGroup = this.formBuilder.group({
    enteredRaces: [[] as Race[], Validators.required],
  });

  readonly enteredRacesSig = toSignal(
    this.raceSelectionGroup.get('enteredRaces')!.valueChanges.pipe(
      startWith(this.raceSelectionGroup.get('enteredRaces')!.value as Race[])
    ),
    { initialValue: [] as Race[] }
  );

  readonly entryHandicapSchemes = computed(() => {
    const races = this.enteredRacesSig() ?? [];
    const required = handicapSchemesRequiredForRaces(races, this.rc.allSeries());
    return schemesRequiredAndSupportedByClub(required, this.cs.club().supportedHandicapSchemes);
  });

  readonly competitorDetailsGroup: FormGroup = this.formBuilder.group({
    boatClass: ['', Validators.required],
    sailNumber: [null as number | null, Validators.required],
    helm: ['', Validators.required],
    crew: [''],
    saveBoat: [false],
  });

  /** Reacts to class changes while entering a new boat (handicap effect reads this). */
  private readonly newEntryBoatClassSig = toSignal(
    this.competitorDetailsGroup.get('boatClass')!.valueChanges.pipe(
      startWith(this.competitorDetailsGroup.get('boatClass')!.value)
    ),
    { initialValue: '' }
  );

  constructor() {
    this.initialiseHandicapControls();

    effect(() => {
      const boat = this.selectedBoat();
      const isNew = this.isNewBoat();

      if (isNew) {
        this.competitorDetailsGroup.enable();
        this.competitorDetailsGroup.reset();
        this.boatSearchControl.setValue('');
      } else if (boat) {
        this.competitorDetailsGroup.patchValue({
          boatClass: boat.boatClass,
          sailNumber: boat.sailNumber,
          helm: boat.helm,
          crew: boat.crew,
        });

        this.competitorDetailsGroup.get('boatClass')?.disable();
        this.competitorDetailsGroup.get('sailNumber')?.disable();

        if (boat.isClub) {
          this.competitorDetailsGroup.get('helm')?.enable();
        } else {
          this.competitorDetailsGroup.get('helm')?.disable();
        }
      }
    });

    effect(() => {
      const boat = this.selectedBoat();
      const entrySchemes = new Set(this.entryHandicapSchemes());
      const club = this.cs.club();
      const rawClass = this.newEntryBoatClassSig();
      const classNameFromForm = typeof rawClass === 'string' ? rawClass : '';
      const classNameForHandicaps = boat?.boatClass ?? classNameFromForm;
      const bc = club.classes.find(x => x.name === classNameForHandicaps);

      for (const scheme of HANDICAP_SCHEMES) {
        const name = handicapControlName(scheme);
        const c = this.competitorDetailsGroup.get(name);
        if (!c) continue;
        const meta = getHandicapSchemeMetadata(scheme);
        const applies = HANDICAP_SCHEME_METADATA[scheme].appliesTo;

        if (!entrySchemes.has(scheme)) {
          c.clearValidators();
          c.disable({ emitEvent: false });
          c.updateValueAndValidity({ emitEvent: false });
          continue;
        }

        const fromClass = getHandicapValue(bc?.handicaps, scheme);
        const fromBoat = boat ? getHandicapValue(boat.handicaps, scheme) : undefined;

        if (applies === 'boatClass') {
          if (fromClass !== undefined) {
            c.patchValue(fromClass, { emitEvent: false });
            c.clearValidators();
            c.disable({ emitEvent: false });
          } else {
            c.patchValue(meta.defaultValue, { emitEvent: false });
            c.setValidators([Validators.required, Validators.min(meta.min), Validators.max(meta.max)]);
            c.enable({ emitEvent: false });
          }
          c.updateValueAndValidity({ emitEvent: false });
          continue;
        }

        // Boat-level schemes (IRC, Personal): lock if set on boat or on class
        const resolvedBoatScheme = fromBoat ?? fromClass;
        if (resolvedBoatScheme !== undefined) {
          c.patchValue(resolvedBoatScheme, { emitEvent: false });
          c.clearValidators();
          c.disable({ emitEvent: false });
        } else {
          c.patchValue(meta.defaultValue, { emitEvent: false });
          c.setValidators([Validators.required, Validators.min(meta.min), Validators.max(meta.max)]);
          c.enable({ emitEvent: false });
        }
        c.updateValueAndValidity({ emitEvent: false });
      }
    });
  }

  readonly boatSearchControl = new FormControl('');

  private readonly searchTerm = toSignal(
    this.boatSearchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(150),
      map(value => (typeof value === 'string' ? value : ''))
    ),
    { initialValue: '' }
  );

  readonly filteredBoats = computed(() =>
    this.bs.boats().filter(boat => boatFilter(boat, this.searchTerm()))
  );

  todaysRaces = this.currentRacesStore.selectedRaces;

  private initialiseHandicapControls(): void {
    for (const scheme of HANDICAP_SCHEMES) {
      const meta = getHandicapSchemeMetadata(scheme);
      this.competitorDetailsGroup.addControl(
        handicapControlName(scheme),
        this.formBuilder.control<number | null>(meta.defaultValue, [
          Validators.min(meta.min),
          Validators.max(meta.max),
        ])
      );
    }
  }

  displayBoatFn(boat: Boat | null): string {
    if (!boat) {
      return '';
    } else if (boat.isClub) {
      return `Club ${boat.boatClass}  ${boat.sailNumber}`;
    } else {
      return `${boat.boatClass}  ${boat.sailNumber}  (${boat.helm})`;
    }
  }

  onBoatSelected(event: MatAutocompleteSelectedEvent) {
    this.isNewBoat.set(false);
    this.selectedBoat.set(event.option.value as Boat);
  }

  createNewBoat() {
    this.selectedBoat.set(null);
    this.isNewBoat.set(true);
  }

  async onSubmit() {
    if (this.raceSelectionGroup.invalid || this.competitorDetailsGroup.invalid) return;

    const races = this.raceSelectionGroup.value.enteredRaces as Race[];
    const details = this.competitorDetailsGroup.getRawValue() as Record<string, unknown>;

    if (this.isNewBoat() && details['saveBoat']) {
      await this.saveNewBoat(details);
    }

    const active = this.entryHandicapSchemes();
    const handicaps: Handicap[] = active.map((scheme: HandicapScheme) => {
      const meta = getHandicapSchemeMetadata(scheme);
      const rawValue = details[handicapControlName(scheme)];
      const value = Number(rawValue ?? meta.defaultValue);
      return { scheme, value: Number.isFinite(value) && value > 0 ? value : meta.defaultValue };
    });

    const entryData = {
      races,
      boatClass: details['boatClass'] as string,
      sailNumber: details['sailNumber'] as number,
      helm: details['helm'] as string,
      crew: (details['crew'] as string) || undefined,
      handicaps: active.length > 0 ? handicaps : undefined,
    };

    if (this._entryService.isDuplicateEntry(entryData)) {
      this.snackbar.open('Duplicate entry for race', 'Dismiss', { duration: 3000 });
      return;
    }

    try {
      this.busy.set(true);
      await this._entryService.enterRaces(entryData);
    } catch (error: unknown) {
      this.snackbar.open('Error encountered adding entries', 'Dismiss', { duration: 3000 });
      console.log('EntryPage:  Error adding entries: ' + String(error));
    } finally {
      this.busy.set(false);
    }

    this.raceSelectionGroup.reset();
    this.competitorDetailsGroup.reset();
    this.selectedBoat.set(null);

    this.router.navigate(['entry', 'entries']);
  }

  public canDeactivate(): boolean {
    return !this.raceSelectionGroup.dirty && !this.competitorDetailsGroup.dirty;
  }

  async saveNewBoat(details: Record<string, unknown>) {
    const boatSchemes = getSchemesForTarget(this.cs.club().supportedHandicapSchemes, 'boat');
    const handicaps: Handicap[] = boatSchemes.map(scheme => {
      const meta = getHandicapSchemeMetadata(scheme);
      const value = Number(details[handicapControlName(scheme)] ?? meta.defaultValue);
      return {
        scheme,
        value: Number.isFinite(value) && value > 0 ? value : meta.defaultValue,
      };
    });

    const newBoat: Partial<Boat> = {
      boatClass: details['boatClass'] as string,
      sailNumber: details['sailNumber'] as number,
      helm: details['helm'] as string,
      crew: (details['crew'] as string) || '',
      name: '',
      isClub: false,
      handicaps: handicaps.length > 0 ? handicaps : undefined,
    };

    try {
      this.busy.set(true);
      await this.bs.add(newBoat);
    } catch (error: unknown) {
      this.snackbar.open('Error encountered adding new boat', 'Dismiss', { duration: 3000 });
      console.log('EntryPage.  Error adding new boat: ' + String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
