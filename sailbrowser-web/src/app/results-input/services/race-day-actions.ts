import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { Race } from 'app/race-calender/model/race';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import {
  CancelRacesDialog,
  type CancelRacesDialogData,
} from '../presentation/cancel-races-dialog/cancel-races-dialog';
import {
  RaceDayDetailsDialog,
  type RaceDayDetailsDialogData,
} from '../presentation/race-day-details-dialog/race-day-details-dialog';
import { RaceCancellationService } from './race-cancellation.service';

/** Race-day details, cancel and reinstate actions shared by the home, manual results and race status pages. */
@Injectable({ providedIn: 'root' })
export class RaceDayActions {
  private readonly dialog = inject(MatDialog);
  private readonly dialogs = inject(DialogsService);
  private readonly cancellation = inject(RaceCancellationService);

  /** Resolves true when the details were saved. */
  async editDayDetails(race: Race): Promise<boolean> {
    const ref = this.dialog.open<RaceDayDetailsDialog, RaceDayDetailsDialogData, boolean>(RaceDayDetailsDialog, {
      data: { race },
      width: '420px',
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }

  /** Resolves true when races were cancelled. */
  async cancelRaces(race: Race, cancelWholeDay = false): Promise<boolean> {
    const ref = this.dialog.open<CancelRacesDialog, CancelRacesDialogData, boolean>(CancelRacesDialog, {
      data: { race, cancelWholeDay },
      width: '480px',
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }

  /** Resolves true when the race was reinstated. */
  async reinstateRace(race: Race): Promise<boolean> {
    const ok = await this.dialogs.confirm(
      'Reinstate race',
      `Reinstate ${race.seriesName} race ${race.index}? It will be scored again with any results already entered.`,
    );
    if (!ok) return false;
    await this.cancellation.reinstateRace(race);
    return true;
  }
}
