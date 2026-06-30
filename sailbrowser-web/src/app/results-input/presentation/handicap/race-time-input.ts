import { Component, computed, DestroyRef, ElementRef, forwardRef, inject, input, OnInit, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, NG_VALIDATORS, NG_VALUE_ACCESSOR, ReactiveFormsModule, ValidationErrors, Validator } from '@angular/forms';
import { MatFormFieldControl } from '@angular/material/form-field';
import { FormFieldBase } from 'app/shared/components/form-field.base';
import { TimeInput } from 'app/shared/components/time-input/time-input';
import { dateAtSecondsOfDay, secondsSinceStartOfDay } from 'app/shared/utils/time-utils';
import { merge, of } from 'rxjs';

/**
 * Outer `MatFormFieldControl` that validates handicap finish/start times against a reference
 * time while delegating entry to the date-agnostic `app-time-input` (which emits seconds).
 *
 * It still exposes a `Date` to consumers. Seconds are composed into a `Date` relative to the
 * relevant day: `baseTime` for clock (`tod`) entry, `scheduledStart` for elapsed entry.
 */
@Component({
  selector: 'app-race-time-input',
  standalone: true,
  imports: [ReactiveFormsModule, TimeInput],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RaceTimeInput),
      multi: true
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => RaceTimeInput),
      multi: true,
    },
    {
      provide: MatFormFieldControl,
      useExisting: forwardRef(() => RaceTimeInput)
    }
  ],
  template: `
    <app-time-input #inner [formControl]="inputControl" [format]="innerFormat()" />
  `,
  styles: [`
    :host { display: block; }
  `],
  host: {
    '[class.floating]': 'shouldLabelFloat',
    '[id]': 'id',
    '(focusin)': 'onFocus()',
    '(focusout)': 'onFocusOut($event)',
  }
})
export class RaceTimeInput extends FormFieldBase<Date> implements Validator, OnInit {
  private readonly destroyRef = inject(DestroyRef);

  // --- Component-specific properties ---
  mode = input.required<'tod' | 'elapsed' | undefined>();
  baseTime = input.required<Date>(); // Reference time: Race Date (TOD) or Start Time (Elapsed)
  scheduledStart = input.required<Date>();
  /** When false, skip "must be after baseTime" validation (e.g. editable start time). */
  validateGreaterThanBase = input(true);

  readonly innerFormat = computed(() => (this.mode() === 'elapsed' ? 'mss' : 'hms'));
  inputControl = new FormControl<number | null>(null);

  private readonly inner = viewChild<TimeInput>('inner');

  /** Move focus to the time field (e.g. Tab from competitor search). */
  focusInput(): void {
    if (this.disabled) return;
    this.inner()?.focusInput();
  }

  // --- Overrides for FormFieldBase ---
  override controlType = 'app-race-time-input';

  /**
   * MatFormField applies `mat-form-field-disabled` from MatFormFieldControl.disabled, not from the
   * reactive FormControl alone. Delegate to the bound control when present so the outline grays out.
   */
  override get disabled(): boolean {
    const c = this.ngControl?.control;
    return c ? c.disabled : super.disabled;
  }

  override set disabled(value: boolean) {
    this.applyDisabledFromParent(value);
  }

  override get empty(): boolean {
    return this.inputControl.value == null;
  }

  // --- Lifecycle & ControlValueAccessor ---
  constructor() {
    super(inject(ElementRef));

    this.inputControl.valueChanges.subscribe(seconds => {
      this.value = this.secondsToDate(seconds);
      this._onChange(this.value);
    });
  }

  override ngOnInit(): void {
    super.ngOnInit();
    const ctrl = this.ngControl?.control;
    if (!ctrl) return;

    // Parent FormControl.disable({ emitEvent: false }) does not notify the CVA; keep the inner
    // input and MatFormFieldControl.disabled aligned with the real control state.
    merge(of(undefined), ctrl.statusChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // Compare inner FormControl — host `disabled` getter follows `ctrl.disabled`, so use inputControl here.
        if (ctrl.disabled !== this.inputControl.disabled) {
          this.applyDisabledFromParent(ctrl.disabled);
        }
      });
  }

  /** Mirror the host blur so the label floats while editing and `touched` propagates. */
  onFocusOut(event: FocusEvent): void {
    if (!this._elementRef.nativeElement.contains(event.relatedTarget as Node | null)) {
      this.onBlur();
    }
  }

  /** Sets host + inner input disabled without re-entering FormControl APIs. */
  private applyDisabledFromParent(disabled: boolean): void {
    super.disabled = disabled;
    if (disabled) {
      this.inputControl.disable({ emitEvent: false });
    } else {
      this.inputControl.enable({ emitEvent: false });
    }
    this.stateChanges.next();
  }

  override writeValue(value: Date | null): void {
    super.writeValue(value); // Let base class store the value
    if (!value) {
      this.inputControl.setValue(null, { emitEvent: false });
      return;
    }
    this.inputControl.setValue(this.dateToSeconds(value), { emitEvent: false });
  }

  // --- Validator implementation ---
  validate(control: AbstractControl): ValidationErrors | null {
    if (!this.validateGreaterThanBase()) return null;

    const value = control.value as Date | null;
    const base = this.baseTime();
    if (!value || !base) return null;

    if (value <= base) {
      return this.mode() === 'tod'
        ? { timeGreaterThan: { baseTime: base, actualTime: value } }
        : { positiveDuration: true };
    }
    return null;
  }

  // --- Private helpers ---
  /** Reference day used to compose/decompose seconds for the current mode. */
  private referenceDay(): Date {
    return this.mode() === 'elapsed' ? this.scheduledStart() : this.baseTime();
  }

  private secondsToDate(seconds: number | null): Date | null {
    if (seconds == null) return null;
    return dateAtSecondsOfDay(this.referenceDay(), seconds);
  }

  private dateToSeconds(value: Date): number {
    return secondsSinceStartOfDay(value, this.referenceDay());
  }
}
