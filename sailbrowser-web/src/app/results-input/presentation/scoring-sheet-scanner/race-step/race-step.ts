import { Component, input, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-race-step',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatOptionModule,
    MatSelectModule,
  ],
  template: `
    <mat-card appearance="outlined" class="form-card">
      <form [formGroup]="form()">
        <mat-form-field>
          <mat-label>Select race</mat-label>
          <mat-select formControlName="raceId" required (selectionChange)="raceSelect.emit($event)">
            @if (todaysRaceOptions().length) {
              @for (opt of todaysRaceOptions(); track opt.id) {
                <mat-option [value]="opt.id">{{ opt.label }}</mat-option>
              }
            }
            @if (pickedRaceOption(); as pickedOpt) {
              <mat-option [value]="pickedOpt.id">{{ pickedOpt.label }}</mat-option>
            }
            <mat-option value="__MORE__">More races...</mat-option>
          </mat-select>
        </mat-form-field>

        @if (selectedRaceSummary(); as summary) {
          <div class="race-summary">
            <div class="race-summary-title">{{ summary.title }}</div>
            <div class="race-summary-meta">
              @for (item of summary.meta; track item) {
                <span>{{ item }}</span>
              }
            </div>
          </div>
        }
      </form>
    </mat-card>
  `,
  styleUrl: './race-step.scss',
})
export class RaceStep {
  form = input.required<FormGroup>();
  todaysRaceOptions = input.required<{ id: string; label: string }[]>();
  pickedRaceOption = input<{ id: string; label: string } | null>(null);
  selectedRaceSummary = input<{ title: string; meta: string[] } | null>(null);
  raceSelect = output<MatSelectChange>();
}

