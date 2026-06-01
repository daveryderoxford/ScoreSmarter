import {
  Component,
  DestroyRef,
  ElementRef,
  forwardRef,
  inject,
  OnInit,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { MatFormFieldControl, MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { isValidSailNumber, normalizeSailNumber } from 'app/boats/model/sail-number';
import { FormFieldBase } from 'app/shared/components/form-field.base';

@Component({
  selector: 'app-sail-number-input',
  standalone: true,
  imports: [MatInputModule, ReactiveFormsModule, MatFormFieldModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SailNumberInput),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => SailNumberInput),
      multi: true,
    },
    {
      provide: MatFormFieldControl,
      useExisting: forwardRef(() => SailNumberInput),
    },
  ],
  template: `
    <input
      #nativeInput
      matInput
      type="text"
      autocapitalize="characters"
      spellcheck="false"
      [formControl]="inputControl"
      (blur)="onBlurCommit()"
      (focus)="onFocus()">
  `,
  host: {
    '[class.floating]': 'shouldLabelFloat',
    '[id]': 'id',
  },
})
export class SailNumberInput extends FormFieldBase<string> implements Validator, OnInit {
  private readonly destroyRef = inject(DestroyRef);
  readonly controlType = 'app-sail-number-input';
  inputControl = new FormControl<string>('', { nonNullable: true });
  private readonly nativeInput = viewChild<ElementRef<HTMLInputElement>>('nativeInput');

  override get empty(): boolean {
    return !this.inputControl.value;
  }

  override ngOnInit(): void {
    super.ngOnInit();
    this.inputControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => {
        this.value = v;
        this._onChange(v);
      });
    this.inputControl.statusChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.stateChanges.next());
  }

  override writeValue(value: string | null): void {
    super.writeValue(value);
    this.inputControl.setValue(value ?? '', { emitEvent: false });
  }

  override setDisabledState(isDisabled: boolean): void {
    super.setDisabledState?.(isDisabled);
    if (isDisabled) {
      this.inputControl.disable({ emitEvent: false });
    } else {
      this.inputControl.enable({ emitEvent: false });
    }
  }

  validate(): ValidationErrors | null {
    return isValidSailNumber(this.inputControl.value) ? null : { sailNumber: true };
  }

  onBlurCommit(): void {
    const normalized = normalizeSailNumber(this.inputControl.value);
    if (normalized !== this.inputControl.value) {
      this.inputControl.setValue(normalized, { emitEvent: true });
    }
    this.onBlur();
  }

  focusInput(): void {
    this.nativeInput()?.nativeElement?.focus();
  }
}
