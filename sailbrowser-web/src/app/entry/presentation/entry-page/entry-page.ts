import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from "@angular/material/icon";
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { Router } from '@angular/router';
import { Boat, boatFilter, BoatsStore } from 'app/boats';
import { ClubStore } from 'app/club-tenant';
import { Race } from 'app/race-calender';
import { CurrentRaces } from 'app/results-input';
import { BusyButton } from "app/shared/components/busy-button";
import { CenteredText } from "app/shared/components/centered-text";
import { Toolbar } from "app/shared/components/toolbar";
import { debounceTime, map, startWith } from 'rxjs';
import { EntryService } from '../../services/entry.service';
import { HANDICAP_SCHEMES, HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getHandicapValue, type Handicap } from 'app/scoring/model/handicap';
import {
  getHandicapSchemeMetadata,
  getSchemesForTarget,
  handicapControlName,
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
  styles: [`
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly _entryService = inject(EntryService);
  private readonly bs = inject(BoatsStore);
  protected readonly cs = inject(ClubStore);
  protected readonly currentRacesStore = inject(CurrentRaces);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);

  selectedBoat = signal<any>(null);
  isNewBoat = signal(false);

  busy = signal(false);

  showForm = computed(() => !!this.selectedBoat() || this.isNewBoat());
  readonly boatSchemes = computed(() =>
    getSchemesForTarget(this.cs.club().supportedHandicapSchemes, 'boat')
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
        const bc = this.cs.club().classes.find((c: any) => c.name === boat.boatClass);
        const patch: Record<string, unknown> = {
          boatClass: boat.boatClass,
          sailNumber: boat.sailNumber,
          helm: boat.helm,
          crew: boat.crew,
        };
        for (const scheme of this.boatSchemes()) {
          const meta = getHandicapSchemeMetadata(scheme);
          patch[handicapControlName(scheme)] = getHandicapValue(bc?.handicaps, scheme) ?? meta.defaultValue;
        }
        this.competitorDetailsGroup.patchValue(patch);

        this.competitorDetailsGroup.get('boatClass')?.disable();
        this.competitorDetailsGroup.get('sailNumber')?.disable();
        for (const scheme of this.boatSchemes()) {
          this.competitorDetailsGroup.get(handicapControlName(scheme))?.disable();
        }

        if (boat.isClub) {
          this.competitorDetailsGroup.get('helm')?.enable();
        } else {
          this.competitorDetailsGroup.get('helm')?.disable();
        }
      }
    });
  }

  readonly boatSearchControl = new FormControl('');

  private readonly searchTerm = toSignal(
    this.boatSearchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(150),
      map(value => (typeof value === 'string' ? value : ''))
    ), { initialValue: '' }
  );

  readonly filteredBoats = computed(() =>
    this.bs.boats().filter(boat => boatFilter(boat, this.searchTerm()))
  );

  todaysRaces = this.currentRacesStore.selectedRaces;

  readonly raceSelectionGroup = this.formBuilder.group({
    enteredRaces: [[] as Race[], Validators.required],
  });

  readonly competitorDetailsGroup: FormGroup = this.formBuilder.group({
    boatClass: ['', Validators.required],
    sailNumber: [null as number | null, Validators.required],
    helm: ['', Validators.required],
    crew: [''],
    saveBoat: [false],
  });

  private initialiseHandicapControls(): void {
    for (const scheme of HANDICAP_SCHEMES) {
      const meta = getHandicapSchemeMetadata(scheme);
      this.competitorDetailsGroup.addControl(
        handicapControlName(scheme),
        this.formBuilder.control<number | null>(meta.defaultValue, [Validators.min(meta.min), Validators.max(meta.max)])
      );
    }
  }

  displayBoatFn(boat: any): string {
    if (!boat) {
      return "";
    } else if (boat.isClub) {
      return `Club ${boat.boatClass}  ${boat.sailNumber}`;
    } else {
      return `${boat.boatClass}  ${boat.sailNumber}  (${boat.helm})`;
    }
  }

  onBoatSelected(event: MatAutocompleteSelectedEvent) {
    this.isNewBoat.set(false);
    this.selectedBoat.set(event.option.value);
  }

  createNewBoat() {
    this.selectedBoat.set(null);
    this.isNewBoat.set(true);
  }

  async onSubmit() {

    if (this.raceSelectionGroup.invalid || this.competitorDetailsGroup.invalid) return;

    const races = this.raceSelectionGroup.value.enteredRaces as Race[];
    const details = this.competitorDetailsGroup.getRawValue();

    if (this.isNewBoat() && details.saveBoat) {
      await this.saveNewBoat(details as Partial<Boat>)
    }

    const handicaps: Handicap[] = this.boatSchemes().map((scheme: HandicapScheme) => {
      const meta = getHandicapSchemeMetadata(scheme);
      const rawValue = details[handicapControlName(scheme) as keyof typeof details];
      const value = Number(rawValue ?? meta.defaultValue);
      return { scheme, value: Number.isFinite(value) && value > 0 ? value : meta.defaultValue };
    });

    const entryData = {
      races,
      boatClass: details.boatClass!,
      sailNumber: details.sailNumber!,
      helm: details.helm!,
      crew: details.crew || undefined,
      handicaps: handicaps.length > 0 ? handicaps : undefined,
    };

    if (this._entryService.isDuplicateEntry(entryData)) {
      this.snackbar.open("Duplicate entry for race", "Dismiss", { duration: 3000 });
      return;
    }

    try {
      this.busy.set(true);
      await this._entryService.enterRaces(entryData);
    } catch (error: any) {
      this.snackbar.open("Error encountered adding entries", "Dismiss", { duration: 3000 });
      console.log('EntryPage:  Error adding entries: ' + error.toString());
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

  async saveNewBoat(details: Partial<Boat>) {
    const newBoat = {
      boatClass: details.boatClass!,
      sailNumber: details.sailNumber!,
      helm: details.helm!,
      crew: details.crew || '',
      name: '',
      isClub: false,
    };

    try {
      this.busy.set(true);
      await this.bs.add(newBoat);
    } catch (error: any) {
      this.snackbar.open("Error encountered adding new boat", "Dismiss", { duration: 3000 });
      console.log('EntryPage.  Error adding new boat: ' + error.toString());
    } finally {
      this.busy.set(false);
    }
  }
}