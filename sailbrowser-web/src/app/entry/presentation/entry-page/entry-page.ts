import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { Router } from '@angular/router';
import { Boat, boatFilter, BoatsStore } from 'app/boats';
import { ClubStore } from 'app/club-tenant';
import { Race, RaceCalendarStore } from 'app/race-calender';
import { CurrentRaces } from 'app/results-input';
import { type Handicap } from 'app/scoring/model/handicap';
import { handicapSchemesRequiredForRaces } from 'app/scoring/model/handicap-race-requirements';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { BusyButton } from 'app/shared/components/busy-button';
import { CenteredText } from 'app/shared/components/centered-text';
import { Toolbar } from 'app/shared/components/toolbar';
import { firstValueFrom, debounceTime, map, startWith } from 'rxjs';
import { resolveHandicapsForSeries } from '../../services/entry-helpers';
import { meetsPrimaryFleetEligibility } from '../../services/entry-helpers';
import { EntryService } from '../../services/entry.service';
import { NewBoatDialog, type NewBoatDialogResult } from '../new-boat-dialog';

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
    MatIcon,
    BusyButton,
    CenteredText,
  ],
  templateUrl: 'entry-page.html',
  styles: [
    `
    @use "mixins" as mix;

    @include mix.centered-column-page(".content", 480px);

    .actions {
      margin-top: 10px;
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
      gap: 8px;
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
    .boat-panel {
      border: 1px solid var(--mat-sys-outline);
      border-radius: 10px;
      padding: 14px;
      margin: 10px 0;
      background: var(--mat-sys-surface-container-low);
      box-shadow: var(--mat-sys-level1);
    }
    .boat-panel h4 {
      margin: 0 0 8px 0;
      font: var(--mat-sys-title-medium);
    }
    .boat-table {
      display: grid;
      grid-template-columns: minmax(100px, 120px) 1fr;
      gap: 6px 12px;
      align-items: baseline;
      margin-bottom: 12px;
      font-size: 17px;
    }
    .boat-key {
      font-weight: 500;
    }
    .boat-value {
      overflow-wrap: anywhere;
    }
    .handicap-table {
      display: grid;
      grid-template-columns: minmax(100px, 120px) 1fr;
      gap: 6px 12px;
      font-size: 17px;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
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
  private readonly dialog = inject(MatDialog);

  selectedBoat = signal<Boat | null>(null);
  busy = signal(false);

  showForm = computed(() => !!this.selectedBoat());

  readonly competitorDetailsGroup: FormGroup = this.formBuilder.group({
    helm: [''],
  });

  private readonly helmControl = this.competitorDetailsGroup.get('helm')!;

  readonly canProceedToRaces = computed(() => {
    const boat = this.selectedBoat();
    if (!boat) return false;
    return boat.isClub ? this.helmControl.valid : true;
  });

  readonly classHandicaps = computed<Handicap[]>(() => {
    const boat = this.selectedBoat();
    if (!boat) return [];
    return this.cs.club().classes.find(c => c.name === boat.boatClass)?.handicaps ?? [];
  });

  readonly boatHandicaps = computed<Handicap[]>(() => this.selectedBoat()?.handicaps ?? []);
  readonly displayHandicaps = computed<Handicap[]>(() => {
    const byScheme = new Map<HandicapScheme, number>();
    for (const h of this.classHandicaps()) {
      if (h.value > 0) byScheme.set(h.scheme, h.value);
    }
    for (const h of this.boatHandicaps()) {
      if (h.value > 0) byScheme.set(h.scheme, h.value);
    }
    return [...byScheme.entries()].map(([scheme, value]) => ({ scheme, value }));
  });

  readonly candidateBoat = computed(() => {
    const boat = this.selectedBoat();
    if (!boat) return undefined;

    const handicapByScheme = new Map<HandicapScheme, number>();
    for (const h of this.classHandicaps()) {
      if (h.value > 0) handicapByScheme.set(h.scheme, h.value);
    }
    for (const h of this.boatHandicaps()) {
      if (h.value > 0) handicapByScheme.set(h.scheme, h.value);
    }

    const helm = boat.isClub
      ? String(this.helmControl.value ?? '').trim()
      : boat.helm;

    if (!helm) return undefined;

    return {
      boatClassName: boat.boatClass,
      sailNumber: boat.sailNumber,
      helm,
      crew: boat.crew,
      handicaps: [...handicapByScheme.entries()].map(([scheme, value]) => ({ scheme, value })),
      tags: [] as string[],
    };
  });

  readonly raceSelectionGroup = this.formBuilder.group({
    enteredRaces: [[] as Race[], Validators.required],
  });

  readonly enteredRacesSig = toSignal(
    this.raceSelectionGroup.get('enteredRaces')!.valueChanges.pipe(
      startWith(this.raceSelectionGroup.get('enteredRaces')!.value as Race[])
    ),
    { initialValue: [] as Race[] }
  );

  readonly eligibleRaces = computed(() => {
    const candidate = this.candidateBoat();
    if (!candidate) return [];
    const seriesById = new Map(this.rc.allSeries().map(s => [s.id, s]));
    return this.todaysRaces().filter(race => {
      const series = seriesById.get(race.seriesId);
      if (!series) return false;

      const handicaps = resolveHandicapsForSeries(
        series,
        { boatClassName: candidate.boatClassName, handicaps: candidate.handicaps },
        this.cs.club().classes
      );
      return meetsPrimaryFleetEligibility(series, {
        boatClass: candidate.boatClassName,
        handicaps,
      });
    });
  });

  readonly entryHandicapSchemes = computed(() => {
    const races = this.enteredRacesSig() ?? [];
    return handicapSchemesRequiredForRaces(races, this.rc.allSeries());
  });

  readonly boatSearchControl = new FormControl<string | Boat>('');

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

  constructor() {
    effect(() => {
      const boat = this.selectedBoat();
      if (!boat) {
        this.helmControl.setValue('', { emitEvent: false });
        this.helmControl.clearValidators();
        this.helmControl.disable({ emitEvent: false });
        this.helmControl.updateValueAndValidity({ emitEvent: false });
        return;
      }

      if (boat.isClub) {
        this.helmControl.enable({ emitEvent: false });
        this.helmControl.setValidators([Validators.required]);
        this.helmControl.setValue('', { emitEvent: false });
      } else {
        this.helmControl.setValue(boat.helm ?? '', { emitEvent: false });
        this.helmControl.clearValidators();
        this.helmControl.disable({ emitEvent: false });
      }
      this.helmControl.updateValueAndValidity({ emitEvent: false });
    });

    effect(() => {
      const allowed = new Set(this.eligibleRaces().map(r => r.id));
      const selected = this.enteredRacesSig() ?? [];
      const next = selected.filter(r => allowed.has(r.id));
      if (next.length !== selected.length) {
        this.raceSelectionGroup.get('enteredRaces')?.setValue(next);
      }
    });

    // Replace temporary locally-selected new boat with the persisted store record once loaded.
    effect(() => {
      const boat = this.selectedBoat();
      if (!boat || !boat.id.startsWith('new-')) return;
      const persisted = this.bs.boats().find(
        b => b.boatClass === boat.boatClass && b.sailNumber === boat.sailNumber && b.helm === boat.helm
      );
      if (!persisted) return;
      this.selectedBoat.set(persisted);
      this.boatSearchControl.setValue(persisted, { emitEvent: false });
    });
  }

  displayBoatFn(boat: Boat | string | null): string {
    if (!boat || typeof boat === 'string') {
      return typeof boat === 'string' ? boat : '';
    } else if (boat.isClub) {
      return `Club ${boat.boatClass} ${boat.sailNumber}`;
    } else {
      return `${boat.boatClass} ${boat.sailNumber} (${boat.helm})`;
    }
  }

  onBoatSelected(event: MatAutocompleteSelectedEvent) {
    this.selectedBoat.set(event.option.value as Boat);
  }

  async createNewBoat() {
    const dialogRef = this.dialog.open(NewBoatDialog, {
      width: '400px',
      disableClose: true,
    });

    const created = await firstValueFrom(dialogRef.afterClosed()) as NewBoatDialogResult | undefined;
    if (!created) return;

    if (created.saveToRepository) {
      try {
        this.busy.set(true);
        await this.bs.add(created.boat);
      } catch (error: unknown) {
        this.snackbar.open('Error encountered adding new boat', 'Dismiss', { duration: 3000 });
        console.log('EntryPage. Error adding new boat: ' + String(error));
        return;
      } finally {
        this.busy.set(false);
      }

      const persisted = this.bs.boats().find(
        b =>
          b.boatClass === created.boat.boatClass &&
          b.sailNumber === Number(created.boat.sailNumber ?? 0) &&
          b.helm === (created.boat.helm ?? '')
      );
      if (persisted) {
        this.selectedBoat.set(persisted);
        this.boatSearchControl.setValue(persisted, { emitEvent: false });
        return;
      }
    }

    const newBoat: Boat = {
      id: `new-${Date.now()}`,
      boatClass: created.boat.boatClass ?? '',
      sailNumber: Number(created.boat.sailNumber ?? 0),
      helm: created.boat.helm ?? '',
      crew: created.boat.crew ?? '',
      name: created.boat.name ?? '',
      isClub: false,
      handicaps: created.boat.handicaps,
    };
    this.selectedBoat.set(newBoat);
    this.boatSearchControl.setValue(newBoat, { emitEvent: false });
  }

  async onSubmit() {
    const selected = this.selectedBoat();
    const candidate = this.candidateBoat();
    if (!selected || !candidate || this.raceSelectionGroup.invalid) return;

    const races = this.raceSelectionGroup.value.enteredRaces as Race[];
    const active = new Set(this.entryHandicapSchemes());
    const activeHandicaps = candidate.handicaps.filter(h => active.has(h.scheme));

    const entryData = {
      races,
      boatClass: selected.boatClass,
      sailNumber: selected.sailNumber,
      helm: candidate.helm,
      crew: selected.crew || undefined,
      handicaps: active.size > 0 ? activeHandicaps : undefined,
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
      console.log('EntryPage: Error adding entries: ' + String(error));
    } finally {
      this.busy.set(false);
    }

    this.raceSelectionGroup.reset();
    this.competitorDetailsGroup.reset();
    this.selectedBoat.set(null);
    this.boatSearchControl.setValue('', { emitEvent: false });

    this.router.navigate(['entry', 'entries']);
  }

  public canDeactivate(): boolean {
    return !this.raceSelectionGroup.dirty && !this.competitorDetailsGroup.dirty;
  }
}
