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
import { DncCalculation, OODScoring, ScoringDefaults } from 'app/club-tenant/model/club';
import { HANDICAP_SCHEMES, HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { formatDiscardScheduleSummary, validateDiscardRaceSequence } from 'app/scoring/model/discard-profile';
import { MatCheckboxModule } from '@angular/material/checkbox';

/** Stored DNC rule when admin chooses “World Sailing standard”; not a separate persisted flag. */
const WORLD_SAILING_PRESET_DNC = {
  basis: 'SeriesEntries',
  offset: 1,
  excludeNeverRaced: false,
} satisfies Pick<DncCalculation, 'basis' | 'offset' | 'excludeNeverRaced'>;

@Component({
  selector: 'app-scoring-defaults',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
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
  private readonly dialogs = inject(DialogsService);
  readonly handicapSchemes = HANDICAP_SCHEMES;

  private readonly fallbackDncCalculation: DncCalculation = {
    basis: 'SeriesEntries',
    offset: 1,
    excludeNeverRaced: false,
  };

  form = this.fb.group({
    supportedHandicapSchemes: [[] as HandicapScheme[]],
    laps: [false],
    oodScoring: this.fb.group({
      calculationCode: ['AvgAll' as OODScoring['calculationCode']],
      maxDuties: [1, [Validators.min(0)]],
    }),
    longSeriesDefaults: this.fb.group({
      discards: [[] as number[]],
      dncCalculation: this.fb.group({
        basis: ['SeriesEntries'],
        offset: [1],
        excludeNeverRaced: [false],
      }),
    }),
    shortSeriesDefaults: this.fb.group({
      discards: [[] as number[]],
      dncCalculation: this.fb.group({
        basis: ['SeriesEntries'],
        offset: [1],
        excludeNeverRaced: [false],
      }),
    }),
  });

  constructor() {
    effect(() => {
      const club = this.clubStore.club();
      if (club) {
        this.form.patchValue(
          {
            supportedHandicapSchemes: club.supportedHandicapSchemes || [],
            laps: club.laps,
            oodScoring: club.oodScoring,
            longSeriesDefaults: this.normalizeDefaults(club.longSeriesDefaults),
            shortSeriesDefaults: this.normalizeDefaults(club.shortSeriesDefaults),
          },
          { emitEvent: false },
        );
      }
    });
  }

  private normalizeDefaults(defaults: ScoringDefaults | undefined): ScoringDefaults {
    const dncCalculation = defaults?.dncCalculation;
    const normalizedDnc: DncCalculation = {
      ...this.fallbackDncCalculation,
      ...(dncCalculation && typeof dncCalculation === 'object' ? dncCalculation : {}),
    };

    return {
      discards: [...(defaults?.discards ?? [])],
      dncCalculation: normalizedDnc,
    };
  }

  /** True when stored DNC equals the usual World Sailing preset (basis + offset + exclude flag only). */
  isWorldSailingPreset(seriesType: 'long' | 'short'): boolean {
    const dnc =
      seriesType === 'long'
        ? this.form.value.longSeriesDefaults?.dncCalculation
        : this.form.value.shortSeriesDefaults?.dncCalculation;
    return (
      dnc?.basis === WORLD_SAILING_PRESET_DNC.basis &&
      dnc?.offset === WORLD_SAILING_PRESET_DNC.offset &&
      !!dnc?.excludeNeverRaced === WORLD_SAILING_PRESET_DNC.excludeNeverRaced
    );
  }

  /** UI only: enabling applies the preset; disabling only reveals custom fields (values unchanged). */
  setWorldSailingPresetMode(seriesType: 'long' | 'short', enabled: boolean): void {
    if (!enabled) {
      return;
    }
    const key = seriesType === 'long' ? 'longSeriesDefaults' : 'shortSeriesDefaults';
    this.form.patchValue({
      [key]: { dncCalculation: { ...WORLD_SAILING_PRESET_DNC } },
    });
    this.form.markAsDirty();
  }

  isMaxRaceBasis(seriesType: 'long' | 'short'): boolean {
    const defaults =
      seriesType === 'long' ? this.form.value.longSeriesDefaults : this.form.value.shortSeriesDefaults;
    return defaults?.dncCalculation?.basis === 'MaxRaceCompetitors';
  }

  discardSummary(seriesType: 'long' | 'short'): string {
    const defaults =
      seriesType === 'long' ? this.form.value.longSeriesDefaults : this.form.value.shortSeriesDefaults;
    return formatDiscardScheduleSummary(defaults?.discards ?? []);
  }

  private discardRaceCountForDialog(seriesType: 'long' | 'short'): number {
    const defaults =
      seriesType === 'long' ? this.form.value.longSeriesDefaults : this.form.value.shortSeriesDefaults;
    const discards = defaults?.discards ?? [];
    const maxTrigger = discards.length > 0 ? Math.max(...discards) : 0;
    return Math.max(12, discards.length * 2, maxTrigger + 3);
  }

  async editDiscards(seriesType: 'long' | 'short'): Promise<void> {
    const defaults =
      seriesType === 'long' ? this.form.value.longSeriesDefaults : this.form.value.shortSeriesDefaults;
    const currentDiscards = defaults?.discards ?? [];

    const next = await this.dialogs.editDiscardProfile({
      title: `${seriesType === 'long' ? 'Long' : 'Short'} series default discard schedule`,
      raceCount: this.discardRaceCountForDialog(seriesType),
      discards: currentDiscards,
    });

    if (!next || validateDiscardRaceSequence(next).length > 0) {
      return;
    }

    if (seriesType === 'long') {
      this.form.patchValue({ longSeriesDefaults: { discards: next } });
    } else {
      this.form.patchValue({ shortSeriesDefaults: { discards: next } });
    }
    this.form.markAsDirty();
  }

  async save() {
    if (this.form.valid) {
      const v = this.form.getRawValue();
      const ood = v.oodScoring;

      await this.clubStore.update({
        supportedHandicapSchemes: v.supportedHandicapSchemes ?? [],
        laps: v.laps ?? false,
        oodScoring: {
          calculationCode: (ood?.calculationCode ?? 'AvgAll') as OODScoring['calculationCode'],
          maxDuties: ood?.maxDuties ?? 1,
        },
        longSeriesDefaults: {
          discards: v.longSeriesDefaults.discards ?? [],
          dncCalculation: this.coerceDnc(v.longSeriesDefaults.dncCalculation),
        },
        shortSeriesDefaults: {
          discards: v.shortSeriesDefaults.discards ?? [],
          dncCalculation: this.coerceDnc(v.shortSeriesDefaults.dncCalculation),
        },
      });
      this.form.markAsPristine();
    }
  }

  private coerceDnc(raw: Partial<Record<keyof DncCalculation, unknown>> | null | undefined): DncCalculation {
    const basis = raw?.basis;
    return {
      basis:
        basis === 'MaxRaceCompetitors' || basis === 'SeriesEntries'
          ? basis
          : this.fallbackDncCalculation.basis,
      offset: typeof raw?.offset === 'number' ? raw.offset : this.fallbackDncCalculation.offset,
      excludeNeverRaced: !!(raw?.excludeNeverRaced ?? this.fallbackDncCalculation.excludeNeverRaced),
    };
  }

  canDeactivate(): boolean {
    return !this.form.dirty;
  }
}
