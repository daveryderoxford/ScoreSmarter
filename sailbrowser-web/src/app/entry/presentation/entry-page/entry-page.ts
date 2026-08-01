import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Boat,
  boatFilter,
  BoatsStore,
  compareSailNumbers,
  normalizeSailNumber,
  sailNumbersEqual,
} from 'app/boats';
import { ClubStore } from 'app/club-tenant';
import { isSinglehanderClass } from 'app/club-tenant/model/boat-class';
import { Race, RaceCalendarStore } from 'app/race-calender';
import { RacesPanel } from 'app/race-calender/presentation/races-panel/races-panel';
import { CurrentRaces } from 'app/results-input';
import { type Handicap } from 'app/scoring/model/handicap';
import { handicapSchemesRequiredForRaces } from 'app/scoring/model/handicap-race-requirements';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { BusyButton } from 'app/shared/components/busy-button';
import { CenteredText } from 'app/shared/components/centered-text';
import { Toolbar } from 'app/shared/components/toolbar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import type { EntryConflictSummary } from 'app/shared/dialogs/entry-conflict-dialog';
import { groupBy } from 'app/shared/utils/group-by';
import { firstValueFrom, debounceTime, map, startWith } from 'rxjs';
import { resolveHandicapsForSeries } from '../../services/entry-helpers';
import { meetsPrimaryFleetEligibility } from '../../services/entry-helpers';
import { EntryConflict, EntryService } from '../../services/entry.service';
import { NewBoatDialog, type NewBoatDialogResult } from '../new-boat-dialog';
import { HelmNameAutocomplete } from 'app/boats/presentation/helm-name-autocomplete';
import { FIRESTORE_BULK_WRITE_TIMEOUT_MS, FIRESTORE_WRITE_TIMEOUT_MS, withTimeout } from 'app/shared/utils/with-timeout';

interface BoatAutocompleteGroup {
  readonly key: string;
  readonly boats: Boat[];
}

function boatGroupKey(boat: Boat, category: 'club' | 'member'): string {
  if (category === 'club') {
    return boat.boatClass ?? 'Unknown Class';
  }
  const helm = boat.helm?.trim();
  if (helm) return helm;
  return 'Unknown helm';
}

function sortBoatsInGroup(a: Boat, b: Boat): number {
  const classCmp = (a.boatClass ?? '').localeCompare(b.boatClass ?? '');
  if (classCmp !== 0) return classCmp;
  return compareSailNumbers(a.sailNumber, b.sailNumber);
}

@Component({
  selector: 'app-entry',
  imports: [
    MatStepperModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    HelmNameAutocomplete,
    MatButtonModule,
    MatAutocompleteModule,
    MatTabsModule,
    MatCardModule,
    Toolbar,
    MatIcon,
    BusyButton,
    CenteredText,
    RacesPanel
],
  templateUrl: 'entry-page.html',
  styles: [
    `
    @use "mixins" as mix;
    @use '@angular/material' as mat;

    @include mix.centered-column-page(".content", 480px);

    .form-card {
      padding: 15px 25px;
    }

    .race-selection-card app-races-panel {
      --races-panel-list-min-height: 336px;
      --races-panel-list-max-height: 336px;
      display: block;
    }

    .boat-details-panel {
      min-height: 180px;
      margin-top: 15px;
      margin-bottom: 8px;
      padding: 16px 20px;
      box-sizing: border-box;
    }

    .boat-details-instructions {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 148px;
      text-align: center;
      font: var(--mat-sys-body-large);
      gap: 0.35rem;
    }

    .boat-details-instructions p {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }

    .boat-summary {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      margin-bottom: 0.75rem;
    }

    .boat-summary-main {
      font-weight: 600;
      font-size: 1rem;
    }

    .boat-summary-sub {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .actions {
      margin-top: 10px;
      margin-right: 10px;
      margin-left: 10px;
      display: flex;
      gap: 12px;
    }
    .details-step-actions {
      align-items: center;
    }
    .details-step-actions .step-next {
      margin-left: auto;
    }
    .race-step-actions {
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
    }

    .more-races-btn {
      margin-left: 0;
    }

    .category-header {
      margin-bottom: 16px;
    }

    .category-tabs {
      width: 100%;
    }

    .category-tabs ::ng-deep .mat-mdc-tab-body-wrapper {
      display: none;
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
      margin-top: 0;
      margin-bottom: 16px;
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
      margin-top: 30px;
            margin-bottom: 30px;
    }
    .search-field {
      flex-grow: 1;
      font-size: 16px;
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
  private readonly dialogs = inject(DialogsService);

  boatCategory = signal<'club' | 'member'>('member');
  readonly categoryTabIndex = computed(() => (this.boatCategory() === 'member' ? 0 : 1));
  selectedBoat = signal<Boat | null>(null);
  busy = signal(false);

  showForm = computed(() => !!this.selectedBoat());

  readonly competitorDetailsGroup: FormGroup = this.formBuilder.group({
    helm: [''],
    crew: [''],
  });

  private readonly helmControl = this.competitorDetailsGroup.get('helm')!;
  private readonly crewControl = this.competitorDetailsGroup.get('crew')!;
  private readonly helmValue = toSignal(
    this.helmControl.valueChanges.pipe(startWith(this.helmControl.value)),
    { initialValue: this.helmControl.value }
  );
  private readonly crewValue = toSignal(
    this.crewControl.valueChanges.pipe(startWith(this.crewControl.value)),
    { initialValue: this.crewControl.value }
  );

  readonly canProceedToRaces = computed(() => {
    const boat = this.selectedBoat();
    if (!boat) return false;
    if (!boat.isClub) return true;
    return String(this.helmValue() ?? '').trim().length > 0;
  });

  readonly classHandicaps = computed<Handicap[]>(() => {
    const boat = this.selectedBoat();
    if (!boat) return [];
    return this.cs.club().classes.find(c => c.name === boat.boatClass)?.handicaps ?? [];
  });

  readonly isSinglehander = computed(() => {
    const boat = this.selectedBoat();
    if (!boat) return false;
    return isSinglehanderClass(boat.boatClass, this.cs.club().classes);
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
      ? String(this.helmValue() ?? '').trim()
      : String(boat.helm ?? '').trim();

    if (!helm) return undefined;

    const crewTrim = this.isSinglehander() ? '' : String(this.crewValue() ?? '').trim();
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
    return this.rc.allRaces().filter(race => {
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

  readonly enteredRaceIds = computed(() => (this.enteredRacesSig() ?? []).map(race => race.id));

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
    this.bs.boats().filter(boat => {
      const isClub = this.boatCategory() === 'club';
      if (boat.isClub !== isClub) return false;
      return boatFilter(boat, this.searchTerm());
    })
  );

  readonly filteredBoatsByHelm = computed((): BoatAutocompleteGroup[] => {
    const category = this.boatCategory();
    const grouped = groupBy(this.filteredBoats(), boat => boatGroupKey(boat, category));
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, boats]) => ({
        key,
        boats: [...boats].sort(sortBoatsInGroup),
      }));
  });

  private readonly scopedRaceId = this.route.snapshot.queryParamMap.get('raceId') ?? undefined;
  private readonly returnTo = this.route.snapshot.queryParamMap.get('returnTo');
  private readonly initialBoatClass = this.route.snapshot.queryParamMap.get('boatClass');
  private readonly initialSailNumber = this.route.snapshot.queryParamMap.get('sailNumber');
  private readonly scopedRacePreselected = signal(false);

  constructor() {
    effect(() => {
      // Clear selection when category changes
      this.boatCategory();
      this.selectedBoat.set(null);
      this.boatSearchControl.setValue('', { emitEvent: false });
    });

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

      this.crewControl.setValue(this.isSinglehander() ? '' : (boat.crew ?? ''), { emitEvent: false });
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
      if (this.scopedRacePreselected()) return;
      const scopedRace = this.eligibleRaces().find(r => r.id === scopedRaceId);
      if (!scopedRace) return;
      this.raceSelectionGroup.get('enteredRaces')?.setValue([scopedRace]);
      this.scopedRacePreselected.set(true);
    });

    // Replace temporary locally-selected new boat with the persisted store record once loaded.
    effect(() => {
      const classVal = this.initialBoatClass;
      const sailVal = normalizeSailNumber(this.initialSailNumber);
      if (classVal && sailVal && !this.selectedBoat()) {
        const boat = this.bs.boats().find(
          b => b.boatClass.toLowerCase() === classVal.toLowerCase() && sailNumbersEqual(b.sailNumber, sailVal),
        );
        if (boat) {
          this.selectedBoat.set(boat);
          this.boatSearchControl.setValue(boat, { emitEvent: false });
        } else {
          // If not found, at least set the search term to help them find it
          this.boatSearchControl.setValue(`${classVal} ${sailVal}`, { emitEvent: false });
        }
      }
    });

    effect(() => {
      const boat = this.selectedBoat();
      if (!boat || !boat.id.startsWith('new-')) return;
      const persisted = this.bs.boats().find(
        b => b.boatClass === boat.boatClass && sailNumbersEqual(b.sailNumber, boat.sailNumber) && b.helm === boat.helm
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
      return `${boat.boatClass} - ${boat.sailNumber} (Club)`;
    } else {
      return `${boat.helm} - ${boat.boatClass} ${boat.sailNumber}`;
    }
  }

  onBoatSelected(event: MatAutocompleteSelectedEvent) {
    this.selectedBoat.set(event.option.value as Boat);
  }

  onCategoryTabChange(index: number): void {
    this.boatCategory.set(index === 0 ? 'member' : 'club');
  }

  onEntryRaceIdsChange(ids: string[]): void {
    const eligibleById = new Map(this.eligibleRaces().map(race => [race.id, race]));
    const races = ids
      .map(id => eligibleById.get(id))
      .filter((race): race is Race => !!race);
    this.raceSelectionGroup.get('enteredRaces')?.setValue(races);
    for (const race of races) {
      this.currentRacesStore.addRaceId(race.id);
    }
  }

  async createNewBoat() {
    const dialogRef = this.dialog.open(NewBoatDialog, {
      width: '400px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      disableClose: true,
    });

    const created = await firstValueFrom(dialogRef.afterClosed()) as NewBoatDialogResult | undefined;
    if (!created) return;

    if (created.saveToRepository) {
      try {
        this.busy.set(true);
        await withTimeout(this.bs.add(created.boat), FIRESTORE_WRITE_TIMEOUT_MS, 'Saving boat');
      } catch (error: unknown) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Error encountered adding new boat';
        this.snackbar.open(message, 'Dismiss', { duration: 5000 });
        console.log('EntryPage. Error adding new boat: ' + String(error));
        return;
      } finally {
        this.busy.set(false);
      }

      const persisted = this.bs.boats().find(
        b =>
          b.boatClass === created.boat.boatClass &&
          sailNumbersEqual(b.sailNumber, created.boat.sailNumber) &&
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
      sailNumber: normalizeSailNumber(created.boat.sailNumber ?? ''),
      helm: created.boat.helm ?? '',
      crew: created.boat.crew ?? '',
      name: created.boat.name ?? '',
      isClub: false,
      handicaps: created.boat.handicaps,
      personalHandicapBand: created.boat.personalHandicapBand,
      tags: created.boat.tags ?? [],
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
      tags: selected.tags,
    };

    const conflicts = this._entryService.findEntryConflicts(entryData);
    if (conflicts.length > 0) {
      const choice = await this.dialogs.promptEntryConflict(
        conflicts.map(c => this.summariseConflict(c)),
      );
      if (choice === 'cancel') return;
    }

    try {
      this.busy.set(true);
      const write =
        conflicts.length > 0
          ? this._entryService.swapAndEnter(entryData, conflicts)
          : this._entryService.enterRaces(entryData);
      await withTimeout(write, FIRESTORE_BULK_WRITE_TIMEOUT_MS, 'Saving entry');
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Error encountered adding entries';
      this.snackbar.open(message, 'Dismiss', { duration: 5000 });
      console.log('EntryPage: Error adding entries: ' + String(error));
      return;
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

    if (this.returnTo === 'scanner') {
      this.router.navigate(['results-input', 'scan-scoring-sheet'], {
        queryParams: { raceId: this.scopedRaceId },
      });
      return;
    }

    this.router.navigate(['entry', 'entries']);
  }

  onCancel() {
    this.competitorDetailsGroup.markAsPristine();
    this.raceSelectionGroup.markAsPristine();

    if (this.returnTo === 'scanner') {
      this.router.navigate(['results-input', 'scan-scoring-sheet'], {
        queryParams: { raceId: this.scopedRaceId },
      });
    } else if (this.returnTo === 'results-input') {
      this.router.navigate(['results-input', 'manual'], {
        queryParams: { raceId: this.scopedRaceId },
      });
    } else {
      this.router.navigate(['entry', 'entries']);
    }
  }

  public canDeactivate(): boolean {
    return !this.raceSelectionGroup.dirty && !this.competitorDetailsGroup.dirty;
  }

  /**
   * Translate a service-level conflict into a UI-friendly summary the
   * dialog can render without needing to know about Race/SeriesEntry shapes.
   */
  private summariseConflict(c: EntryConflict): EntryConflictSummary {
    const e = c.existingEntry;
    const existingLabel = `${e.helm} – ${e.boatClass} #${e.sailNumber}`;
    const raceLabel = `${c.race.seriesName} race ${c.race.index}`;
    const reasonLabel = (() => {
      switch (c.reason) {
        case 'sameEntry':
          return 'Exact same boat is already entered.';
        case 'sameHelmDifferentHull':
          return 'This series merges by helm, so a sailor can only enter one boat per race.';
        case 'sameHullDifferentHelm':
          return 'This series merges by boat, so a hull can only be entered once per race.';
      }
    })();
    return { raceLabel, existingLabel, reasonLabel };
  }
}
