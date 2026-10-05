import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { ScanSelectedRace } from '../select-race/race-selection.store';
import { ScanRunStore } from '../run-scan/scan-run.store';
import { AuthService } from 'app/auth';
import { NumberField } from 'app/shared/components/number-field/number-field';
import { SCAN_AI_KNOWN_MODELS } from '../model/scan-ai-models';

@Component({
  selector: 'app-setup-step',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatOptionModule,
    MatRadioModule,
    MatSelectModule,
    NumberField,
  ],
  templateUrl: './setup-step.html',
  styleUrl: './setup-step.scss',
})
export class SetupStep {
  protected readonly scanRun = inject(ScanRunStore);
  private readonly raceSelection = inject(ScanSelectedRace);
  protected readonly auth = inject(AuthService);

  readonly isMultilapRace = computed(() => this.raceSelection.selectedRace()?.isAverageLap ?? false);
  readonly isLevelRating = computed(() => this.raceSelection.isLevelRatingSelection());
  readonly knownModels = SCAN_AI_KNOWN_MODELS;
  private readonly modelId = toSignal(
    this.scanRun.contextForm.controls.model.valueChanges.pipe(
      startWith(this.scanRun.contextForm.controls.model.value),
    ),
    { initialValue: this.scanRun.contextForm.controls.model.value },
  );
  readonly customModelId = computed(() => {
    const id = this.modelId();
    return this.knownModels.some(m => m.id === id) ? null : id;
  });
}
