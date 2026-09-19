import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { SeasonList } from "../season-list/season-list";
import { PublishedResultsReader } from 'app/published-results/services/published-results-store';
import { PageLayout } from 'app/shared/layout/page-layout';
import { ListPane } from 'app/shared/layout/list-pane';

/** Compact-layout series list. On wide screens, series selection lives in the results viewer sidebar. */
@Component({
  selector: 'app-season-page',
  imports: [Toolbar, SeasonList, MatButtonModule, RouterLink, PageLayout, ListPane],
  templateUrl: './season-page.html',
  styles: `
    :host {
      display: block;
      height: 100%;
      width: 100%;
      overflow: hidden;
    }
  `,
})
export class SeasonPage {
  protected prs = inject(PublishedResultsReader);

  seasons = this.prs.seasons;

}
