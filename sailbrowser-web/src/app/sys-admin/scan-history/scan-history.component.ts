import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { CenteredText } from 'app/shared/components/centered-text';
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { Toolbar } from 'app/shared/components/toolbar';
import { ScanHistoryService } from './scan-history.service';

@Component({
  selector: 'app-scan-history',
  imports: [
    DatePipe,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTableModule,
    RouterLink,
    Toolbar,
    LoadingCentered,
    CenteredText,
  ],
  templateUrl: './scan-history.component.html',
  styleUrl: './scan-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScanHistoryComponent {
  protected readonly history = inject(ScanHistoryService);
  protected readonly displayedColumns = [
    'scannedAt',
    'clubId',
    'race',
    'strategy',
    'model',
    'success',
    'rows',
    'confidence',
    'tokens',
    'cost',
    'duration',
  ];

  constructor() {
    void this.history.loadFirstPage();
  }

  loadMore(): void {
    void this.history.loadNextPage();
  }
}
