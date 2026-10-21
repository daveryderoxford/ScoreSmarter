import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { RaceDayDutyMember } from '@shared/race-day';
import { DutiesTeamPanel } from 'app/duties/presentation/duties-team-panel';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';

@Component({
  selector: 'app-home-duties-section',
  imports: [DutiesTeamPanel],
  template: `<app-duties-team-panel (confirmed)="onDutyConfirmed($event)" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeDutiesSection {
  private readonly dialogs = inject(DialogsService);
  private readonly router = inject(Router);

  /** Same flow as the kiosk: after check-in, optionally enter the member's races as OOD. */
  async onDutyConfirmed(member: RaceDayDutyMember): Promise<void> {
    const enter = await this.dialogs.confirm(
      'Enter as OOD?',
      `Enter today's races as Officer of the Day for ${member.name}?`,
      { confirm: 'Enter as OOD', cancel: 'Not now' },
    );
    if (!enter) return;
    await this.router.navigate(['/entry/enter'], {
      queryParams: { resultCode: 'OOD', helm: member.name, returnTo: 'home' },
    });
  }
}
