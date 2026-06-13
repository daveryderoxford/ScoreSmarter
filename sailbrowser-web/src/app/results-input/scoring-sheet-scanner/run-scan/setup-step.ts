import { Component, computed, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { RaceSelectionStore } from '../select-race/race-selection.store';
import { ScanRunStore } from '../run-scan/scan-run.store';
import { AuthService } from 'app/auth';

@Component({
  selector: 'app-setup-step',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatOptionModule,
    MatRadioModule,
    MatSelectModule,
  ],
  templateUrl: './setup-step.html',
  styleUrl: './setup-step.scss',
})
export class SetupStep {
  protected readonly scanRun = inject(ScanRunStore);
  private readonly raceSelection = inject(RaceSelectionStore);
  protected readonly auth = inject(AuthService);

  readonly isMultilapRace = computed(() => this.raceSelection.selectedRace()?.isAverageLap ?? false);
}
