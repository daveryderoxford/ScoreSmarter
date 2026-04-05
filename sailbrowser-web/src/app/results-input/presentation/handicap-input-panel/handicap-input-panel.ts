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
import { RaceCompetitor } from 'app/results-input';
import { ResultCode } from 'app/scoring/model/result-code';
import { requiresTime } from 'app/scoring/model/result-code-scoring';
import { DurationPipe } from 'app/shared/pipes/duration.pipe';
import { normaliseString } from 'app/shared/utils/string-utils';
import { firstValueFrom, map, startWith } from 'rxjs';
import { manualRaceTableSort, ManualResultsService } from '../../services/manual-results.service';
import { RaceStartTimeDialog, type RaceStartTimeResult } from '../race-start-time-dialog';
import { RaceTimeInput } from '../race-time-input';
import { ResultCodeSelector } from '../result-code-selector';

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
    ResultCodeSelector,
    DurationPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HandicapInputPanel {
  private readonly manualResultsService = inject(ManualResultsService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  race = input.required<Race>();
  competitors = input.required<RaceCompetitor[]>();

  /** Two-way bound from parent so the results table can highlight the selected row. */
  selectedCompetitor = model<RaceCompetitor | undefined>(undefined);

  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly form = this.fb.group({
    finishTime: this.fb.control<Date | null>(null, { updateOn: 'blur' }),
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

  readonly searchControl = new FormControl<string | RaceCompetitor | null>('');
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
    const baseTime = race.actualStart || new Date();
    return { mode, baseTime: new Date(baseTime) };
  });

  readonly enteredFinishTime = toSignal(
    this.form.controls.finishTime.valueChanges.pipe(startWith(this.form.controls.finishTime.value)),
    { initialValue: null as Date | null }
  );

  readonly enteredLapsValue = toSignal(
    this.form.controls.laps.valueChanges.pipe(startWith(this.form.controls.laps.value)),
    { initialValue: 1 }
  );

  readonly calculatedStats = computed(() => {
    const stats = this.manualResultsService.calculateStats(
      this.enteredFinishTime(),
      this.enteredLapsValue() || 1,
      this.race()
    );
    if (!stats) return null;
    const isSuspicious = stats.avgLapTime < 120 || stats.avgLapTime > 3600;
    return { ...stats, isSuspicious };
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

    const groups: { name: string; competitors: RaceCompetitor[] }[] = [];
    if (toFinish.length > 0) groups.push({ name: 'To Finish', competitors: toFinish });
    if (finished.length > 0) groups.push({ name: 'Finished', competitors: finished });
    return groups;
  });

  constructor() {
    effect(() => {
      const comp = this.selectedCompetitor();
      untracked(() => {
        const opts = { emitEvent: false } as const;
        if (!comp) {
          this.form.controls.finishTime.disable(opts);
          this.form.controls.laps.disable(opts);
          this.form.controls.resultCode.disable(opts);
          this.searchControl.setValue(null, { emitEvent: false });
          this.resetFormDefaults();
          return;
        }
        this.form.controls.finishTime.enable(opts);
        this.form.controls.laps.enable(opts);
        this.form.controls.resultCode.enable(opts);
        this.searchControl.setValue(comp, { emitEvent: false });
        if (comp.resultCode === 'NOT FINISHED') {
          this.resetFormDefaults();
        } else {
          this.form.reset({
            finishTime: comp.manualFinishTime,
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

  displayFn(comp: RaceCompetitor): string {
    return comp ? `${comp.helm} ${comp.boatClass} ${comp.sailNumber}` : '';
  }

  onCompetitorSelected(event: MatAutocompleteSelectedEvent): void {
    this.selectedCompetitor.set(event.option.value as RaceCompetitor);
  }

  async setStartTime(race: Race): Promise<RaceStartTimeResult | undefined> {
    const dialog = this.dialog.open<RaceStartTimeDialog, { race: Race }, RaceStartTimeResult>(RaceStartTimeDialog, {
      data: { race },
    });
    const result = await firstValueFrom(dialog.afterClosed());
    if (result) {
      await this.manualResultsService.setStartTime(race.id, result.startTime, result.mode);
    }
    return result;
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const { finishTime, laps, resultCode } = this.form.getRawValue();
    const competitor = this.selectedCompetitor();
    if (!competitor) return;

    const race = this.race();
    if (!race.actualStart) {
      console.error('HandicapInputPanel: save before start time set');
      await this.setStartTime(race);
      return;
    }

    await this.manualResultsService.recordResult(competitor, race, {
      finishTime,
      laps: laps ?? 1,
      resultCode,
    });

    if (laps) this.lastEnteredLaps.set(laps);
    this.selectedCompetitor.set(undefined);
    this.searchInput()?.nativeElement.focus();
  }
}
