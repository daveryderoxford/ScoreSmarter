import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { PageLayout } from 'app/shared/layout/page-layout';


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

      </div>
      <span class="message">
         {{msgText()}}
      </span>
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
    .message {
      width: 100%;
      text-align: center;
      padding: 20px;
      font-size: 1.2em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SysAdminSwitchboard {
 //private functions = getFunctions(inject(FirebaseApp), 'europe-west2');

  busy = signal(false);

  msgText = signal('');

}
