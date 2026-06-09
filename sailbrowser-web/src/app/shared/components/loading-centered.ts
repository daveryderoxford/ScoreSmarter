import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading-centered',
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="loading-container">
      <mat-spinner diameter="20" mode="indeterminate"></mat-spinner>
      <span class="loading-text">{{ message() }}</span>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      width: 100%;
      min-height: 100px;
    }
    .loading-container {
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: center;
      height: 100%;
      width: 100%;
      gap: 12px;
    }
    .loading-text {
      font-family: Roboto, "Helvetica Neue", sans-serif;
      font-size: 16px;
      color: rgba(0, 0, 0, 0.6);
      font-weight: 700;
    }
  `]
})
export class LoadingCentered {
  message = input('Loading...');
}