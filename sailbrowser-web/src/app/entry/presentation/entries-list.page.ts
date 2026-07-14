import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { EntriesListPanel } from './entries-list-panel';

@Component({
  selector: 'app-entries-list-page',
  imports: [Toolbar, RouterLink, MatButtonModule, EntriesListPanel],
  templateUrl: './entries-list.page.html',
  styleUrl: './entries-list.page.scss',
})
export class EntriesListPage {}
