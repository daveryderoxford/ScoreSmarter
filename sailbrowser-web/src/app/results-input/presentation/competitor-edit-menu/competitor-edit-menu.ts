import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Race } from 'app/race-calender';
import { RaceResultDraft } from 'app/results-input/model/race-result-draft';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { firstValueFrom } from 'rxjs';
import { RaceCompetitorEditService } from '../../services/race-competitor-edit.service';
import {
  ChangeEnteredCompetitorDialog,
  ChangeEnteredCompetitorDialogData,
} from '../change-entered-competitor-dialog/change-entered-competitor-dialog';
import {
  RaceResultDataDialog,
  RaceResultDataDialogData,
} from '../race-result-data-dialog/race-result-data-dialog';
import { SeriesEditDialog, SeriesEditDialogData } from '../series-edit-dialog/series-edit-dialog';


const DIALOG_WIDTH = 'min(calc(100vw - 24px), 460px)';

@Component({
  selector: 'app-competitor-edit-menu',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, NgTemplateOutlet],
  templateUrl: './competitor-edit-menu.html',
  styleUrl: './competitor-edit-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompetitorEditMenuComponent {
  readonly competitor = input.required<ResolvedRaceCompetitor>();
  readonly race = input.required<Race>();
  readonly resultDraft = input<RaceResultDraft | undefined>();
  /** `button` = standalone trigger; `menuItems` = embed items in a parent mat-menu. */
  readonly variant = input<'button' | 'menuItems'>('button');
  readonly triggerLabel = input('Edit Entry');
  readonly disabled = input(false);

  readonly changed = output<void>();
  readonly deleted = output<void>();

  private readonly dialog = inject(MatDialog);
  private readonly dialogs = inject(DialogsService);
  private readonly editService = inject(RaceCompetitorEditService);

  async openChangeCompetitor(): Promise<void> {
    const ref = this.dialog.open<
      ChangeEnteredCompetitorDialog,
      ChangeEnteredCompetitorDialogData,
      boolean | undefined
    >(ChangeEnteredCompetitorDialog, {
      maxWidth: '100vw',
      maxHeight: '90vh',
      width: DIALOG_WIDTH,
      data: { competitor: this.competitor() },
    });
    if (await firstValueFrom(ref.afterClosed())) this.changed.emit();
  }

  async openRaceResultData(): Promise<void> {
    const ref = this.dialog.open<
      RaceResultDataDialog,
      RaceResultDataDialogData,
      boolean | undefined
    >(RaceResultDataDialog, {
      maxWidth: '100vw',
      maxHeight: '90vh',
      width: DIALOG_WIDTH,
      data: {
        competitor: this.competitor(),
        race: this.race(),
        draft: this.resultDraft(),
      },
    });
    if (await firstValueFrom(ref.afterClosed())) this.changed.emit();
  }

  async openSeriesTypo(): Promise<void> {
    const ref = this.dialog.open<
      SeriesEditDialog,
      SeriesEditDialogData,
      boolean | undefined
    >(SeriesEditDialog, {
      maxWidth: '100vw',
      maxHeight: '90vh',
      width: DIALOG_WIDTH,
      data: { competitor: this.competitor() },
    });
    if (await firstValueFrom(ref.afterClosed())) this.changed.emit();
  }

  async confirmDelete(): Promise<void> {
    const c = this.competitor();
    const ok = await this.dialogs.confirm(
      'Delete competitor',
      `Remove ${c.helm} from this race?`,
    );
    if (!ok) return;
    await this.editService.deleteRaceCompetitor(c.id);
    this.deleted.emit();
  }
}
