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
import { ActivatedRoute, Router } from '@angular/router';
import { Boat, boatFilter, BoatsStore } from 'app/boats';
import { ClubStore } from 'app/club-tenant';
import { Race, RaceCalendarStore, RacePickerDialog, type RacePickerDialogData } from 'app/race-calender';
import { CurrentRaces } from 'app/results-input';
import { type Handicap } from 'app/scoring/model/handicap';
import { handicapSchemesRequiredForRaces } from 'app/scoring/model/handicap-race-requirements';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { BusyButton } from 'app/shared/components/busy-button';
import { CenteredText } from 'app/shared/components/centered-text';
import { Toolbar } from 'app/shared/components/toolbar';
import { groupBy } from 'app/shared/utils/group-by';
import { firstValueFrom, debounceTime, map, startWith } from 'rxjs';
import { resolveHandicapsForSeries } from '../../services/entry-helpers';
import { meetsPrimaryFleetEligibility } from '../../services/entry-helpers';
import { EntryService } from '../../services/entry.service';
import { NewBoatDialog, type NewBoatDialogResult } from '../new-boat-dialog';

interface EntryRaceDayGroup {
  readonly dateKey: string;
  readonly heading: string;
  readonly races: Race[];
}

function sortRacesByTimeThenIndex(a: Race, b: Race): number {
  return a.scheduledStart.getTime() - b.scheduledStart.getTime() || a.index - b.index;
}

function raceEntryDayHeading(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

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
    .race-step-actions {
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
    }
    .race-step-actions-end {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .more-races-btn {
      margin-left: 0;
    }

    .race-day-heading {
      margin: 12px 0 4px;
      padding-inline: 16px;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant);
    }

    mat-selection-list .race-day-heading:first-child {
      margin-top: 10px;
    }

    .helm-crew-row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin: 5px 0;
    }

    .helm-crew-row mat-form-field {
      flex: 1;
      min-width: 0;
      margin-bottom: 0;
    }

    .handicap-line {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px 10px;
      margin-top: 10px;
      margin-bottom: 20px;
      font-size: 0.875rem;
      line-height: 1.35;
      color: var(--mat-sys-on-surface-variant);
    }
    .handicap-line-title {
      font-weight: 500;
      margin-right: 2px;
      color: var(--mat-sys-on-surface-variant);
    }
    .handicap-chip {
      color: var(--mat-sys-on-surface-variant);
      font-weight: 400;
    }
    .handicap-chip--empty {
      font-style: italic;
    }
    .boat-selection {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-top: 15px;
    }
    .search-field {
      flex-grow: 1;
      font-size: 16px;
    }
    .placeholder {
      padding: 15px;
      text-align: center;
      font: var(--mat-sys-body-large);
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
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  selectedBoat = signal<Boat | null>(null);
  busy = signal(false);

  showForm = computed(() => !!this.selectedBoat());

  readonly competitorDetailsGroup: FormGroup = this.formBuilder.group({
    helm: [''],
    crew: [''],
  });

  private readonly helmControl = this.competitorDetailsGroup.get('helm')!;
  private readonly crewControl = this.competitorDetailsGroup.get('crew')!;

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
      : String(boat.helm ?? '').trim();

    if (!helm) return undefined;

    const crewTrim = String(this.crewControl.value ?? '').trim();
    const crew = crewTrim || undefined;

    return {
      boatClassName: boat.boatClass,
      sailNumber: boat.sailNumber,
      helm,
      crew,
      handicaps: [...handicapByScheme.entries()].map(([scheme, value]) => ({ scheme, value })),
      personalHandicapBand: boat.personalHandicapBand,
      personalHandicapUnknown: !boat.personalHandicapBand,
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
    const scopedRaceId = this.scopedRaceId;
    return this.selectedRacesForEntry().filter(race => {
      if (scopedRaceId && race.id !== scopedRaceId) return false;
      const series = seriesById.get(race.seriesId);
      if (!series) return false;

      const handicaps = resolveHandicapsForSeries(
        series,
        {
          boatClassName: candidate.boatClassName,
          handicaps: candidate.handicaps,
          personalHandicapBand: candidate.personalHandicapBand,
          personalHandicapUnknown: candidate.personalHandicapUnknown,
        },
        this.cs.club().classes
      );
      return meetsPrimaryFleetEligibility(series, {
        boatClass: candidate.boatClassName,
        handicaps,
      });
    });
  });

  /** Eligible races grouped by calendar day (heading + ordered races). */
  readonly eligibleRacesByDay = computed((): EntryRaceDayGroup[] => {
    const races = [...this.eligibleRaces()].sort(sortRacesByTimeThenIndex);
    const byDay = groupBy(races, race => new Date(race.scheduledStart).toDateString());
    return [...byDay.entries()]
      .sort((a, b) => new Date(a[1][0].scheduledStart).getTime() - new Date(b[1][0].scheduledStart).getTime())
      .map(([dateKey, dayRaces]) => ({
        dateKey,
        heading: raceEntryDayHeading(dayRaces[0].scheduledStart),
        races: dayRaces,
      }));
  });

  raceEntryLineTitle(race: Race): string {
    return `${race.seriesName}. race ${race.index} / ${race.raceOfDay}`;
  }

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

  readonly selectedRacesForEntry = this.currentRacesStore.selectedRaces;
  private readonly scopedRaceId = this.route.snapshot.queryParamMap.get('raceId') ?? undefined;
  private readonly returnTo = this.route.snapshot.queryParamMap.get('returnTo');

  async openAddRacesDialog(): Promise<void> {
    const dialogRef = this.dialog.open<RacePickerDialog, RacePickerDialogData, string[] | undefined>(RacePickerDialog, {
      width: 'min(92vw, 440px)',
      maxHeight: '90vh',
      data: {
        title: 'Add races to enter',
        requireSelection: false,
      },
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result?.length) {
      return;
    }
    for (const id of result) {
      this.currentRacesStore.addRaceId(id);
    }
  }

  constructor() {
    if (this.scopedRaceId) {
      this.currentRacesStore.addRaceId(this.scopedRaceId);
    }

    effect(() => {
      const boat = this.selectedBoat();
      if (!boat) {
        this.helmControl.setValue('', { emitEvent: false });
        this.helmControl.clearValidators();
        this.helmControl.disable({ emitEvent: false });
        this.helmControl.updateValueAndValidity({ emitEvent: false });
        this.crewControl.setValue('', { emitEvent: false });
        this.crewControl.enable({ emitEvent: false });
        return;
      }

      this.crewControl.setValue(boat.crew ?? '', { emitEvent: false });
      this.crewControl.enable({ emitEvent: false });

      if (boat.isClub) {
        this.helmControl.enable({ emitEvent: false });
        this.helmControl.setValidators([Validators.required]);
        this.helmControl.setValue('', { emitEvent: false });
      } else {
        this.helmControl.setValue('', { emitEvent: false });
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

    effect(() => {
      const scopedRaceId = this.scopedRaceId;
      if (!scopedRaceId) return;
      const scopedRace = this.eligibleRaces().find(r => r.id === scopedRaceId);
      if (!scopedRace) return;
      const selected = this.enteredRacesSig() ?? [];
      if (selected.length === 1 && selected[0].id === scopedRaceId) return;
      this.raceSelectionGroup.get('enteredRaces')?.setValue([scopedRace]);
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
      return `Club ${boat.boatClass} Club Boat ${boat.sailNumber}`;
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
      personalHandicapBand: created.boat.personalHandicapBand,
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
      crew: candidate.crew,
      handicaps: active.size > 0 ? activeHandicaps : undefined,
      personalHandicapBand: candidate.personalHandicapBand,
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

    if (this.returnTo === 'results-input' && this.scopedRaceId) {
      this.router.navigate(['results-input', 'manual'], {
        queryParams: { raceId: this.scopedRaceId },
      });
      return;
    }

    this.router.navigate(['entry', 'entries']);
  }

  public canDeactivate(): boolean {
    return !this.raceSelectionGroup.dirty && !this.competitorDetailsGroup.dirty;
  }
}
