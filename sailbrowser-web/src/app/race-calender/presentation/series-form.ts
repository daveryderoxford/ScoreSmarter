import { Component, inject, input, output, computed, effect } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CommonModule } from '@angular/common';
import { ClubStore } from 'app/club-tenant';
import { Series } from '../model/series';
import { SeriesScoringScheme, seriesScoringSchemeDetails } from 'app/scoring/model/scoring-algotirhm';
import { getConfigName, ScoringConfiguration } from 'app/scoring/model/scoring-configuration';
import { seriesEntryGroupingDetails } from 'app/scoring';
import { HANDICAP_SCHEMES, HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { Fleet, getFleetName } from 'app/club-tenant/model/fleet';
import { SubmitButton } from 'app/shared/components/submit-button';

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
    SubmitButton
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

        <div class="flex-row">
          <mat-form-field class="flex-1">
            <mat-label>Initial Discard After</mat-label>
            <input matInput type="number" formControlName="initialDiscardAfter">
            <mat-hint>Number of races</mat-hint>
          </mat-form-field>

          <mat-form-field class="flex-1">
            <mat-label>Subsequent Discards Every N</mat-label>
            <input matInput type="number" formControlName="subsequentDiscardsEveryN">
            <mat-hint>Races after initial</mat-hint>
          </mat-form-field>
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
              <mat-form-field  class="flex-1">
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
        <button mat-stroked-button type="button" (click)="addSecondaryConfig()">
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
  `
})
export class SeriesForm {
   private clubStore = inject(ClubStore);

   series = input<Series | undefined>();
   busy = input<boolean>(false);

   seasons = computed(() => this.clubStore.club().seasons);
   // Assuming clubStore.club().fleets is now an array of the new Fleet type
   fleets = computed(() => this.clubStore.club().fleets as unknown as Fleet[]);

   save = output<Series>();

   form = new FormGroup({
      id: new FormControl('', { nonNullable: true }),
      seasonId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      fleetId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      primaryHandicapScheme: new FormControl<HandicapScheme>('Level Rating', { nonNullable: true, validators: [Validators.required] }),
      archived: new FormControl(false, { nonNullable: true }),
      scoringAlgorithm: new FormControl<SeriesScoringScheme>('short', { nonNullable: true, validators: [Validators.required] }),
      entryAlgorithm: new FormControl('helm', { nonNullable: true, validators: [Validators.required] }),
      initialDiscardAfter: new FormControl(4, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
      subsequentDiscardsEveryN: new FormControl(3, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
      secondaryScoringConfigurations: new FormArray<FormGroup>([])
   });

   scoringSchemes = seriesScoringSchemeDetails;
   entryAlgorithms = seriesEntryGroupingDetails;
   handicapSchemes = HANDICAP_SCHEMES;

   getFleetName = getFleetName;

   constructor() {
      effect(() => {
         const s = this.series();
         if (s) {
            this.setSeries(s);
         }
      });

      // Monitor primary fleet changes to update handicap scheme
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

      // For 'All' or 'Tag' fleets, return club supported schemes or all
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
         handicapScheme: new FormControl<HandicapScheme>(config?.handicapScheme || 'Level Rating', { nonNullable: true, validators: [Validators.required] })
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

   setSeries(series: Series) {
      this.secondaryConfigs.clear();
      if (series.secondaryScoringConfigurations) {
         series.secondaryScoringConfigurations.forEach(config => this.addSecondaryConfig(config));
      }

      this.form.patchValue({
         id: series.id,
         seasonId: series.seasonId,
         name: series.name,
         fleetId: series.primaryScoringConfiguration?.fleet.id,
         primaryHandicapScheme: series.primaryScoringConfiguration?.handicapScheme || 'Level Rating',
         archived: series.archived,
         scoringAlgorithm: series.scoringAlgorithm,
         entryAlgorithm: series.entryAlgorithm,
         initialDiscardAfter: series.initialDiscardAfter,
         subsequentDiscardsEveryN: series.subsequentDiscardsEveryN
      });
   }

   onSubmit() {
      if (this.form.valid) {
         const formValue = this.form.getRawValue();
         
         const primaryFleet = this.fleets().find(f => f.id === formValue.fleetId);
         if (!primaryFleet) return;
         
         const primaryScoringConfiguration: ScoringConfiguration = {
            id: formValue.id || 'overall',
            name: getConfigName(primaryFleet, formValue.primaryHandicapScheme),
            type: primaryFleet.type === 'BoatClass' ? 'LevelRating' : 'Handicap',
            fleet: primaryFleet,
            handicapScheme: formValue.primaryHandicapScheme as any
         };

         const secondaryScoringConfigurations: ScoringConfiguration[] = formValue.secondaryScoringConfigurations.map((config: any) => {
            const fleet = this.fleets().find(f => f.id === config.fleetId);
            return {
               id: config.id,
              name: fleet ? getConfigName(fleet, config.handicapScheme) : 'Secondary',
               type: fleet?.type === 'BoatClass' ? 'LevelRating' : 'Handicap',
               fleet: fleet!,
               handicapScheme: config.handicapScheme as any
            };
         });

         const series: Series = {
            id: formValue.id,
            seasonId: formValue.seasonId,
            name: formValue.name,
            archived: formValue.archived,
            scoringAlgorithm: formValue.scoringAlgorithm,
            entryAlgorithm: formValue.entryAlgorithm,
            initialDiscardAfter: formValue.initialDiscardAfter,
            subsequentDiscardsEveryN: formValue.subsequentDiscardsEveryN,
            primaryScoringConfiguration,
            secondaryScoringConfigurations
         };

         this.save.emit(series);
         this.form.markAsPristine();
      }
   }

   canDeactivate(): boolean {
      return !this.form.dirty;
   }
}


