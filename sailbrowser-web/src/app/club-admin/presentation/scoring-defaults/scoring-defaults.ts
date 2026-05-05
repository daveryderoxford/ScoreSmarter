import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatListModule } from '@angular/material/list';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { Toolbar } from 'app/shared/components/toolbar';
import { ClubStore } from 'app/club-tenant/services/club-store';
import { HANDICAP_SCHEMES, HandicapScheme } from 'app/scoring/model/handicap-scheme';

@Component({
  selector: 'app-scoring-defaults',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatListModule,
    MatTabsModule,
    MatIconModule,
    Toolbar
  ],
  templateUrl: './scoring-defaults.html',
  styleUrl: './scoring-defaults.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoringDefaultsComponent {
  private fb = inject(FormBuilder);
  readonly clubStore = inject(ClubStore);
  readonly handicapSchemes = HANDICAP_SCHEMES;

  form = this.fb.group({
    supportedHandicapSchemes: [[] as HandicapScheme[]],
    longSeriesDefaults: this.fb.group({
      discards: [[] as number[]],
      dncCalculation: ['SeriesEntries'],
      oodScoring: this.fb.group({
        calculationCode: ['AvgAll'],
        maxDuties: [1, [Validators.min(0)]],
      }),
      laps: [false],
    }),
    shortSeriesDefaults: this.fb.group({
      discards: [[] as number[]],
      dncCalculation: ['SeriesEntries'],
      oodScoring: this.fb.group({
        calculationCode: ['AvgAll'],
        maxDuties: [1, [Validators.min(0)]],
      }),
      laps: [false],
    }),
  });

  constructor() {
    effect(() => {
      const club = this.clubStore.club();
      if (club) {
        this.form.patchValue({
          supportedHandicapSchemes: club.supportedHandicapSchemes || [],
          longSeriesDefaults: club.longSeriesDefaults || { discards: [], laps: false, dncCalculation: 'SeriesEntries', oodScoring: { calculationCode: 'AvgAll', maxDuties: 1 } },
          shortSeriesDefaults: club.shortSeriesDefaults || { discards: [], laps: false, dncCalculation: 'SeriesEntries', oodScoring: { calculationCode: 'AvgAll', maxDuties: 1 } },
        }, { emitEvent: false });
      }
    });
  }

  // Placeholder for dialog edit
  editDiscards(seriesType: 'long' | 'short') {
    console.log(`Edit discards for ${seriesType} series - To be implemented`);
  }

  async save() {
    if (this.form.valid) {
      await this.clubStore.update(this.form.value as any);
      this.form.markAsPristine();
    }
  }
}
