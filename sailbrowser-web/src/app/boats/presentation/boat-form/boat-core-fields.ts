import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ClubStore } from 'app/club-tenant';
import { TagValuePicker } from 'app/club-tenant/presentation/tags/tag-value-picker';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { PERSONAL_HANDICAP_BANDS } from 'app/scoring/model/personal-handicap';
import { HandicapSchemeInputs } from 'app/shared/components/handicap-scheme-inputs';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { HelmNameAutocomplete } from '../helm-name-autocomplete';
import { SailNumberInput } from '../sail-number-input';

@Component({
  selector: 'app-boat-core-fields',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatSelectModule,
    HandicapSchemeInputs,
    TagValuePicker,
    HelmNameAutocomplete,
    SailNumberInput,
  ],
  template: `
    <div [formGroup]="form()">
      <mat-form-field>
        <mat-label>Class</mat-label>
        <mat-select formControlName="boatClass">
          @for (c of cs.club().classes; track c.id) {
            <mat-option [value]="c.name">{{ c.name }}</mat-option>
          }
        </mat-select>
        <mat-error>Boat class required</mat-error>
      </mat-form-field>

      <mat-form-field>
        <mat-label>Sail number</mat-label>
        <app-sail-number-input formControlName="sailNumber" />
        <mat-error>Sail number required</mat-error>
      </mat-form-field>

      <mat-form-field>
        <mat-label>Normal helm</mat-label>
        <input
          matInput
          formControlName="helm"
          autocomplete="off"
          [matAutocomplete]="helmAutocomplete.panel()" />
        <app-helm-name-autocomplete
          #helmAutocomplete
          [control]="form().controls['helm']" />
        <mat-error>Helm name required</mat-error>
      </mat-form-field>

      @if (showCrew()) {
      <mat-form-field>
        <mat-label>Normal crew</mat-label>
        <input matInput formControlName="crew">
      </mat-form-field>
      }

      <mat-form-field>
        <mat-label>Boat Name</mat-label>
        <input matInput formControlName="name" placeholder="eg Flying Fish">
      </mat-form-field>

      @if (supportsPersonalBand()) {
        <mat-form-field>
          <mat-label>Personal handicap band</mat-label>
          <mat-select formControlName="personalHandicapBand">
            <mat-option value="unknown">Unknown / request allocation</mat-option>
            @for (band of personalBands; track band) {
              <mat-option [value]="band">{{ band }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }

      @if (nonPersonalBoatSchemes().length > 0) {
        <app-handicap-scheme-inputs [form]="form()" [schemes]="nonPersonalBoatSchemes()" />
      }

      @if (availableTags().length > 0) {
        <div class="tags-block" aria-label="Tags">
          <span class="tags-block__label">Tags</span>
          <app-tag-value-picker
            [availableTags]="availableTags()"
            formControlName="tags" />
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    mat-form-field {
      display: block;
      width: 100%;
      margin-bottom: 8px;
    }
    .tags-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
    }
    .tags-block__label {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoatCoreFields {
  protected readonly cs = inject(ClubStore);
  readonly personalBands = PERSONAL_HANDICAP_BANDS;

  form = input.required<FormGroup>();
  boatLevelSchemes = input.required<HandicapScheme[]>();
  showCrew = input(true);

  /** User-managed tag definitions exposed via the picker. */
  readonly availableTags = computed(() => this.cs.club().tagDefinitions);

  supportsPersonalBand(): boolean {
    return this.boatLevelSchemes().includes('Personal');
  }

  nonPersonalBoatSchemes(): HandicapScheme[] {
    return this.boatLevelSchemes().filter(s => s !== 'Personal');
  }
}