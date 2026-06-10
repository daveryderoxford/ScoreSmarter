import { Component, effect, inject, input, output, computed, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CommonModule } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { startWith } from 'rxjs';
import { ClubStore } from 'app/club-tenant';
import { RaceCalendarStore } from '../services/full-race-calander';
import { Series } from '../model/series';
import { SeriesScoringScheme, seriesScoringSchemeDetails } from 'app/scoring/model/scoring-algotirhm';
import { getConfigName, ScoringConfiguration } from 'app/scoring/model/scoring-configuration';
import { seriesEntryGroupingDetails } from 'app/scoring';
import { HANDICAP_SCHEMES, HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { Fleet, getFleetName } from 'app/club-tenant/model/fleet';
import { SubmitButton } from 'app/shared/components/submit-button';
import {
  DEFAULT_LONG_DISCARDS,
  DEFAULT_SHORT_DISCARDS,
  formatDiscardScheduleSummary,
  validateDiscardRaceSequence,
} from 'app/scoring/model/discard-profile';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';

@Component({
  selector: 'app-series-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    SubmitButton,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()" class="form-container">
      <mat-form-field>
        <mat-label>Season</mat-label>
        <mat-select formControlName="seasonId">
          @for (season of seasons(); track season.id) {
            <mat-option [value]="season.id">{{ season.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field>
        <mat-label>Series Name</mat-label>
        <input matInput formControlName="name" placeholder="e.g., Spring Series">
      </mat-form-field>

      <mat-form-field>
        <mat-label>Fleet</mat-label>
        <mat-select formControlName="fleetId">
          @for (fleet of fleets(); track fleet.id) {
            <mat-option [value]="fleet.id">{{ getFleetName(fleet) }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (showPrimaryHandicap()) {
        <mat-form-field>
          <mat-label>Handicap Scheme</mat-label>
          <mat-select formControlName="primaryHandicapScheme">
            @for (scheme of availablePrimarySchemes(); track scheme) {
              <mat-option [value]="scheme">{{ scheme }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      } @else {
        <div class="flex-row items-center" style="padding: 0 1rem; color: #666;">
          <span>Handicap Scheme: <strong>{{ form.get('primaryHandicapScheme')?.value }}</strong></span>
        </div>
      }

      <mat-checkbox formControlName="archived">Archived</mat-checkbox>

      <div class="section">
        <h3>Scoring Rules</h3>

        <mat-form-field>
          <mat-label>Scoring Scheme</mat-label>
          <mat-select formControlName="scoringAlgorithm">
            @for (scheme of scoringSchemes; track scheme.name) {
              <mat-option [value]="scheme.name">{{ scheme.displayName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <div class="discard-box">
          <p class="discard-summary">{{ discardScheduleBlurb() }}</p>
          <button matButton="outlined" type="button" (click)="editDiscardSchedule()">
            Edit discard schedule…
          </button>
        </div>

        <mat-form-field>
          <mat-label>Entry Grouping Algorithm</mat-label>
          <mat-select formControlName="entryAlgorithm">
            @for (algo of entryAlgorithms; track algo.name) {
              <mat-option [value]="algo.name">{{ algo.displayName }}</mat-option>
            }
          </mat-select>
          <mat-hint>How competitors are identified across races</mat-hint>
        </mat-form-field>
      </div>

      <div class="section">
        <h3>Additional Scoring Configurations</h3>
        <div formArrayName="secondaryScoringConfigurations">
          @for (config of secondaryConfigs.controls; track config; let i = $index) {
            <div [formGroupName]="i" class="flex-row relative items-center">
              <mat-form-field class="flex-1">
                <mat-label>Fleet</mat-label>
                <mat-select formControlName="fleetId">
                  @for (fleet of fleets(); track fleet.id) {
                    <mat-option [value]="fleet.id">{{ getFleetName(fleet) }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              @if (showSecondaryHandicap(i)) {
                <mat-form-field class="flex-1">
                  <mat-label>Handicap Scheme</mat-label>
                  <mat-select formControlName="handicapScheme">
                    @for (scheme of availableSecondarySchemes(i); track scheme) {
                      <mat-option [value]="scheme">{{ scheme }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              } @else {
                <div class="flex-1 items-center" style="padding: 0 1rem; color: #666;">
                  <span>Handicap Scheme: <strong>{{ config.get('handicapScheme')?.value }}</strong></span>
                </div>
              }

              <button mat-icon-button color="warn" type="button" (click)="removeSecondaryConfig(i)">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          }
        </div>
        <button matButton="outlined" type="button" (click)="addSecondaryConfig()">
          <mat-icon>add</mat-icon> Add Additional Scoring
        </button>
      </div>

      <div>
        <app-submit-button [disabled]="form.invalid" [busy]="busy()">Save Series</app-submit-button>
      </div>
    </form>
  `,
  styles: `
    @use "mixins" as mix;

    @include mix.form-page("form", 430px);

    .flex-row {
      display: flex;
      gap: 1rem;
    }

    .flex-1 {
      flex: 1;
    }

    .section {
      border: 1px solid #e0e0e0;
      padding: 1rem;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .relative {
      position: relative;
    }

    .discard-box {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }

    .discard-summary {
      margin: 0;
      font-size: 13px;
      color: var(--mat-sys-outline);
      line-height: 1.4;
    }
  `,
})
export class SeriesForm {
  private readonly clubStore = inject(ClubStore);
  private readonly calendarStore = inject(RaceCalendarStore);
  private readonly dialogs = inject(DialogsService);
  private readonly snackbar = inject(MatSnackBar);

  /** When editing an existing series, used to count races on the calendar. */
  private readonly calendarSeriesId = signal<string>('');

  series = input<Series | undefined>();
  busy = input<boolean>(false);

  seasons = computed(() => this.clubStore.club().seasons);
  fleets = computed(() => this.clubStore.club().fleets as unknown as Fleet[]);

  save = output<Series>();

  /**
   * Stored milestone race numbers (same as `Series.discards`). New series seeds short default triggers; editing loads from series (may be empty).
   */
  readonly seriesDiscards = signal<number[]>([...DEFAULT_SHORT_DISCARDS]);

  discardScheduleBlurb = computed(() => formatDiscardScheduleSummary(this.seriesDiscards()));

  scheduledRaceCount = computed(() => {
    const sid = this.calendarSeriesId();
    if (!sid) return 0;
    return this.calendarStore.allRaces().filter(r => r.seriesId === sid).length;
  });

  form = new FormGroup({
    id: new FormControl('', { nonNullable: true }),
    seasonId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    fleetId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    primaryHandicapScheme: new FormControl<HandicapScheme>('Level Rating', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    archived: new FormControl(false, { nonNullable: true }),
    scoringAlgorithm: new FormControl<SeriesScoringScheme>('short', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    entryAlgorithm: new FormControl('helm', { nonNullable: true, validators: [Validators.required] }),
    secondaryScoringConfigurations: new FormArray<FormGroup>([]),
  });

  scoringSchemes = seriesScoringSchemeDetails;
  entryAlgorithms = seriesEntryGroupingDetails;
  handicapSchemes = HANDICAP_SCHEMES;

  getFleetName = getFleetName;

  constructor() {
    effect(() => {
      const s = this.series();
      if (s) {
        this.calendarSeriesId.set(s.id);
        this.patchFromSeries(s);
      }
    });

    this.form
      .get('scoringAlgorithm')!
      .valueChanges.pipe(startWith(this.form.get('scoringAlgorithm')!.value), takeUntilDestroyed())
      .subscribe(algo => {
        if (this.series()) return;
        this.applyClubDefaultDiscards(algo as SeriesScoringScheme);
      });

    this.form.get('fleetId')?.valueChanges.subscribe(fleetId => {
      const available = this.getAvailableSchemes(fleetId);
      const currentScheme = this.form.get('primaryHandicapScheme')?.value;
      if (available.length === 1) {
        this.form.get('primaryHandicapScheme')?.setValue(available[0], { emitEvent: false });
      } else if (currentScheme && !available.includes(currentScheme)) {
        this.form.get('primaryHandicapScheme')?.setValue(available[0], { emitEvent: false });
      }
    });
  }

  /** Until a club admin switchboard persists per-club schedules, apps use fixed defaults from `discard-profile`. */
  private applyClubDefaultDiscards(alg: SeriesScoringScheme) {
    this.seriesDiscards.set([
      ...(alg === 'long' ? DEFAULT_LONG_DISCARDS : DEFAULT_SHORT_DISCARDS),
    ]);
  }

  private patchFromSeries(series: Series) {
    this.secondaryConfigs.clear();
    if (series.secondaryScoringConfigurations) {
      series.secondaryScoringConfigurations.forEach(config => this.addSecondaryConfig(config));
    }

    this.seriesDiscards.set([...(series.discards ?? [])]);

    this.form.patchValue({
      id: series.id,
      seasonId: series.seasonId,
      name: series.name,
      fleetId: series.primaryScoringConfiguration?.fleet.id,
      primaryHandicapScheme: series.primaryScoringConfiguration?.handicapScheme || 'Level Rating',
      archived: series.archived,
      scoringAlgorithm: series.scoringAlgorithm,
      entryAlgorithm: series.entryAlgorithm,
    });
  }

  async editDiscardSchedule(): Promise<void> {
    const name = this.form.get('name')?.value || 'Series';
    const raceCountForDialog = Math.max(
      1,
      this.seriesDiscards().length,
      this.scheduledRaceCount(),
    );
    const next = await this.dialogs.editDiscardProfile({
      title: `${name}: discard schedule`,
      raceCount: raceCountForDialog,
      discards: this.seriesDiscards(),
    });
    if (next) {
      if (validateDiscardRaceSequence(next).length > 0) {
        return;
      }
      this.seriesDiscards.set(next);
      this.form.markAsDirty();
    }
  }

  get secondaryConfigs() {
    return this.form.get('secondaryScoringConfigurations') as FormArray;
  }

  getAvailableSchemes(fleetId: string | undefined): HandicapScheme[] {
    if (!fleetId) return this.handicapSchemes as unknown as HandicapScheme[];

    const fleet = this.fleets().find(f => f.id === fleetId);
    if (!fleet) return this.handicapSchemes as unknown as HandicapScheme[];

    if (fleet.type === 'BoatClass') {
      return ['Level Rating'];
    }

    if (fleet.type === 'HandicapRange') {
      return [fleet.scheme];
    }

    const clubSchemes = this.clubStore.club().supportedHandicapSchemes || [];
    if (clubSchemes.length > 0) {
      return clubSchemes;
    }

    return this.handicapSchemes as unknown as HandicapScheme[];
  }

  showPrimaryHandicap(): boolean {
    const fleetId = this.form.get('fleetId')?.value;
    const available = this.getAvailableSchemes(fleetId);
    return available.length > 1;
  }

  showSecondaryHandicap(index: number): boolean {
    const fleetId = this.secondaryConfigs.at(index).get('fleetId')?.value;
    const available = this.getAvailableSchemes(fleetId);
    return available.length > 1;
  }

  availablePrimarySchemes(): HandicapScheme[] {
    return this.getAvailableSchemes(this.form.get('fleetId')?.value);
  }

  availableSecondarySchemes(index: number): HandicapScheme[] {
    return this.getAvailableSchemes(this.secondaryConfigs.at(index).get('fleetId')?.value);
  }

  addSecondaryConfig(config?: ScoringConfiguration) {
    const group = new FormGroup({
      id: new FormControl(config?.id || crypto.randomUUID(), { nonNullable: true, validators: [Validators.required] }),
      fleetId: new FormControl(config?.fleet?.id || '', { nonNullable: true, validators: [Validators.required] }),
      handicapScheme: new FormControl<HandicapScheme>(config?.handicapScheme || 'Level Rating', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    });

    group.get('fleetId')?.valueChanges.subscribe(fleetId => {
      const available = this.getAvailableSchemes(fleetId);
      const currentScheme = group.get('handicapScheme')?.value;
      if (available.length === 1) {
        group.get('handicapScheme')?.setValue(available[0], { emitEvent: false });
      } else if (currentScheme && !available.includes(currentScheme)) {
        group.get('handicapScheme')?.setValue(available[0], { emitEvent: false });
      }
    });

    this.secondaryConfigs.push(group);
  }

  removeSecondaryConfig(index: number) {
    this.secondaryConfigs.removeAt(index);
  }

  async onSubmit() {
    if (!this.form.valid) return;

    const triggers = this.seriesDiscards();
    const issues = validateDiscardRaceSequence(triggers);
    if (issues.length > 0) {
      const f = issues[0];
      this.snackbar.open(`Discard schedule invalid: Row ${f.raceIndex}: ${f.message}`, 'Dismiss', {
        duration: 7000,
      });
      return;
    }

    const formValue = this.form.getRawValue();

    const primaryFleet = this.fleets().find(f => f.id === formValue.fleetId);
    if (!primaryFleet) return;

    const primaryScoringConfiguration: ScoringConfiguration = {
      id: formValue.id || 'overall',
      name: getConfigName(formValue.primaryHandicapScheme, primaryFleet),
      type: primaryFleet.type === 'BoatClass' ? 'LevelRating' : 'Handicap',
      fleet: primaryFleet,
      handicapScheme: formValue.primaryHandicapScheme as any,
    };

    const secondaryScoringConfigurations: ScoringConfiguration[] = formValue.secondaryScoringConfigurations.map(
      (config: any) => {
        const fleet = this.fleets().find(f => f.id === config.fleetId);
        return {
          id: config.id,
          name: getConfigName(config.handicapScheme, fleet),
          type: fleet?.type === 'BoatClass' ? 'LevelRating' : 'Handicap',
          fleet: fleet!,
          handicapScheme: config.handicapScheme as any,
        };
      },
    );

    const payload: Series = {
      id: formValue.id,
      seasonId: formValue.seasonId,
      name: formValue.name,
      archived: formValue.archived,
      scoringAlgorithm: formValue.scoringAlgorithm,
      entryAlgorithm: formValue.entryAlgorithm as Series['entryAlgorithm'],
      discards: triggers,
      primaryScoringConfiguration,
      secondaryScoringConfigurations,
    };

    this.save.emit(payload);
    this.form.markAsPristine();
  }

  canDeactivate(): boolean {
    return !this.form.dirty;
  }
}
