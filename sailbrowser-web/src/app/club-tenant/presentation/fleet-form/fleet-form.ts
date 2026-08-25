import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SubmitButton } from 'app/shared/components/submit-button';
import { Fleet } from 'app/club-tenant/model/fleet';
import { ClubStore } from 'app/club-tenant';
import { HANDICAP_SCHEMES, HandicapScheme } from 'app/scoring/model/handicap-scheme';

@Component({
  selector: 'app-fleet-form',
  templateUrl: './fleet-form.html',
  styles: `
    @use "mixins" as mix;

    @include mix.form-page("form", 350px);

    .form-group-section {
      display: contents;
    }

    .system-fleet-notice {
      padding: 1rem;
      margin-bottom: 1rem;
      background-color: #f5f5f5;
      color: #666;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  `,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule, SubmitButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FleetForm {

  protected cs = inject(ClubStore);

  fleet = input<Fleet | undefined>();

  handicapSchemes = HANDICAP_SCHEMES;

  busy = input<boolean>(false);
  submitted = output<Partial<Fleet>>();

  form = new FormGroup({
    name: new FormControl<string>('', { nonNullable: true }),
    type: new FormControl<'BoatClass' | 'HandicapRange'>('HandicapRange', { validators: [Validators.required], nonNullable: true }),
    boatClassId: new FormControl<string>('', { nonNullable: true }),
    min: new FormControl<number | null>(null),
    max: new FormControl<number | null>(null),
    scheme: new FormControl<HandicapScheme | null>(null),
  });

  constructor() {
    this.form.controls.type.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(type => this.updateValidators(type));

    this.updateValidators(this.form.controls.type.value);

    effect(() => {
      const f = this.fleet();
      if (f && f.type !== 'GeneralHandicap') {
        this.form.patchValue({
          type: f.type,
          name: 'name' in f ? f.name : '',
          boatClassId: f.type === 'BoatClass' ? f.boatClassId : '',
          min: f.type === 'HandicapRange' ? f.min : null,
          max: f.type === 'HandicapRange' ? f.max : null,
          scheme: f.type === 'HandicapRange' ? f.scheme : null,
        });
      }
    });
  }

  private updateValidators(type: 'BoatClass' | 'HandicapRange') {
    const { name, boatClassId, min, max, scheme } = this.form.controls;

    name.disable();
    boatClassId.disable();
    min.disable();
    max.disable();
    scheme.disable();

    if (type === 'BoatClass') {
      boatClassId.enable();
      boatClassId.setValidators(Validators.required);
    } else if (type === 'HandicapRange') {
      name.enable();
      min.enable();
      max.enable();
      scheme.enable();
      name.setValidators(Validators.required);
      min.setValidators(Validators.required);
      max.setValidators(Validators.required);
      scheme.setValidators(Validators.required);
    }

    this.form.updateValueAndValidity();
  }

  submit() {
    if (this.form.invalid) return;

    const raw = this.form.getRawValue();
    let output: Partial<Fleet>;

    switch (raw.type) {
      case 'BoatClass':
        output = {
          type: 'BoatClass',
          boatClassId: raw.boatClassId,
        };
        break;
      case 'HandicapRange':
        output = {
          type: 'HandicapRange',
          name: raw.name,
          min: raw.min ?? 0,
          max: raw.max ?? 2000,
          scheme: raw.scheme as HandicapScheme,
        };
        break;
      default:
        return;
    }

    this.submitted.emit(output);
    this.form.reset();
  }

  public canDeactivate(): boolean {
    return !this.form.dirty;
  }
}
