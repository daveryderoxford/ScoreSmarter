import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-delete-button',
  template: `
    <button
      type="button"
      matButton="tonal"
      [disabled]="busy() || disabled()"
      (click)="$event.stopPropagation(); delete.emit()"
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
export class DeleteButton {
  busy = input<boolean>(false);
  disabled = input<boolean>(false);
  delete = output();
}
