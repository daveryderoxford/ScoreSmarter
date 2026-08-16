import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DutiesTeamPanel } from 'app/duties/presentation/duties-team-panel';

@Component({
  selector: 'app-home-duties-section',
  imports: [DutiesTeamPanel],
  template: `<app-duties-team-panel />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeDutiesSection {}
