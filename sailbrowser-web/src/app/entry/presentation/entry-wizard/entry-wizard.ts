import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule, MatSelectionListChange } from '@angular/material/list';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from 'app/auth/auth.service';
import {
  Boat,
  boatFilter,
  BoatsStore,
  compareSailNumbers,
  normalizeSailNumber,
  sailNumberValidator,
  sailNumbersEqual,
} from 'app/boats';
import { BoatCoreFields } from 'app/boats/presentation/boat-form/boat-core-fields';
import { ClubStore } from 'app/club-tenant';
import { RatingListStore } from 'app/system-data';
import { isSinglehanderClass } from 'app/club-tenant/model/boat-class';
import { Race, RaceCalendarStore } from 'app/race-calender';
import { DivisionValuePicker } from 'app/club-tenant/presentation/divisions/division-value-picker';
import { RacesPanel } from 'app/race-calender/presentation/races-panel/races-panel';
import {
  isScheduledToday,
  isWithinNextDays,
  type RacesPanelFilter,
  type RacesPanelPeriod,
} from 'app/race-calender/presentation/races-panel/races-panel-utils';
import { CurrentRaces } from 'app/results-input';
import { SeriesEntryStore } from 'app/results-input/services/series-entry-store';
import { prefillDivisionsFromExistingEntry, divisionCatalogForRaces } from '../../services/prefill-entry-divisions';
import { type Handicap } from 'app/scoring/model/handicap';
import { handicapSchemesRequiredForRaces } from 'app/scoring/model/handicap-race-requirements';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { type PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import {
  getHandicapSchemeMetadata,
  getSchemesForTarget,
  handicapControlName,
} from 'app/scoring/model/handicap-scheme-metadata';
import { BusyButton } from 'app/shared/components/busy-button';
import { CenteredText } from 'app/shared/components/centered-text';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import type { EntryConflictSummary } from 'app/shared/dialogs/entry-conflict-dialog';
import { groupBy } from 'app/shared/utils/group-by';
import { firstValueFrom, startWith } from 'rxjs';
import { resolveHandicapsForSeries, entryClubForCategory, meetsPrimaryFleetEligibility } from '../../services/entry-helpers';
import { trimBoatName, formatBoatOptionLabel } from 'app/boats/model/boat-display';
import { EntryConflict, EntryService } from '../../services/entry.service';
import { NewBoatDialog, type NewBoatDialogResult } from '../new-boat-dialog';
import { HelmNameAutocomplete } from 'app/boats/presentation/helm-name-autocomplete';
import { surnameOf } from 'app/boats/model/helm-name';
import { FIRESTORE_BULK_WRITE_TIMEOUT_MS, FIRESTORE_WRITE_TIMEOUT_MS, withTimeout } from 'app/shared/utils/with-timeout';
import { UserDataService } from 'app/user';

interface BoatListGroup {
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

export interface EntryWizardResult {
  readonly races: Race[];
}

/** Boat, helm/crew and race selection for a new entry. Hosted by the entry page and the entry dialog. */
@Component({
  selector: 'app-entry-wizard',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    HelmNameAutocomplete,
    MatButtonModule,
    MatAutocompleteModule,
    MatCardModule,
    MatListModule,
    MatIcon,
    BusyButton,
    CenteredText,
    DivisionValuePicker,
    RacesPanel,
    BoatCoreFields,
  ],
  templateUrl: './entry-wizard.html',
  styleUrl: './entry-wizard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryWizard {
  private readonly formBuilder = inject(FormBuilder);
  private readonly _entryService = inject(EntryService);
  private readonly bs = inject(BoatsStore);
  private readonly rc = inject(RaceCalendarStore);
  protected readonly cs = inject(ClubStore);
  private readonly ratingLists = inject(RatingListStore);
  protected readonly currentRacesStore = inject(CurrentRaces);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogs = inject(DialogsService);
  private readonly auth = inject(AuthService);
  private readonly seriesEntries = inject(SeriesEntryStore);
  private readonly userData = inject(UserDataService);

  protected readonly formatBoatOptionLabel = formatBoatOptionLabel;

  /** Race to pre-select on the race step. */
  readonly scopedRaceId = input<string>();
  readonly initialBoatClass = input<string>();
  readonly initialSailNumber = input<string>();
  /** Duty member's name when entering as Officer of the Day; the entry gets the OOD result code. */
  readonly oodHelm = input<string>();
  /** Seeds the boat search (or a visitor's sail number), e.g. text the race officer could not match. */
  readonly initialSearch = input<string>();

  readonly entered = output<EntryWizardResult>();

  protected readonly isOodEntry = computed(() => this.oodHelm() !== undefined);

  private readonly searchSeed = computed(() => {
    const oodHelm = this.oodHelm()?.trim();
    if (oodHelm) return surnameOf(oodHelm);
    return this.initialSearch()?.trim() ?? '';
  });

  private readonly scopedRacePreselected = signal(false);

  private readonly defaultStep = computed<'recent' | 'category' | 'details'>(() => {
    if (this.initialBoatClass() && this.initialSailNumber()) {
      return 'details';
    }
    if (this.isOodEntry()) {
      return 'details';
    }
    if (this.auth.isRaceOfficer() || !this.auth.loggedIn()) {
      return 'category';
    }
    const user = this.userData.user();
    if (!user || user.boats.length === 0) {
      return 'category';
    }
    return 'recent';
  });

  readonly step = linkedSignal<'recent' | 'category' | 'details' | 'races'>(() => this.defaultStep());
  readonly recentBoats = computed(() => this.userData.user()?.boats ?? []);
  readonly hasRecentBoats = computed(() => !this.auth.isRaceOfficer() && this.recentBoats().length > 0);
  private readonly startedFromRecent = signal(false);

  boatCategory = signal<'club' | 'member' | 'visitor'>('member');
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
    if (this.boatCategory() === 'visitor') {
      return this.visitorForm.valid;
    }
    const boat = this.selectedBoat();
    if (!boat) return false;
    if (!boat.isClub) return true;
    return String(this.helmValue() ?? '').trim().length > 0;
  });

  readonly visitorBoatSchemes = computed(() =>
    getSchemesForTarget(this.cs.club().supportedHandicapSchemes ?? [], 'boat'),
  );

  readonly visitorForm: FormGroup = this.formBuilder.group({
    boatClass: ['', Validators.required],
    sailNumber: ['', [Validators.required, sailNumberValidator]],
    name: [''],
    helm: ['', Validators.required],
    crew: [''],
    personalHandicapBand: ['unknown' as PersonalHandicapBand | 'unknown'],
    club: [''],
  });

  private readonly visitorBoatClassValue = toSignal(
    this.visitorForm.controls['boatClass'].valueChanges.pipe(
      startWith(this.visitorForm.controls['boatClass'].value),
    ),
    { initialValue: this.visitorForm.controls['boatClass'].value },
  );

  readonly visitorIsSinglehander = computed(() =>
    isSinglehanderClass(String(this.visitorBoatClassValue() ?? '').trim(), this.cs.club().classes),
  );

  readonly racePanelFilters = computed<readonly RacesPanelFilter[]>(() =>
    this.auth.isRaceOfficer() ? ['past', 'future', 'hideCompleted'] : ['future'],
  );

  readonly racePanelInitialPeriod = computed<RacesPanelPeriod>(() => {
    if (this.auth.isRaceOfficer()) return null;
    const now = new Date();
    const hasToday = this.eligibleRaces().some(r => isScheduledToday(r, now));
    return hasToday ? null : 'future';
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
    };
  });

  readonly raceSelectionGroup = this.formBuilder.group({
    enteredRaces: [[] as Race[], Validators.required],
    divisions: this.formBuilder.nonNullable.control<string[]>([]),
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
    const now = new Date();
    const isRO = this.auth.isRaceOfficer();
    return this.rc.allRaces().filter(race => {
      if (!isRO) {
        if (!isWithinNextDays(race, now, 7)) return false;
      }
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
        this.cs.club().classes,
        this.ratingLists.lists(),
      );
      return meetsPrimaryFleetEligibility(series, {
        boatClass: candidate.boatClassName,
        handicaps,
      });
    });
  });

  readonly enteredRaceIds = computed(() => (this.enteredRacesSig() ?? []).map(race => race.id));

  readonly divisionCatalog = computed(() =>
    divisionCatalogForRaces(this.enteredRacesSig() ?? [], this.rc.allSeries()),
  );

  readonly entryHandicapSchemes = computed(() => {
    const races = this.enteredRacesSig() ?? [];
    return handicapSchemesRequiredForRaces(races, this.rc.allSeries());
  });

  /** OOD entries open on the member picker, so the duty member's surname applies straight away. */
  readonly boatSearch = linkedSignal(() => (this.isOodEntry() ? this.searchSeed() : ''));

  readonly filteredBoats = computed(() => {
    const term = this.boatSearch().trim();
    return this.bs.boats().filter(boat => {
      const isClub = this.boatCategory() === 'club';
      if (boat.isClub !== isClub) return false;
      return boatFilter(boat, term);
    });
  });

  /** Member boats grouped by helm; club boats by class. */
  readonly filteredBoatGroups = computed((): BoatListGroup[] => {
    const category = this.boatCategory();
    if (category === 'visitor') return [];
    const grouped = groupBy(this.filteredBoats(), boat => boatGroupKey(boat, category));
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, boats]) => ({
        key,
        boats: [...boats].sort(sortBoatsInGroup),
      }));
  });

  readonly selectedBoatLabel = computed(() => {
    const boat = this.selectedBoat();
    if (!boat) return '';
    const option = formatBoatOptionLabel({
      boatName: boat.name,
      boatClass: boat.boatClass,
      sailNumber: boat.sailNumber,
    });
    if (!boat.isClub && boat.helm?.trim()) {
      return `${boat.helm.trim()} · ${option}`;
    }
    return option;
  });

  readonly showHelmCrewFields = computed(() => {
    const boat = this.selectedBoat();
    return !!boat && (boat.isClub || !this.isSinglehander());
  });

  private readonly boatSearchInput = viewChild<ElementRef<HTMLInputElement>>('boatSearchInput');
  /** Prevents re-focusing search after the user moves to helm/crew or the list. */
  private boatSearchFocusedFor: string | null = null;

  constructor() {
    this.ratingLists.preload();
    for (const scheme of this.visitorBoatSchemes()) {
      if (scheme === 'Personal') continue;
      const meta = getHandicapSchemeMetadata(scheme);
      this.visitorForm.addControl(
        handicapControlName(scheme),
        this.formBuilder.control<number | null>(meta.defaultValue, [
          Validators.required,
          Validators.min(meta.min),
          Validators.max(meta.max),
        ]),
      );
    }

    effect(() => {
      if (this.visitorIsSinglehander()) {
        this.visitorForm.controls['crew'].setValue('', { emitEvent: false });
      }
    });

    // Focus search when the member/club picker is first shown for this visit.
    afterRenderEffect(() => {
      const step = this.step();
      const category = this.boatCategory();
      if (step !== 'details' || category === 'visitor') {
        this.boatSearchFocusedFor = null;
        return;
      }
      const input = this.boatSearchInput()?.nativeElement;
      if (!input) return;
      const focusKey = `${step}:${category}`;
      if (this.boatSearchFocusedFor === focusKey) return;
      this.boatSearchFocusedFor = focusKey;
      input.focus();
    });

    effect(() => {
      const scopedRaceId = this.scopedRaceId();
      if (scopedRaceId) {
        untracked(() => this.currentRacesStore.addRaceId(scopedRaceId));
      }
    });

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
        this.helmControl.setValue(boat.helm ?? '');
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
      const scopedRaceId = this.scopedRaceId();
      if (!scopedRaceId) return;
      if (this.scopedRacePreselected()) return;
      const scopedRace = this.eligibleRaces().find(r => r.id === scopedRaceId);
      if (!scopedRace) return;
      this.raceSelectionGroup.get('enteredRaces')?.setValue([scopedRace]);
      this.scopedRacePreselected.set(true);
    });

    // Replace temporary locally-selected new boat with the persisted store record once loaded.
    effect(() => {
      const classVal = this.initialBoatClass();
      const sailVal = normalizeSailNumber(this.initialSailNumber());
      if (classVal && sailVal && !this.selectedBoat()) {
        const boat = this.bs.boats().find(
          b => b.boatClass.toLowerCase() === classVal.toLowerCase() && sailNumbersEqual(b.sailNumber, sailVal),
        );
        if (boat) {
          this.selectedBoat.set(boat);
        } else {
          // If not found, at least set the search term to help them find it
          this.boatSearch.set(`${classVal} ${sailVal}`);
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
    });

    effect(() => {
      const candidate = this.candidateBoat();
      const races = this.enteredRacesSig() ?? [];
      if (!candidate || races.length === 0) {
        this.raceSelectionGroup.controls.divisions.setValue([], { emitEvent: false });
        return;
      }
      void prefillDivisionsFromExistingEntry(
        {
          helm: candidate.helm,
          boatClass: candidate.boatClassName,
          sailNumber: candidate.sailNumber,
        },
        races,
        id => this.seriesEntries.getSeriesEntries(id),
      ).then(ids => {
        this.raceSelectionGroup.controls.divisions.setValue(ids, { emitEvent: false });
      });
    });
  }

  onBoatListSelection(event: MatSelectionListChange): void {
    const option = event.source.selectedOptions.selected[0];
    if (!option) return;
    const id = String(option.value);
    const boat =
      this.filteredBoats().find(b => b.id === id) ??
      this.bs.boats().find(b => b.id === id) ??
      (this.selectedBoat()?.id === id ? this.selectedBoat() : null);
    if (boat) {
      this.selectedBoat.set(boat);
    }
  }

  selectRecentBoat(boat: Boat): void {
    this.startedFromRecent.set(true);
    this.boatCategory.set(boat.isClub ? 'club' : 'member');
    this.selectedBoat.set(boat);
    if (boat.isClub && boat.helm) {
      this.helmControl.setValue(boat.helm);
    }
    if (boat.crew) {
      this.crewControl.setValue(boat.crew);
    }
    this.step.set('races');
  }

  chooseAnotherBoat(): void {
    this.startedFromRecent.set(false);
    this.selectedBoat.set(null);
    this.boatSearch.set('');
    this.boatCategory.set('member');
    this.step.set('category');
  }

  startMember(): void {
    this.startedFromRecent.set(false);
    this.selectedBoat.set(null);
    this.boatSearch.set(this.searchSeed());
    this.boatCategory.set('member');
    this.step.set('details');
  }

  startClub(): void {
    this.startedFromRecent.set(false);
    this.selectedBoat.set(null);
    this.boatSearch.set(this.searchSeed());
    this.boatCategory.set('club');
    this.step.set('details');
  }

  startVisitor(): void {
    this.startedFromRecent.set(false);
    this.selectedBoat.set(null);
    this.boatSearch.set('');
    this.boatCategory.set('visitor');
    this.resetVisitorForm();
    const seed = this.searchSeed();
    if (/\d/.test(seed)) {
      this.visitorForm.controls['sailNumber'].setValue(seed);
    }
    this.step.set('details');
  }

  goBack(): void {
    if (this.step() === 'races') {
      if (this.hasRecentBoats() && this.startedFromRecent()) {
        this.step.set('recent');
        return;
      }
      this.step.set('details');
      return;
    }
    if (this.step() === 'details') {
      this.selectedBoat.set(null);
      this.boatSearch.set('');
      this.resetVisitorForm();
      this.step.set('category');
      return;
    }
    if (this.step() === 'category') {
      if (this.hasRecentBoats()) {
        this.step.set('recent');
        return;
      }
    }
    this.selectedBoat.set(null);
    this.boatSearch.set('');
    this.resetVisitorForm();
  }

  goNext(): void {
    if (this.boatCategory() === 'visitor') {
      this.confirmVisitorBoat();
      if (!this.selectedBoat()) return;
    } else if (!this.canProceedToRaces()) {
      return;
    }
    this.step.set('races');
  }

  private confirmVisitorBoat(): void {
    if (this.visitorForm.invalid) return;
    const raw = this.visitorForm.getRawValue() as Record<string, unknown>;
    const boatClass = String(raw['boatClass'] ?? '').trim();
    const singlehander = isSinglehanderClass(boatClass, this.cs.club().classes);
    const handicaps: Handicap[] = this.visitorBoatSchemes()
      .filter(s => s !== 'Personal')
      .map(scheme => {
        const meta = getHandicapSchemeMetadata(scheme);
        const value = Number(raw[handicapControlName(scheme)] ?? meta.defaultValue);
        return { scheme, value: Number.isFinite(value) && value > 0 ? value : meta.defaultValue };
      });

    this.selectedBoat.set({
      id: `new-${Date.now()}`,
      boatClass,
      sailNumber: normalizeSailNumber(raw['sailNumber']),
      helm: String(raw['helm'] ?? '').trim(),
      crew: singlehander ? '' : String(raw['crew'] ?? '').trim(),
      name: String(raw['name'] ?? '').trim(),
      isClub: false,
      handicaps: handicaps.length > 0 ? handicaps : undefined,
      personalHandicapBand: raw['personalHandicapBand'] === 'unknown'
        ? undefined
        : (raw['personalHandicapBand'] as PersonalHandicapBand | undefined),
    });
  }

  private resetVisitorForm(): void {
    this.visitorForm.reset({
      boatClass: '',
      sailNumber: '',
      name: '',
      helm: '',
      crew: '',
      personalHandicapBand: 'unknown',
      club: '',
    });
    for (const scheme of this.visitorBoatSchemes()) {
      if (scheme === 'Personal') continue;
      const control = this.visitorForm.get(handicapControlName(scheme));
      if (control) {
        control.setValue(getHandicapSchemeMetadata(scheme).defaultValue);
      }
    }
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
        console.log('EntryWizard. Error adding new boat: ' + String(error));
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
    };
    this.selectedBoat.set(newBoat);
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
      divisions: this.raceSelectionGroup.controls.divisions.getRawValue(),
      club: entryClubForCategory(
        this.boatCategory(),
        this.visitorForm.controls['club'].value,
        this.cs.club(),
      ),
      boatName: trimBoatName(selected.name),
      resultCode: this.isOodEntry() ? ('OOD' as const) : undefined,
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
      console.log('EntryWizard: Error adding entries: ' + String(error));
      return;
    } finally {
      this.busy.set(false);
    }

    if (!this.auth.isRaceOfficer()) {
      try {
        const boatToSave: Boat = {
          ...selected,
          helm: candidate.helm,
          crew: candidate.crew ?? '',
        };
        await this.userData.recordRecentBoat(boatToSave);
      } catch (err) {
        console.warn('EntryWizard: Error saving recent boat: ', err);
      }
    }

    this.raceSelectionGroup.reset();
    this.competitorDetailsGroup.reset();
    this.selectedBoat.set(null);
    this.boatSearch.set('');
    this.resetVisitorForm();
    this.step.set(this.hasRecentBoats() ? 'recent' : 'category');

    this.entered.emit({ races });
  }

  /** True once a boat is chosen or any field has been edited. */
  isDirty(): boolean {
    return (
      this.selectedBoat() !== null ||
      this.raceSelectionGroup.dirty ||
      this.competitorDetailsGroup.dirty ||
      this.visitorForm.dirty
    );
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
