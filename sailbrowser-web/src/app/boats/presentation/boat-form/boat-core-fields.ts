import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ClubStore } from 'app/club-tenant';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { HandicapSchemeInputs } from 'app/shared/components/handicap-scheme-inputs';

@Component({
  selector: 'app-boat-core-fields',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, HandicapSchemeInputs],
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
        <input matInput type="number" inputmode="numeric" pattern="[0-9]*" formControlName="sailNumber">
        <mat-error>Sail number required</mat-error>
      </mat-form-field>

      <mat-form-field>
        <mat-label>Name</mat-label>
        <input matInput formControlName="name">
      </mat-form-field>

      <mat-form-field>
        <mat-label>Normal helm</mat-label>
        <input matInput formControlName="helm">
        <mat-error>Helm name required</mat-error>
      </mat-form-field>

      <mat-form-field>
        <mat-label>Normal crew</mat-label>
        <input matInput formControlName="crew">
      </mat-form-field>

      @if (boatLevelSchemes().length > 0) {
        <app-handicap-scheme-inputs [form]="form()" [schemes]="boatLevelSchemes()" />
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoatCoreFields {
  protected readonly cs = inject(ClubStore);

  form = input.required<FormGroup>();
  boatLevelSchemes = input.required<HandicapScheme[]>();
}

