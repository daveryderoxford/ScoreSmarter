import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { handicapControlName } from 'app/scoring/model/handicap-scheme-metadata';
import { HandicapSchemeField } from './handicap-scheme-field';

@Component({
  selector: 'app-handicap-scheme-inputs',
  standalone: true,
  imports: [ReactiveFormsModule, HandicapSchemeField],
  template: `
    <div [formGroup]="form()">
      @for (scheme of schemes(); track scheme) {
        <app-handicap-scheme-field
          [scheme]="scheme"
          [control]="controlFor(scheme)"
        />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HandicapSchemeInputs {
  form = input.required<FormGroup>();
  schemes = input.required<HandicapScheme[]>();

  controlFor(scheme: HandicapScheme): FormControl<number | null> {
    const name = handicapControlName(scheme);
    const c = this.form().get(name);
    if (!c) {
      throw new Error(
        `HandicapSchemeInputs: form is missing control "${name}" for scheme "${scheme}". ` +
          'Add the control to the parent FormGroup or remove the scheme from [schemes].'
      );
    }
    return c as FormControl<number | null>;
  }
}

