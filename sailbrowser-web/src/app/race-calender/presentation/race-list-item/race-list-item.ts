import { Component, input, output } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { DatePipe } from '@angular/common';
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from '@angular/material/button';
import { Race } from 'app/race-calender';
import { StatusPill } from '../status-pill/status-pill';

@Component({
  selector: 'app-race-list-item',
  imports: [MatListModule, DatePipe, MatIconModule, MatButtonModule, StatusPill],
  templateUrl: './race-list-item.html',
  styles: `
  .gap {
    margin-right: 15px;
  }

  .start-time {
    font-weight: 600;
  }

  .details-line {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }

  .pills {
    display: inline-flex;
    gap: 4px;
  }
  `,
})
export class RaceListItem {
  race = input.required<Race>();
  disableDelete = input<boolean>(false);
  edit = output<Race>();
  delete = output<Race>();
}
