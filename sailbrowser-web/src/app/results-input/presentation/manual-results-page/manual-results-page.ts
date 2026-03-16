import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, linkedSignal, signal, untracked, viewChild, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { ScoringEngine } from 'app/published-results';
import { Race, RaceCalendarStore } from 'app/race-calender';
import { CurrentRaces, RaceCompetitor, RaceCompetitorStore } from 'app/results-input';
import { RESULT_CODE_DEFINITIONS, ResultCode, getResultCodeDefinition } from 'app/scoring/model/result-code';
import { Toolbar } from 'app/shared/components/toolbar';
import { normaliseString } from 'app/shared/utils/string-utils';
import { firstValueFrom, map, of, startWith, switchMap, Observable } from 'rxjs';
import { ManualResultsTable } from '../manual-results-table';
import { RaceStartTimeDialog, type RaceStartTimeResult } from '../race-start-time-dialog';
import { RaceTimeInput } from '../race-time-input';
import { ResultCodeSelector } from '../result-code-selector';
import { requiresTime } from 'app/scoring/model/result-code-scoring';
import { manualRaceTableSort, ManualResultsService } from '../../services/manual-results.service';
import { DurationPipe } from 'app/shared/pipes/duration.pipe';
import { MoreRacesDialog } from '../more-races-dialog';

@Component({
  selector: 'app-manual-results-page',
  templateUrl: './manual-results-page.html',
  styleUrls: ['./manual-results-page.scss'],
  imports: [
    Toolbar,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatAutocompleteModule,
    ReactiveFormsModule,
    DatePipe,
    MatIconModule,
    MatSelectModule,
    MatDialogModule,
    RaceTimeInput,
    ManualResultsTable,
    DurationPipe,
    ResultCodeSelector,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualResultsPage {
  private readonly store = inject(RaceCompetitorStore);
  private readonly dialog = inject(MatDialog);
  protected readonly raceStore = inject(RaceCalendarStore);
  protected readonly currentRacesStore = inject(CurrentRaces);
  private readonly publishService = inject(ScoringEngine);
  private readonly manualResultsService = inject(ManualResultsService);
  private readonly fb = inject(FormBuilder);

  readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  readonly raceId = input<string>();

  readonly raceFilterControl = new FormControl<string | null>(null);

  readonly resultCodes = RESULT_CODE_DEFINITIONS.filter(c => c.id !== 'NOT FINISHED');

  // Forms for data entry
  readonly handicapForm = this.fb.group({
    finishTime: this.fb.control<Date | null>(null, { updateOn: 'blur' }),
    laps: this.fb.nonNullable.control(1, Validators.required),
    resultCode: this.fb.nonNullable.control<ResultCode>('OK'),
  });

  readonly pursuitForm = this.fb.group({
    position: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    resultCode: this.fb.nonNullable.control<ResultCode>('OK'),
  });

  readonly levelRatingForm = this.fb.group({
    position: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    finishTime: this.fb.control<Date | null>(null, { updateOn: 'blur' }),
    resultCode: this.fb.nonNullable.control<ResultCode>('OK'),
  });

  readonly activeForm = computed(() => {
    const type = this.selectedRace()?.type;
    if (type === 'Pursuit') return this.pursuitForm;
    if (type === 'Level Rating') return this.levelRatingForm;
    return this.handicapForm;
  });

  readonly resultCodeValue = toSignal(
    toObservable(this.activeForm).pipe(
      switchMap(form => form.controls.resultCode.valueChanges.pipe(startWith(form.controls.resultCode.value as ResultCode)))
    ), { initialValue: 'OK' as ResultCode }
  );
  // Note: We might need to sync resultCode across forms if we want to keep it consistent when switching
  // but usually we only switch race once.
  readonly resultCodeDescription = computed(() => getResultCodeDefinition(this.resultCodeValue())?.description);
  timeInputRequired = computed(() => {
    const code = this.resultCodeValue();
    return requiresTime(code) || code === 'NOT FINISHED';
  });

  readonly selectedRaceId = toSignal(this.raceFilterControl.valueChanges.pipe(startWith(this.raceFilterControl.value)), { initialValue: this.raceFilterControl.value });

  readonly selectedRace = computed(() =>
    this.currentRacesStore.selectedRaces().find(r => this.selectedRaceId() == r.id));

  readonly selectedCompetitor = linkedSignal<RaceCompetitor | undefined>(() => {
    this.selectedRace();
    return undefined;
  });

  // Search control for autocomplete
  readonly searchControl = new FormControl<string | RaceCompetitor | null>('');
  private readonly searchTerm = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      map(value => (typeof value === 'string' ? value : ''))
    ), { initialValue: '' }
  );

  readonly timeInputContext = computed(() => {
    const race = this.selectedRace();

    if (!race) return { mode: 'tod' as const, baseTime: new Date() };

    const mode = race.timeInputMode || 'tod';

    const baseTime = race.actualStart || new Date();

    return { mode, baseTime: new Date(baseTime) };
  });

  // Feedback signals for the RO
  readonly enteredFinishTime = toSignal(
    toObservable(this.activeForm).pipe(
      switchMap(form => {
        const ctrl = (form.controls as any).finishTime;
        return (ctrl ? ctrl.valueChanges.pipe(startWith(ctrl.value)) : of(null)) as Observable<Date | null>;
      })
    ), { initialValue: null }
  );

  readonly enteredLapsValue = toSignal(
    toObservable(this.activeForm).pipe(
      switchMap(form => {
        const ctrl = (form.controls as any).laps;
        return (ctrl ? ctrl.valueChanges.pipe(startWith(ctrl.value)) : of(1)) as Observable<number>;
      })
    ), { initialValue: 1 }
  );

  readonly calculatedStats = computed(() => {
    const stats = this.manualResultsService.calculateStats(
      this.enteredFinishTime(),
      this.enteredLapsValue() || 1,
      this.selectedRace()
    );

    if (!stats) return null;

    // Simple heuristic: Highlight if avg lap < 2 mins (120s) or > 60 mins (3600s)
    const isSuspicious = stats.avgLapTime < 120 || stats.avgLapTime > 3600;
    return { ...stats, isSuspicious };
  });

  // Remember the last entered time to pre-populate the next entry
  private readonly lastEnteredLaps = signal<number>(1);

  // Competitors list sorted: Unfinished first, then Finished (at bottom)
  readonly sortedCompetitors = computed(() => {
    const raceId = this.selectedRace()?.id;
    const comps = this.store.selectedCompetitors().filter(comp => raceId === comp.raceId);
    return [...comps].sort((a, b) => manualRaceTableSort(a, b, 'elapsedTime', 'asc'));
  });

  // Filtered competitors for autocomplete, grouped by finished status
  readonly autoCompleteGroups = computed(() => {
    const term = normaliseString(this.searchTerm());
    if (term.length === 0) {
      return [];
    }

    const filtered = this.sortedCompetitors().filter(c => {
      const searchStr = normaliseString(`${c.boatClass} ${c.sailNumber} ${c.helm}`);
      return searchStr.includes(term);
    });

    const toFinish = filtered.filter(c => c.resultCode === 'NOT FINISHED');
    const finished = filtered.filter(c => c.resultCode !== 'NOT FINISHED');

    const groups: {name: string, competitors: RaceCompetitor[]}[] = [];

    if (toFinish.length > 0) {
      groups.push({ name: 'To Finish', competitors: toFinish });
    }

    if (finished.length > 0) {
      groups.push({ name: 'Finished', competitors: finished });
    }

    return groups;
  });

  onRaceSelectionChange(event: MatSelectChange) {
    if (event.value === 'MORE') {
      this.openMoreRacesDialog();
      this.raceFilterControl.setValue(null);
    }
  }

  async openMoreRacesDialog() {
    const dialogRef = this.dialog.open(MoreRacesDialog, {
      width: '400px',
      maxHeight: '80vh'
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      this.raceFilterControl.setValue(result);
    }
  }

  constructor() {
    effect(() => {
      const id = this.raceId();
      if (id && this.raceFilterControl.value !== id) {
        untracked(() => this.raceFilterControl.setValue(id));
      }
    });

    // When a competitor is selected (via table or autocomplete), populate the form and search control
    const selectedCompetitorEffect = effect(() => {
      const comp = this.selectedCompetitor();
      untracked(() => {
        if (!comp) {
          this.searchControl.setValue(null, { emitEvent: false });
          this.resetFormDefaults();
          return;
        }

        this.searchControl.setValue(comp, { emitEvent: false });
        if (comp.resultCode === 'NOT FINISHED') {
          this.resetFormDefaults();
        } else {
          this.activeForm().reset({
            finishTime: comp.manualFinishTime,
            laps: comp.manualLaps || 1,
            resultCode: comp.resultCode,
            position: comp.manualPosition
          } as any);
        }
      });
    });

    const startTimePromptEffect = effect(() => {
      const race = this.selectedRace();
      if (race && race.type !== 'Level Rating' && race.type !== 'Pursuit') {
        untracked(() => {
          if (!race.actualStart) {
            this.setStartTime(race);
          }
        });
      }
    });

    const timeInputRequiredEffect = effect(() => {
      const form = this.activeForm();
      const control = (form.controls as any).finishTime;
      if (!control) return;

      if (this.timeInputRequired()) {
        control.setValidators(Validators.required);
      } else {
        control.clearValidators();
      }
      untracked(() => {
        control.updateValueAndValidity({ emitEvent: false });
      });
    });
  }

  resetFormDefaults() {
    this.activeForm().reset({
      finishTime: null,
      laps: this.lastEnteredLaps(),
      resultCode: 'OK',
      position: null
    } as any);
  }

  displayFn(comp: RaceCompetitor): string {
    return comp ? `${comp.helm} ${comp.boatClass} ${comp.sailNumber}` : '';
  }

  onCompetitorSelected(event: MatAutocompleteSelectedEvent) {
    this.selectedCompetitor.set(event.option.value);
  }

  onRowClick(row: RaceCompetitor) {
    this.selectedCompetitor.set(row);
  }

  async setStartTime(race: Race): Promise<RaceStartTimeResult | undefined> {
    const dialog = this.dialog.open<RaceStartTimeDialog, { race: typeof race; }, RaceStartTimeResult>(RaceStartTimeDialog, {
      data: { race }
    });

    const result = await firstValueFrom<RaceStartTimeResult | undefined>(dialog.afterClosed());

    if (result) {
      this.manualResultsService.setStartTime(race.id, result.startTime, result.mode )
    }

    return result;
  }

  async save() {
    const form = this.activeForm();
    if (form.invalid) return;

    const values = form.getRawValue() as any;
    const { finishTime, laps, resultCode, position } = values;
    const competitor = this.selectedCompetitor();

    if (!competitor) return;

    const race = this.currentRacesStore.selectedRaces().find(r => r.id === competitor.raceId)!;

    // Start time must have been set for the competitor prior 
    // to saving the result. 
    // Pursuit and Level Rating races don't require start time for input
    if (race.type === 'Handicap' && !race.actualStart) {
      console.error('ManualResultsRage: Attempting to save result before start time set');
      await this.setStartTime(race!);
      return;
    }

    // If Result is OK, a finish time must be provided for Handicap races.
    if (race.type === 'Handicap' && requiresTime(resultCode) && !finishTime) {
      console.error('ManualResultsRage: Attempting to save competitor with result code OK and no finish time');
      return;
    }

    await this.manualResultsService.recordResult(competitor, race, {
      finishTime: finishTime,
      laps: laps,
      resultCode: resultCode,
      position: position
    });

    // Remember laps for next entry
    if (laps) this.lastEnteredLaps.set(laps);

    this.selectedCompetitor.set(undefined);
    this.searchInput().nativeElement.focus();

  }

  /** Publish the race results */
  publish() {
    if (this.selectedRace()) {
      this.publishService.publishRace(this.selectedRace()!);
    }

  }
}
