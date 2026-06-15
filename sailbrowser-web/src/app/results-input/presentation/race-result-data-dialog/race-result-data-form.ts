import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { format } from 'date-fns';
import { Race } from 'app/race-calender/model/race';
import { RaceResultDraft } from 'app/results-input/model/race-result-draft';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { ResultCode } from 'app/scoring/model/result-code';
import { RaceResultDataCommand } from '../../services/race-competitor-edit.service';
import { SubmitButton } from 'app/shared/components/submit-button';
import { ResultCodeSelect } from '../result-code-select';
import { RaceTimeInput } from '../handicap/race-time-input';
import {
  formatElapsedOffsetInput,
  toElapsedOffsetMinutes,
  toStartDateFromElapsedOffset,
} from '../handicap/race-start-time-dialog';
import { startWith, map } from 'rxjs';

@Component({
  selector: 'app-race-result-data-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    SubmitButton,
    ResultCodeSelect,
    RaceTimeInput,
  ],
  templateUrl: './race-result-data-form.html',
  styleUrls: ['../_competitor-edit-form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RaceResultDataForm implements OnInit {
  readonly competitor = input.required<ResolvedRaceCompetitor>();
  readonly race = input.required<Race>();
  readonly draft = input<RaceResultDraft | undefined>();

  readonly submitCommand = output<RaceResultDataCommand>();
  readonly cancelled = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly isHandicapRace = computed(() => this.race().type === 'Handicap');

  readonly form = this.fb.group({
    startTimeInput: new FormControl<string | null>(''),
    manualFinishTime: new FormControl<Date | null>(null),
    manualLaps: new FormControl<number>(1, { nonNullable: true }),
    resultCode: new FormControl<ResultCode>('OK', { nonNullable: true }),
    manualPosition: new FormControl<number | null>(null),
    crew: new FormControl('', { nonNullable: true }),
  });

  readonly timeInputMode = computed(() => this.race().timeInputMode || 'tod');

  private readonly startTimeInputValue = toSignal(
    this.form.controls.startTimeInput.valueChanges.pipe(
      startWith(this.form.controls.startTimeInput.value),
      map(v => (v == null ? '' : String(v))),
    ),
    { initialValue: '' },
  );

  /** Effective start for finish-time validation (override, competitor, or fleet). */
  readonly finishTimeBase = computed(() => {
    const race = this.race();
    const parsed = this.parseStartTimeInput(this.startTimeInputValue());
    const base =
      parsed ??
      this.competitor().startTime ??
      race.actualStart ??
      new Date();
    return new Date(base);
  });

  ngOnInit(): void {
    const c = this.competitor();
    const d = this.draft();

    const crewDisplay = c.crewOverride !== undefined ? c.crewOverride : (c.entry.crew ?? '');
    const startDate = d?.startTime !== undefined ? d.startTime : (c.startTime ?? null);

    this.form.patchValue({
      startTimeInput: this.formatStartTimeForInput(startDate),
      manualFinishTime:
        d?.finishTime !== undefined ? d.finishTime : (c.manualFinishTime ?? null),
      manualLaps: d?.laps ?? (c.manualLaps || 1),
      resultCode: d?.resultCode ?? c.resultCode,
      manualPosition:
        d?.manualPosition !== undefined ? d.manualPosition : (c.manualPosition ?? null),
      crew: d?.crewOverride !== undefined ? d.crewOverride : crewDisplay,
    });

    this.form.controls.startTimeInput.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.form.controls.manualFinishTime.updateValueAndValidity();
      });
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const cmd: RaceResultDataCommand = {
      competitorId: this.competitor().id,
      resultCode: v.resultCode,
      crewOverride: v.crew === '' ? '' : v.crew,
    };
    if (this.isHandicapRace()) {
      cmd.startTime = this.parseStartTimeInput(v.startTimeInput) ?? undefined;
      cmd.manualFinishTime = v.manualFinishTime;
      cmd.manualLaps = v.manualLaps;
    } else {
      cmd.manualPosition = v.manualPosition;
      if (v.manualFinishTime) cmd.manualFinishTime = v.manualFinishTime;
    }
    this.submitCommand.emit(cmd);
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  private formatStartTimeForInput(date: Date | null | undefined): string {
    if (!date) return '';
    if (this.timeInputMode() === 'elapsed') {
      return formatElapsedOffsetInput(
        toElapsedOffsetMinutes(this.race().scheduledStart, date),
      );
    }
    return format(new Date(date), 'HH:mm:ss');
  }

  private parseStartTimeInput(raw: string | null | undefined): Date | null {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return null;
    if (this.timeInputMode() === 'elapsed') {
      const offsetMinutes = Number(trimmed);
      if (!Number.isFinite(offsetMinutes)) return null;
      return toStartDateFromElapsedOffset(this.race().scheduledStart, offsetMinutes);
    }
    const dateStr = new Date(this.race().scheduledStart).toDateString();
    return new Date(`${dateStr} ${trimmed}`);
  }
}
