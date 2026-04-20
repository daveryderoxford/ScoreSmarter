import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-submit-button',
  template: `
    <button 
    type="submit" 
    matButton="filled" 
    [disabled]="busy() || disabled()" 
    >
      @if (busy()) {
      <mat-progress-spinner diameter="24" mode="indeterminate" />
      } @else {
      <ng-content></ng-content>
      }
    </button>
  `,
  styles: [
    `

    `,
  ],
  imports: [MatButtonModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubmitButton {
  busy = input<boolean>(false);
  disabled = input<boolean>(false);
}
