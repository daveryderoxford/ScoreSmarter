import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { ListPane } from 'app/shared/layout/list-pane';
import { PageLayout } from 'app/shared/layout/page-layout';
import { EntryWizard } from '../entry-wizard/entry-wizard';

@Component({
  selector: 'app-entry',
  imports: [Toolbar, PageLayout, ListPane, EntryWizard],
  template: `
    <app-page-layout>
      <app-toolbar title="Enter"></app-toolbar>
      <app-list-pane maxWidth="480px">
        <app-entry-wizard
          class="content"
          [scopedRaceId]="scopedRaceId"
          [initialBoatClass]="initialBoatClass"
          [initialSailNumber]="initialSailNumber"
          (entered)="onEntered()" />
      </app-list-pane>
    </app-page-layout>
  `,
  styles: `
    .content {
      padding: 16px 20px 24px;
      box-sizing: border-box;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryPage {
  private readonly router = inject(Router);
  private readonly queryParams = inject(ActivatedRoute).snapshot.queryParamMap;

  protected readonly scopedRaceId = this.queryParams.get('raceId') ?? undefined;
  protected readonly initialBoatClass = this.queryParams.get('boatClass') ?? undefined;
  protected readonly initialSailNumber = this.queryParams.get('sailNumber') ?? undefined;

  private readonly wizard = viewChild.required(EntryWizard);

  protected onEntered(): void {
    void this.router.navigate(['entry', 'entries']);
  }

  canDeactivate(): boolean {
    return !this.wizard().isDirty();
  }
}
