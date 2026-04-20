import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { SeasonList } from "../season-list/season-list";
import { PublishedResultsReader } from 'app/published-results/services/published-results-store';

/** Routed component using on mobile that displays a list of seasons 
 * and allows selection of seaon results
 */
@Component({
  selector: 'app-season-page',
  imports: [Toolbar, SeasonList, MatButtonModule, RouterLink],
  templateUrl: './season-page.html',
  styles: ``,
})
export class SeasonPage {
  protected prs = inject(PublishedResultsReader);

  seasons = this.prs.seasons;

}
