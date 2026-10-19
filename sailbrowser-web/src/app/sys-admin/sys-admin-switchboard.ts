import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { cloudCallable } from 'app/shared/firebase/cloud-functions';
import { Toolbar } from 'app/shared/components/toolbar';
import { PageLayout } from 'app/shared/layout/page-layout';

interface RaceLifecycleMigrationResult {
  dryRun: boolean;
  clubs: { clubId: string; races: number; updated: number; changes: Record<string, number> }[];
}

@Component({
  selector: 'app-sys-admin-switchboard',
  imports: [MatButtonModule, Toolbar, RouterLink, PageLayout],
  template: `
    <app-page-layout>
    <app-toolbar title="System admin"/>
    <div class=container>
      <div class=buttons>
        <a matButton='tonal' routerLink="/sys-admin/users">
            User administration
        </a>
        <a matButton='tonal' routerLink="/sys-admin/data">
            System Data Import/Export
        </a>
        <a matButton='tonal' routerLink="/sys-admin/scans">
            Scan history
        </a>
        <a matButton='tonal' routerLink="/sys-admin/scan-ai">
            Scan AI model
        </a>

        <div class="migration">
          <span>Race lifecycle migration (one-time)</span>
          <div class="migration-actions">
            <button matButton="outlined" type="button" [disabled]="busy()" (click)="migrateRaceLifecycle(true)">
              Dry run
            </button>
            <button matButton="filled" type="button" [disabled]="busy()" (click)="migrateRaceLifecycle(false)">
              Run migration
            </button>
          </div>
        </div>
      </div>
      <span class="message">
         {{msgText()}}
      </span>
      @if (migrationReport(); as report) {
        <pre class="report">{{ report }}</pre>
      }
    </div>
    </app-page-layout>
  `,
  styles: `
    :host {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .container {
      width:100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background-color: var(--mat-sys-surface-container-low);    }
    .buttons {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      background-color: white;    
    }
    .migration {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 12px;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .migration-actions {
      display: flex;
      gap: 8px;
    }
    .message {
      width: 100%;
      text-align: center;
      padding: 20px;
      font-size: 1.2em;
    }
    .report {
      max-width: 90vw;
      overflow: auto;
      font-size: 0.85em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SysAdminSwitchboard {
  busy = signal(false);

  msgText = signal('');

  readonly migrationReport = signal('');

  async migrateRaceLifecycle(dryRun: boolean): Promise<void> {
    if (!dryRun && !confirm('Update race statuses for every club? Run a dry run first.')) return;
    this.busy.set(true);
    this.msgText.set(dryRun ? 'Running dry run…' : 'Migrating races…');
    this.migrationReport.set('');
    try {
      const fn = await cloudCallable<{ dryRun: boolean }, RaceLifecycleMigrationResult>(
        'migrateRaceLifecycle',
        { timeout: 540_000 },
      );
      const { data } = await fn({ dryRun });
      const updated = data.clubs.reduce((sum, c) => sum + c.updated, 0);
      this.msgText.set(`${data.dryRun ? 'Dry run' : 'Migration'} complete: ${updated} race(s) ${data.dryRun ? 'would be' : ''} updated.`);
      this.migrationReport.set(JSON.stringify(data.clubs, null, 2));
    } catch (e: unknown) {
      console.error('SysAdminSwitchboard: race lifecycle migration failed', e);
      this.msgText.set(e instanceof Error ? e.message : 'Migration failed.');
    } finally {
      this.busy.set(false);
    }
  }
}
