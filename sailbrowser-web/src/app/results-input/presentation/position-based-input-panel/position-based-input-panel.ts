import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Race } from 'app/race-calender';
import { RaceCompetitor } from 'app/results-input';
import { ManualOrderEntry } from '../manual-order-entry/manual-order-entry';

@Component({
  selector: 'app-position-based-input-panel',
  imports: [ManualOrderEntry],
  styleUrl: './position-based-input-panel.scss',
  template: `
    <div class="fill">
      <app-manual-order-entry [race]="race()" [competitors]="competitors()" />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PositionBasedInputPanel {
  race = input.required<Race>();
  competitors = input.required<RaceCompetitor[]>();
}
