import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Boat,
  BoatsStore,
  compareSailNumbers,
  normalizeSailNumber,
  sailNumbersEqual,
} from 'app/boats';
import { HelmNameAutocomplete } from 'app/boats/presentation/helm-name-autocomplete';
import { ClubStore } from 'app/club-tenant';
import { isSinglehanderClass } from 'app/club-tenant/model/boat-class';
import { RaceCalendarStore } from 'app/race-calender';
import { CurrentRaces } from 'app/results-input';
import { type Handicap } from 'app/scoring/model/handicap';
import { handicapSchemesRequiredForRaces } from 'app/scoring/model/handicap-race-requirements';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import type { EntryConflictSummary } from 'app/shared/dialogs/entry-conflict-dialog';
import { firstValueFrom, startWith } from 'rxjs';
import {
  meetsPrimaryFleetEligibility,
  resolveHandicapsForSeries,
} from '../../services/entry-helpers';
import { EntryConflict, EntryService } from '../../services/entry.service';
import {
  formatHelmSurnameLast,
  HELM_LETTER_RANGES,
  helmMatchesLetterRange,
  type HelmLetterRangeId,
  surnameOf,
} from '../../utils/helm-surname';
import { EntriesListPanel } from '../entries-list-panel';
import { KioskNewHelmDialog } from '../kiosk-new-helm-dialog';
import { NewBoatDialog, type NewBoatDialogResult } from '../new-boat-dialog';

type KioskView =
  | 'category'
  | 'entries'
  | 'memberHelm'
  | 'memberBoat'
  | 'memberConfirm'
  | 'clubClass'
  | 'clubSail'
  | 'clubHelm'
  | 'success';

function sortBoatsInGroup(a: Boat, b: Boat): number {
  const classCmp = (a.boatClass ?? '').localeCompare(b.boatClass ?? '');
  if (classCmp !== 0) return classCmp;
  return compareSailNumbers(a.sailNumber, b.sailNumber);
}

const HELM_GRID_ROW_HEIGHT = 64;
const HELM_GRID_ROW_GAP = 4;
const HELM_GRID_COLUMN_WIDTH = 220;
const HELM_GRID_COLUMN_GAP = 16;

/** Column count that keeps names in vertical lists, adding columns only when rows overflow. */
export function helmGridLayout(
  itemCount: number,
  viewportWidth: number,
  viewportHeight: number,
): { columns: number; rows: number } {
  if (itemCount === 0) return { columns: 1, rows: 0 };
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return { columns: 1, rows: itemCount };
  }

  const maxColumnsByWidth = Math.max(
    1,
    Math.floor((viewportWidth + HELM_GRID_COLUMN_GAP) / (HELM_GRID_COLUMN_WIDTH + HELM_GRID_COLUMN_GAP)),
  );
  const maxRowsPerColumn = Math.max(
    1,
    Math.floor((viewportHeight + HELM_GRID_ROW_GAP) / (HELM_GRID_ROW_HEIGHT + HELM_GRID_ROW_GAP)),
  );
  const columns = Math.min(Math.ceil(itemCount / maxRowsPerColumn), maxColumnsByWidth);
  const rows = Math.ceil(itemCount / columns);
  return { columns, rows };
}

@Component({
  selector: 'app-kiosk-entry',
  templateUrl: './kiosk-entry-page.html',
  styleUrl: './kiosk-entry-page.scss',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    HelmNameAutocomplete,
    EntriesListPanel,
  ],
})
export class KioskEntryPage {
  private readonly entryService = inject(EntryService);
  private readonly boatsStore = inject(BoatsStore);
  private readonly raceCalendar = inject(RaceCalendarStore);
  private readonly clubStore = inject(ClubStore);
  private readonly currentRaces = inject(CurrentRaces);
  private readonly dialog = inject(MatDialog);
  private readonly dialogs = inject(DialogsService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly letterRanges = HELM_LETTER_RANGES;

  readonly view = signal<KioskView>('category');
  readonly category = signal<'member' | 'club' | null>(null);
  readonly letterRange = signal<HelmLetterRangeId | null>(null);
  readonly selectedHelm = signal<string | null>(null);
  readonly selectedBoat = signal<Boat | null>(null);
  readonly selectedClubClass = signal<string | null>(null);
  readonly busy = signal(false);
  readonly successMessage = signal('');

  readonly clubHelmForm = this.fb.nonNullable.group({
    helm: ['', Validators.required],
    crew: [''],
  });

  readonly memberCrewControl = this.fb.nonNullable.control('');

  private readonly clubHelmValue = toSignal(
    this.clubHelmForm.controls.helm.valueChanges.pipe(
      startWith(this.clubHelmForm.controls.helm.value),
    ),
    { initialValue: '' },
  );

  private readonly clubCrewValue = toSignal(
    this.clubHelmForm.controls.crew.valueChanges.pipe(
      startWith(this.clubHelmForm.controls.crew.value),
    ),
    { initialValue: '' },
  );

  private readonly memberCrewValue = toSignal(
    this.memberCrewControl.valueChanges.pipe(startWith(this.memberCrewControl.value)),
    { initialValue: '' },
  );

  readonly memberHelms = computed(() => {
    const helms = new Set<string>();
    for (const boat of this.boatsStore.boats()) {
      if (!boat.isClub && boat.helm?.trim()) {
        helms.add(boat.helm.trim());
      }
    }
    return [...helms].sort((a, b) => {
      const bySurname = surnameOf(a).localeCompare(surnameOf(b));
      return bySurname !== 0 ? bySurname : a.localeCompare(b);
    });
  });

  readonly filteredMemberHelms = computed(() => {
    const range = this.letterRange();
    return this.memberHelms().filter(helm => helmMatchesLetterRange(helm, range));
  });

  private readonly helmScrollArea = viewChild<ElementRef<HTMLElement>>('helmScroll');
  private readonly helmScrollSize = signal({ width: 0, height: 0 });

  readonly helmGridLayout = computed(() =>
    helmGridLayout(
      this.filteredMemberHelms().length,
      this.helmScrollSize().width,
      this.helmScrollSize().height,
    ),
  );

  readonly boatsForSelectedHelm = computed(() => {
    const helm = this.selectedHelm();
    if (!helm) return [];
    return this.boatsStore
      .boats()
      .filter(b => !b.isClub && b.helm?.trim() === helm)
      .sort(sortBoatsInGroup);
  });

  readonly clubClasses = computed(() => {
    const classes = new Set<string>();
    for (const boat of this.boatsStore.boats()) {
      if (boat.isClub && boat.boatClass?.trim()) {
        classes.add(boat.boatClass.trim());
      }
    }
    return [...classes].sort((a, b) => a.localeCompare(b));
  });

  readonly clubBoatsForClass = computed(() => {
    const cls = this.selectedClubClass();
    if (!cls) return [];
    return this.boatsStore
      .boats()
      .filter(b => b.isClub && b.boatClass === cls)
      .sort(sortBoatsInGroup);
  });

  readonly isSinglehander = computed(() => {
    const boat = this.selectedBoat();
    if (!boat) return false;
    return isSinglehanderClass(boat.boatClass, this.clubStore.club().classes);
  });

  /** Handicaps for the selected boat (independent of helm/crew). */
  private readonly selectedBoatHandicaps = computed((): Handicap[] => {
    const boat = this.selectedBoat();
    if (!boat) return [];
    const handicapByScheme = new Map<HandicapScheme, number>();
    for (const h of this.classHandicaps()) {
      if (h.value > 0) handicapByScheme.set(h.scheme, h.value);
    }
    for (const h of boat.handicaps ?? []) {
      if (h.value > 0) handicapByScheme.set(h.scheme, h.value);
    }
    return [...handicapByScheme.entries()].map(([scheme, value]) => ({ scheme, value }));
  });

  readonly candidateBoat = computed(() => {
    const boat = this.selectedBoat();
    if (!boat) return undefined;

    const helm = boat.isClub
      ? String(this.clubHelmValue() ?? '').trim()
      : String(boat.helm ?? '').trim();
    if (!helm) return undefined;

    const crewTrim = this.isSinglehander()
      ? ''
      : boat.isClub
        ? String(this.clubCrewValue() ?? '').trim()
        : String(this.memberCrewValue() ?? '').trim();
    const crew = crewTrim || undefined;

    return {
      boatClassName: boat.boatClass,
      sailNumber: boat.sailNumber,
      helm,
      crew,
      handicaps: this.selectedBoatHandicaps(),
      personalHandicapBand: boat.personalHandicapBand,
      personalHandicapUnknown: !boat.personalHandicapBand,
    };
  });

  /** Races this boat's class/handicaps are eligible for — does not require helm or crew. */
  readonly eligibleRaces = computed(() => {
    const boat = this.selectedBoat();
    if (!boat) return [];
    const handicaps = this.selectedBoatHandicaps();
    const seriesById = new Map(this.raceCalendar.allSeries().map(s => [s.id, s]));
    return this.raceCalendar.allRaces().filter(race => {
      const series = seriesById.get(race.seriesId);
      if (!series) return false;
      const resolved = resolveHandicapsForSeries(
        series,
        {
          boatClassName: boat.boatClass,
          handicaps,
          personalHandicapBand: boat.personalHandicapBand,
          personalHandicapUnknown: !boat.personalHandicapBand,
        },
        this.clubStore.club().classes,
      );
      return meetsPrimaryFleetEligibility(series, {
        boatClass: boat.boatClass,
        handicaps: resolved,
      });
    });
  });

  readonly todaysEligibleRaces = computed(() => {
    const todayIds = new Set(this.currentRaces.todaysRaces().map(r => r.id));
    return this.eligibleRaces().filter(r => todayIds.has(r.id));
  });

  readonly raceCountLabel = computed(() => {
    const count = this.todaysEligibleRaces().length;
    if (count === 0) return 'No races today for this boat';
    const raceText = count === 1 ? 'Enter 1 race today.' : `Enter ${count} races today.`;
    if (!this.candidateBoat()) return `${raceText} Enter helm to sign on.`;
    return raceText;
  });

  readonly showBack = computed(() => this.view() !== 'category' && this.view() !== 'success');

  readonly stepTitle = computed(() => {
    switch (this.view()) {
      case 'category':
        return 'Race entry';
      case 'entries':
        return 'Entries';
      case 'memberHelm':
        return 'Select helm';
      case 'memberBoat':
        return this.selectedHelm() ?? 'Select boat';
      case 'memberConfirm':
        return 'Confirm entry';
      case 'clubClass':
        return 'Select class';
      case 'clubSail':
        return this.selectedClubClass() ?? 'Select sail number';
      case 'clubHelm':
        return 'Helm and crew';
      case 'success':
        return 'Done';
    }
  });

  readonly canEnter = computed(() => this.todaysEligibleRaces().length > 0 && !!this.candidateBoat());

  showEntries(): void {
    this.view.set('entries');
  }

  constructor() {
    effect((onCleanup) => {
      const el = this.helmScrollArea()?.nativeElement;
      if (!el) {
        this.helmScrollSize.set({ width: 0, height: 0 });
        return;
      }

      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        this.helmScrollSize.set({ width, height });
      });
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });
  }

  formatHelm(helm: string): string {
    return formatHelmSurnameLast(helm);
  }

  startMember(): void {
    this.category.set('member');
    this.view.set('memberHelm');
  }

  startClub(): void {
    this.category.set('club');
    this.view.set('clubClass');
  }

  setLetterRange(rangeId: HelmLetterRangeId): void {
    this.letterRange.update(current => (current === rangeId ? null : rangeId));
  }

  selectMemberHelm(helm: string): void {
    this.selectedHelm.set(helm);
    this.view.set('memberBoat');
  }

  selectMemberBoat(boat: Boat): void {
    this.selectedBoat.set(boat);
    const crew = isSinglehanderClass(boat.boatClass, this.clubStore.club().classes) ? '' : (boat.crew ?? '');
    this.memberCrewControl.setValue(crew);
    this.view.set('memberConfirm');
  }

  selectClubClass(cls: string): void {
    this.selectedClubClass.set(cls);
    this.view.set('clubSail');
  }

  selectClubBoat(boat: Boat): void {
    this.selectedBoat.set(boat);
    const crew = isSinglehanderClass(boat.boatClass, this.clubStore.club().classes) ? '' : (boat.crew ?? '');
    this.clubHelmForm.reset({ helm: '', crew });
    this.view.set('clubHelm');
  }

  goBack(): void {
    switch (this.view()) {
      case 'entries':
        this.view.set('category');
        break;
      case 'memberHelm':
        this.resetToCategory();
        break;
      case 'memberBoat':
        this.view.set('memberHelm');
        break;
      case 'memberConfirm':
        this.view.set('memberBoat');
        break;
      case 'clubClass':
        this.resetToCategory();
        break;
      case 'clubSail':
        this.view.set('clubClass');
        break;
      case 'clubHelm':
        this.view.set('clubSail');
        break;
      default:
        break;
    }
  }

  resetToCategory(): void {
    this.view.set('category');
    this.category.set(null);
    this.letterRange.set(null);
    this.selectedHelm.set(null);
    this.selectedBoat.set(null);
    this.selectedClubClass.set(null);
    this.clubHelmForm.reset({ helm: '', crew: '' });
    this.memberCrewControl.reset('');
    this.successMessage.set('');
  }

  async addNewHelm(): Promise<void> {
    const dialogRef = this.dialog.open(KioskNewHelmDialog, {
      width: '480px',
      maxWidth: '95vw',
    });
    const helm = await firstValueFrom(dialogRef.afterClosed());
    if (!helm) return;
    await this.addNewBoat(helm);
  }

  async addNewBoat(prefilledHelm?: string, prefilledClass?: string): Promise<void> {
    const data =
      prefilledHelm || prefilledClass ? { prefilledHelm, prefilledClass } : undefined;
    const dialogRef = this.dialog.open(NewBoatDialog, {
      width: '480px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      disableClose: true,
      data,
    });
    const created = (await firstValueFrom(dialogRef.afterClosed())) as NewBoatDialogResult | undefined;
    if (!created) return;

    if (created.saveToRepository) {
      try {
        this.busy.set(true);
        await this.boatsStore.add(created.boat);
      } catch (err: unknown) {
        this.snackbar.open('Error adding boat to register', 'Dismiss', { duration: 3000 });
        console.error('KioskEntryPage: add boat failed', err);
        return;
      } finally {
        this.busy.set(false);
      }

      const persisted = this.boatsStore.boats().find(
        b =>
          b.boatClass === created.boat.boatClass &&
          sailNumbersEqual(b.sailNumber, created.boat.sailNumber ?? '') &&
          b.helm === (created.boat.helm ?? ''),
      );
      if (persisted) {
        this.selectedHelm.set(persisted.helm);
        this.selectedBoat.set(persisted);
        this.view.set('memberConfirm');
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
    this.selectedHelm.set(newBoat.helm);
    this.selectedBoat.set(newBoat);
    this.view.set('memberConfirm');
  }

  async submit(): Promise<void> {
    const selected = this.selectedBoat();
    const candidate = this.candidateBoat();
    const races = this.todaysEligibleRaces();
    if (!selected || !candidate || races.length === 0) return;

    if (this.category() === 'member' && this.needsRegisterSave(selected)) {
      const save = await this.dialogs.confirm(
        'Save to boat register?',
        'Save this boat so it appears next time you sign on?',
      );
      if (save) {
        try {
          this.busy.set(true);
          await this.boatsStore.add({
            boatClass: selected.boatClass,
            sailNumber: selected.sailNumber,
            helm: selected.helm,
            crew: selected.crew,
            name: selected.name,
            isClub: false,
            handicaps: selected.handicaps,
            personalHandicapBand: selected.personalHandicapBand,
            tags: selected.tags,
          });
          const persisted = this.boatsStore.boats().find(
            b =>
              b.boatClass === selected.boatClass &&
              sailNumbersEqual(b.sailNumber, selected.sailNumber) &&
              b.helm === selected.helm,
          );
          if (persisted) {
            this.selectedBoat.set(persisted);
          }
        } catch (err: unknown) {
          this.snackbar.open('Could not save boat to register', 'Dismiss', { duration: 3000 });
          console.error('KioskEntryPage: register save failed', err);
          return;
        } finally {
          this.busy.set(false);
        }
      }
    }

    const boat = this.selectedBoat()!;
    const activeSchemes = new Set(
      handicapSchemesRequiredForRaces(races, this.raceCalendar.allSeries()),
    );
    const activeHandicaps = candidate.handicaps.filter(h => activeSchemes.has(h.scheme));

    const entryData = {
      races,
      boatClass: boat.boatClass,
      sailNumber: boat.sailNumber,
      helm: candidate.helm,
      crew: candidate.crew,
      handicaps: activeSchemes.size > 0 ? activeHandicaps : undefined,
      personalHandicapBand: candidate.personalHandicapBand,
      tags: boat.tags,
    };

    const conflicts = this.entryService.findEntryConflicts(entryData);
    if (conflicts.length > 0) {
      const choice = await this.dialogs.promptEntryConflict(
        conflicts.map(c => this.summariseConflict(c)),
      );
      if (choice === 'cancel') return;
    }

    try {
      this.busy.set(true);
      if (conflicts.length > 0) {
        await this.entryService.swapAndEnter(entryData, conflicts);
      } else {
        await this.entryService.enterRaces(entryData);
      }
    } catch (err: unknown) {
      this.snackbar.open('Error adding entries', 'Dismiss', { duration: 3000 });
      console.error('KioskEntryPage: enter failed', err);
      return;
    } finally {
      this.busy.set(false);
    }

    this.successMessage.set(`Entered ${races.length} race${races.length === 1 ? '' : 's'}.`);
    this.view.set('success');
    window.setTimeout(() => this.resetToCategory(), 2500);
  }

  private needsRegisterSave(boat: Boat): boolean {
    if (boat.isClub || boat.id.startsWith('new-')) return true;
    return !this.boatsStore.boats().some(
      b =>
        b.boatClass === boat.boatClass &&
        sailNumbersEqual(b.sailNumber, boat.sailNumber) &&
        b.helm === boat.helm,
    );
  }

  private classHandicaps(): Handicap[] {
    const boat = this.selectedBoat();
    if (!boat) return [];
    return this.clubStore.club().classes.find(c => c.name === boat.boatClass)?.handicaps ?? [];
  }

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
