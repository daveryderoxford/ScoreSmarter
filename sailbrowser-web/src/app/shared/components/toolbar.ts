import { Component, booleanAttribute, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterModule } from '@angular/router';
import { BackButtonDirective } from './back-directive/back-button.direcrtive';
import { SidenavService } from '../services/sidenav.service';

@Component({
   selector: 'app-toolbar',
   template: `
<mat-toolbar class="app-toolbar">
   <div class="toolbar-left">
      @if (showBack()) {
         <button mat-icon-button navigateBack>
           <mat-icon>arrow_back</mat-icon>
         </button>
      } @else {
       <button
         mat-icon-button
         (click)="sidenavService.toggle()"
         aria-label="Toggle sidenav">
         <mat-icon>menu</mat-icon>
       </button>
     }
      <span class="title">{{title()}}</span>
   </div>
   
   <div class="toolbar-center">
      <ng-content select="[center]"/>
   </div>

   <div class="spacer"></div>
   
   <div class="toolbar-right">
      <ng-content/>
   </div>
</mat-toolbar>
    `,
   imports: [MatToolbarModule, MatButtonModule, MatIconModule, RouterModule, BackButtonDirective],
   styles: [`
      .app-toolbar {
         display: flex;
         justify-content: space-between;
         align-items: center;
      }
      .toolbar-left {
         display: flex;
         align-items: center;
         flex: 1;
      }
      .toolbar-center {
         display: flex;
         justify-content: center;
         align-items: center;
         flex: 2;
      }
      .toolbar-right {
         display: flex;
         justify-content: flex-end;
         align-items: center;
         flex: 1;
         gap: 8px;
      }
      .spacer { flex: 1 1 auto; display: none; }
      .title { margin-left: 8px; font-weight: 500; }
   `]

})
export class Toolbar {

   title = input('');
   showBack = input(false, { transform: booleanAttribute });

   protected sidenavService = inject(SidenavService);

}
