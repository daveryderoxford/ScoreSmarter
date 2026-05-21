import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Race } from 'app/race-calender/model/race';
import { RaceResultDraft } from 'app/results-input/model/race-result-draft';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { ResultCode } from 'app/scoring/model/result-code';
import { RaceResultDataCommand } from '../../services/race-competitor-edit.service';
import { SubmitButton } from 'app/shared/components/submit-button';
import { ResultCodeSelect } from '../result-code-select';
import { RaceTimeInput } from '../handicap/race-time-input';

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

  readonly isHandicapRace = computed(() => this.race().type === 'Handicap');

  readonly form = this.fb.group({
    startTime: new FormControl<Date | null>(null),
    manualFinishTime: new FormControl<Date | null>(null),
    manualLaps: new FormControl<number>(1, { nonNullable: true }),
    resultCode: new FormControl<ResultCode>('OK', { nonNullable: true }),
    manualPosition: new FormControl<number | null>(null),
    crew: new FormControl('', { nonNullable: true }),
  });

  readonly timeInputContext = computed(() => {
    const race = this.race();
    const mode = race.timeInputMode || 'tod';
    const baseTime =
      this.form.controls.startTime.value ??
      this.competitor().startTime ??
      race.actualStart ??
      new Date();
    return { mode, baseTime: new Date(baseTime) };
  });

  ngOnInit(): void {
    const c = this.competitor();
    const d = this.draft();
    const race = this.race();

    const crewDisplay = c.crewOverride !== undefined ? c.crewOverride : (c.entry.crew ?? '');

    this.form.patchValue({
      startTime: d?.startTime !== undefined ? d.startTime : (c.startTime ?? null),
      manualFinishTime:
        d?.finishTime !== undefined ? d.finishTime : (c.manualFinishTime ?? null),
      manualLaps: d?.laps ?? (c.manualLaps || 1),
      resultCode: d?.resultCode ?? c.resultCode,
      manualPosition:
        d?.manualPosition !== undefined ? d.manualPosition : (c.manualPosition ?? null),
      crew: d?.crewOverride !== undefined ? d.crewOverride : crewDisplay,
    });

    if (!this.isHandicapRace() && race.actualStart) {
      this.form.controls.startTime.setValue(c.startTime ?? race.actualStart);
    }
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
      cmd.startTime = v.startTime ?? undefined;
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
}
