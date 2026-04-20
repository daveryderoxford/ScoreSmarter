import { Component, booleanAttribute, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterModule } from '@angular/router';
import { BackButtonDirective } from '../back-directive/back-button.direcrtive';
import { SidenavService } from '../../services/sidenav.service';

@Component({
   selector: 'app-toolbar',
   templateUrl: './toolbar.html',
   styleUrl: './toolbar.scss',
   imports: [MatToolbarModule, MatButtonModule, MatIconModule, RouterModule, BackButtonDirective],
})
export class Toolbar {

   title = input('');
   showBack = input(false, { transform: booleanAttribute });

   protected sidenavService = inject(SidenavService);

}
