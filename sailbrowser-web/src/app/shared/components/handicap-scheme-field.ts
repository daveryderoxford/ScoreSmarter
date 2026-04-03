import { Component, computed, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getHandicapSchemeMetadata } from 'app/scoring/model/handicap-scheme-metadata';

@Component({
  selector: 'app-handicap-scheme-field',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field>
      <mat-label>{{ meta().label }}</mat-label>
      <input
        matInput
        type="number"
        [formControl]="control()"
        [attr.min]="meta().min"
        [attr.max]="meta().max"
        [attr.step]="meta().step"
      />
      @if (control().invalid) {
        <mat-error>
          @if (control().hasError('required')) {
            {{ meta().label }} is required
          } @else if (control().hasError('min')) {
            Must be at least {{ meta().min }}
          } @else if (control().hasError('max')) {
            Must be at most {{ meta().max }}
          }
        </mat-error>
      }
    </mat-form-field>
  `,
})
export class HandicapSchemeField {
  scheme = input.required<HandicapScheme>();
  control = input.required<FormControl<number | null>>();

  readonly meta = computed(() => getHandicapSchemeMetadata(this.scheme()));
}
