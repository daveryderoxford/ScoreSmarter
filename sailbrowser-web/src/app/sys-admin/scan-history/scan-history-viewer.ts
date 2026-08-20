import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { CenteredText } from 'app/shared/components/centered-text';
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { Toolbar } from 'app/shared/components/toolbar';
import { ScanHistoryRecord, ScanHistoryService } from './scan-history.service';

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
  templateUrl: './scan-history-viewer.html',
  styleUrl: './scan-history-viewer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScanHistoryViewer {
  protected readonly history = inject(ScanHistoryService);
  private readonly snackbar = inject(MatSnackBar);
  protected readonly displayedColumns = [
    'scannedAt',
    'clubId',
    'race',
    'model',
    'thinkingLevel',
    'success',
    'rows',
    'confidence',
    'tokens',
    'cost',
    'duration',
    'prompt',
  ];

  constructor() {
    void this.history.loadFirstPage();
  }

  loadMore(): void {
    void this.history.loadNextPage();
  }

  openAiPrompt(row: ScanHistoryRecord): void {
    const prompt = row.aiPrompt;
    if (!prompt) return;

    const title = promptWindowTitle(row);
    const popup = window.open('', '_blank', 'popup=yes,width=900,height=800,scrollbars=yes,resizable=yes');
    if (!popup) {
      this.snackbar.open('Pop-up blocked. Allow pop-ups to view the AI prompt.', 'Dismiss', { duration: 5000 });
      return;
    }

    popup.document.write(aiPromptWindowHtml(title, prompt));
    popup.document.close();
    popup.document.title = title;
  }
}

function promptWindowTitle(row: ScanHistoryRecord): string {
  const race = row.seriesName
    ? `${row.seriesName} R${row.raceNumber ?? '?'}`
    : row.raceId;
  return `AI prompt — ${row.clubId} — ${race}`;
}

function aiPromptWindowHtml(title: string, prompt: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #1c1b1f;
      background: #fef7ff;
    }
    header {
      position: sticky;
      top: 0;
      padding: 12px 16px;
      background: #e8def8;
      border-bottom: 1px solid #cac4d0;
      font: 14px/1.3 system-ui, sans-serif;
      font-weight: 600;
    }
    pre {
      margin: 0;
      padding: 16px;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <header>${escapeHtml(title)}</header>
  <pre>${escapeHtml(prompt)}</pre>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
