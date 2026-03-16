import { ChangeDetectionStrategy, Component, computed, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { RESULT_CODE_DEFINITIONS, ResultCode, getResultCodeDefinition } from 'app/scoring/model/result-code';

@Component({
  selector: 'app-result-code-selector',
  template: `
    <mat-form-field appearance="outline" class="w-full">
      <mat-label>Result Code</mat-label>
      <mat-select [value]="value()" (selectionChange)="onSelectionChange($event.value)">
        @for (code of resultCodes; track code.id) {
          <mat-option [value]="code.id">{{ code.id }}</mat-option>
        }
      </mat-select>
      <mat-hint>{{ description() }}</mat-hint>
    </mat-form-field>
  `,
  styles: [`
    .w-full { width: 100%; }
  `],
  imports: [MatFormFieldModule, MatSelectModule, ReactiveFormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ResultCodeSelector),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultCodeSelector implements ControlValueAccessor {
  readonly resultCodes = RESULT_CODE_DEFINITIONS.filter(c => c.id !== 'NOT FINISHED');
  
  readonly value = signal<ResultCode>('OK');
  readonly description = computed(() => getResultCodeDefinition(this.value())?.description);

  private onChange: (value: ResultCode) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: ResultCode): void {
    this.value.set(value || 'OK');
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  onSelectionChange(value: ResultCode) {
    this.value.set(value);
    this.onChange(value);
    this.onTouched();
  }
}
