import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from 'app/auth/auth.service';
import { Toolbar } from 'app/shared/components/toolbar';
import { EntriesListPanel } from './entries-list-panel';

@Component({
  selector: 'app-entries-list-page',
  imports: [Toolbar, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, EntriesListPanel],
  templateUrl: './entries-list.page.html',
  styleUrl: './entries-list.page.scss',
})
export class EntriesListPage {
  protected readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);

  async openImport(): Promise<void> {
    const { ImportEntriesDialog } = await import('./import-entries-dialog');
    const imported = await firstValueFrom(
      this.dialog.open(ImportEntriesDialog, {
        width: '720px',
        maxWidth: '95vw',
      }).afterClosed(),
    );
    if (imported) {
      this.snackbar.open('Entries imported', 'Dismiss', { duration: 4000 });
    }
  }
}
