import { Component } from '@angular/core';

@Component({
  selector: 'app-centered-text',
  imports: [],
  template: `
    <div class="loading-container loading-text">
      <ng-content/>
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
    }
    .loading-text {
      font-family: Roboto, "Helvetica Neue", sans-serif;
      font-size: 16px;
      color: rgba(0, 0, 0, 0.6);
      font-weight: 700;
    }
  `]
})
export class CenteredText {}