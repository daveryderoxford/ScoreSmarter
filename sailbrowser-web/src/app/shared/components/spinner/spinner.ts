import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';


@Component({
    selector: 'app-spinner',
    template: `
     @if (loading()) {
       <div class="loading-spinner">
         <mat-spinner mode="indeterminate" color="accent" diameter="40"  />
       </div>
     }
     `,
    styleUrls: ['./spinner.scss'],
    imports: [MatProgressSpinnerModule]
})
export class SpinnerComponent {

  loading = input(false);
}
