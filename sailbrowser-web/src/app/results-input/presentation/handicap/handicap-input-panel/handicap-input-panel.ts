import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Race } from 'app/race-calender';
import { ResolvedRaceCompetitor } from 'app/results-input';
import { ResultCode } from 'app/scoring/model/result-code';
import { requiresTime } from 'app/scoring/model/result-code-scoring';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { DurationPipe } from 'app/shared/pipes/duration.pipe';
import { normaliseString } from 'app/shared/utils/string-utils';
import { firstValueFrom, map, startWith } from 'rxjs';
import { manualRaceTableSort, ManualResultsService } from '../../../services/manual-results.service';
import { ClubStore } from 'app/club-tenant';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getCorrectedTime } from 'app/scoring/services/scorer-times';
import { isSuspectIncludingCorrected, resolveSuspectTimeRules } from '../../../services/suspect-time-rules';
import { RaceStartTimeDialog, type RaceStartTimeResult } from '../race-start-time-dialog';
import { RaceTimeInput } from '../race-time-input';
import { ResultCodeSelect } from '../../result-code-select';
import { EditRaceCompetitorDialog } from '../../edit-race-competitor-dialog/edit-race-competitor-dialog';

@Component({
  selector: 'app-handicap-input-panel',
  templateUrl: './handicap-input-panel.html',
  styleUrl: './handicap-input-panel.scss',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatAutocompleteModule,
    MatIconModule,
    MatDialogModule,
    RaceTimeInput,
    ResultCodeSelect,
    DurationPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HandicapInputPanel {
  private readonly manualResultsService = inject(ManualResultsService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogs = inject(DialogsService);
  private readonly fb = inject(FormBuilder);
  private readonly clubStore = inject(ClubStore);

  race = input.required<Race>();
  competitors = input.required<ResolvedRaceCompetitor[]>();
  handicapScheme = input.required<HandicapScheme>();

  /** Two-way bound from parent so the results table can highlight the selected row. */
  selectedCompetitor = model<ResolvedRaceCompetitor | undefined>(undefined);
  readonly addEntryRequested = output<void>();

  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private readonly switchingSelection = signal(false);

  readonly form = this.fb.group({
    finishTime: this.fb.control<Date | null>(null),
    laps: this.fb.nonNullable.control(1, [Validators.required, Validators.min(1)]),
    resultCode: this.fb.nonNullable.control<ResultCode>('OK'),
  });

  readonly resultCodeValue = toSignal(
    this.form.controls.resultCode.valueChanges.pipe(
      startWith(this.form.controls.resultCode.value as ResultCode)
    ),
    { initialValue: 'OK' as ResultCode }
  );


  readonly timeInputRequired = computed(() => {
    const code = this.resultCodeValue();
    return requiresTime(code) || code === 'NOT FINISHED';
  });

  readonly hasSelectedCompetitor = computed(() => this.selectedCompetitor() != null);

  readonly searchControl = new FormControl<string | ResolvedRaceCompetitor | null>('');
  private readonly searchTerm = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      map(value => (typeof value === 'string' ? value : ''))
    ),
    { initialValue: '' }
  );

  readonly timeInputContext = computed(() => {
    const race = this.race();
    const mode = race.timeInputMode || 'tod';
    const baseTime = this.selectedCompetitor()?.startTime || race.actualStart || new Date();
    return { mode, baseTime: new Date(baseTime) };
  });

  readonly displayedStartTime = computed(() =>
    this.selectedCompetitor()?.startTime || this.race().actualStart
  );

  readonly enteredFinishTime = toSignal(
    this.form.controls.finishTime.valueChanges.pipe(startWith(this.form.controls.finishTime.value)),
    { initialValue: null as Date | null }
  );

  readonly enteredLapsValue = toSignal(
    this.form.controls.laps.valueChanges.pipe(startWith(this.form.controls.laps.value)),
    { initialValue: 1 }
  );

  readonly calculatedStats = computed(() => {
    const startTime = this.selectedCompetitor()?.startTime || this.race().actualStart;
    const stats = this.manualResultsService.calculateStats(
      this.enteredFinishTime(),
      this.enteredLapsValue() || 1,
      startTime
    );
    if (!stats) return null;
    const selected = this.selectedCompetitor();
    const scheme = this.handicapScheme();
    const handicap = selected?.handicapForScheme(scheme);
    const correctedTime = getCorrectedTime(
      stats.elapsedSeconds,
      handicap ?? 1,
      scheme,
    );
    const rules = resolveSuspectTimeRules(this.clubStore.club().suspectTimeThresholds);
    const isSuspicious = isSuspectIncludingCorrected(
      stats.elapsedSeconds,
      stats.avgLapTime,
      scheme === 'Level Rating' ? undefined : correctedTime,
      rules,
    );
    return { ...stats, correctedTime, isSuspicious };
  });

  private readonly lastEnteredLaps = signal<number>(1);

  readonly sortedCompetitors = computed(() => {
    const raceId = this.race().id;
    const comps = this.competitors().filter(c => raceId === c.raceId);
    return [...comps].sort((a, b) => manualRaceTableSort(a, b, 'elapsedTime', 'asc'));
  });

  readonly autoCompleteGroups = computed(() => {
    const term = normaliseString(this.searchTerm());
    if (term.length === 0) return [];

    const filtered = this.sortedCompetitors().filter(c => {
      const searchStr = normaliseString(`${c.boatClass} ${c.sailNumber} ${c.helm}`);
      return searchStr.includes(term);
    });

    const toFinish = filtered.filter(c => c.resultCode === 'NOT FINISHED');
    const finished = filtered.filter(c => c.resultCode !== 'NOT FINISHED');

    const groups: { name: string; competitors: ResolvedRaceCompetitor[] }[] = [];
    if (toFinish.length > 0) groups.push({ name: 'To Finish', competitors: toFinish });
    if (finished.length > 0) groups.push({ name: 'Finished', competitors: finished });
    return groups;
  });

  constructor() {
    effect(() => {
      const comp = this.selectedCompetitor();
      untracked(() => {
        if (!comp) {
          this.searchControl.setValue(null, { emitEvent: false });
          // Reset while controls are still enabled so values/CVAs update cleanly, then disable.
          this.resetFormDefaults();
          const syncOpts = { emitEvent: true } as const;
          this.form.controls.finishTime.disable(syncOpts);
          this.form.controls.laps.disable(syncOpts);
          this.form.controls.resultCode.disable(syncOpts);
          return;
        }
        const opts = { emitEvent: true } as const;
        this.form.controls.finishTime.enable(opts);
        this.form.controls.laps.enable(opts);
        this.form.controls.resultCode.enable(opts);
        this.searchControl.setValue(comp, { emitEvent: false });
        if (comp.resultCode === 'NOT FINISHED') {
          this.resetFormDefaults();
        } else {
          this.form.reset({
            finishTime: comp.finishTime ?? null,
            laps: comp.manualLaps || 1,
            resultCode: comp.resultCode,
          } as never);
        }
      });
    });

    effect(() => {
      const race = this.race();
      untracked(() => {
        if (race && !race.actualStart) {
          void this.setStartTime(race);
        }
      });
    });

    effect(() => {
      const control = this.form.controls.finishTime;
      if (this.timeInputRequired()) {
        control.setValidators(Validators.required);
      } else {
        control.clearValidators();
      }
      untracked(() => control.updateValueAndValidity({ emitEvent: false }));
    });
  }

  resetFormDefaults(): void {
    this.form.reset({
      finishTime: null,
      laps: this.lastEnteredLaps(),
      resultCode: 'OK',
    } as never);
  }

  displayFn(comp: ResolvedRaceCompetitor): string {
    return comp ? `${comp.helm} ${comp.boatClass} ${comp.sailNumber}` : '';
  }

  onCompetitorSelected(event: MatAutocompleteSelectedEvent): void {
    void this.setSelectedCompetitor(event.option.value as ResolvedRaceCompetitor);
  }

  requestAddEntry(): void {
    this.addEntryRequested.emit();
  }

  async setSelectedCompetitor(next: ResolvedRaceCompetitor | undefined): Promise<void> {
    if (this.switchingSelection()) return;
    const current = this.selectedCompetitor();
    if (current?.id === next?.id) return;

    this.switchingSelection.set(true);
    try {
      if (current && this.form.dirty) {
        const choice = await this.dialogs.promptUnsavedChanges(
          'Unsaved edits',
          'Save your edits before switching competitor?'
        );
        if (choice === 'cancel') return;
        if (choice === 'save') {
          const saved = await this.saveCurrentSelection(false);
          if (!saved) return;
        }
      }
      this.selectedCompetitor.set(next);
    } finally {
      this.switchingSelection.set(false);
    }
  }

  async setStartTime(race: Race): Promise<RaceStartTimeResult | undefined> {
    const dialog = this.dialog.open<RaceStartTimeDialog, { race: Race }, RaceStartTimeResult>(RaceStartTimeDialog, {
      data: { race },
    });
    const result = await firstValueFrom(dialog.afterClosed());
    if (result) {
      await this.manualResultsService.setStartTime(race.id, result.starts, result.mode);
    }
    return result;
  }

  async save(): Promise<void> {
    await this.saveCurrentSelection(true);
  }

  async editSelectedCompetitor(): Promise<void> {
    const competitor = this.selectedCompetitor();
    if (!competitor) return;
    // The dialog owns the edit call so a collision error can keep it open.
    // We just wait for it to close.
    const dialogRef = this.dialog.open(EditRaceCompetitorDialog, {
      maxWidth: '100vw',
      width: 'min(calc(100vw - 24px), 460px)',
      data: { competitor },
    });
    await firstValueFrom(dialogRef.afterClosed());
  }

  private async saveCurrentSelection(clearAfterSave: boolean): Promise<boolean> {
    if (!this.hasSelectedCompetitor() || this.form.invalid) return false;
    const { finishTime, laps, resultCode } = this.form.getRawValue();
    const competitor = this.selectedCompetitor();
    if (!competitor) return false;

    const race = this.race();
    if (!race.actualStart) {
      console.error('HandicapInputPanel: save before start time set');
      await this.setStartTime(race);
      return false;
    }

    await this.manualResultsService.recordResult(competitor, race, {
      finishTime,
      laps: laps ?? 1,
      resultCode,
    });

    if (laps) this.lastEnteredLaps.set(laps);
    if (clearAfterSave) {
      this.selectedCompetitor.set(undefined);
      this.searchInput()?.nativeElement.focus();
    }
    return true;
  }
}
