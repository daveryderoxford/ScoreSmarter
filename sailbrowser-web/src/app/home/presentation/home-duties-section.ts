import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { RaceDayDutyMember } from '@shared/race-day';
import { DutiesTeamPanel } from 'app/duties/presentation/duties-team-panel';
import { openEntryDialog } from 'app/entry/presentation/entry-dialog/entry-dialog';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-home-duties-section',
  imports: [DutiesTeamPanel],
  template: `<app-duties-team-panel (confirmed)="onDutyConfirmed($event)" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeDutiesSection {
  private readonly dialogs = inject(DialogsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly breakpoints = inject(AppBreakpoints);

  /** Same flow as the kiosk: after check-in, optionally enter the member's races as OOD. */
  async onDutyConfirmed(member: RaceDayDutyMember): Promise<void> {
    const enter = await this.dialogs.confirm(
      'Enter as OOD?',
      `Enter today's races as Officer of the Day for ${member.name}?`,
      { confirm: 'Enter as OOD', cancel: 'Not now' },
    );
    if (!enter) return;

    const dialogRef = openEntryDialog(this.dialog, { oodHelm: member.name }, this.breakpoints.isMobile());
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;
    const count = result.races.length;
    this.snackbar.open(`Entered ${count} race${count === 1 ? '' : 's'} as OOD.`, 'Dismiss', { duration: 3000 });
  }
}
