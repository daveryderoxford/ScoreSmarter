import { Injectable } from '@angular/core';
import { Race } from '../model/race';
import { format } from 'date-fns';

@Injectable({ providedIn: 'root' })
export class RaceCalendarICalService {
  buildICal(races: Race[]): string {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SailBrowser//Race Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    for (const race of races) {
      const start = race.scheduledStart;
      const end = new Date(start.getTime() + 60 * 60 * 1000); // Assume 1 hour duration
      
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${race.id}@sailbrowser.app`);
      lines.push(`DTSTAMP:${this.formatDate(new Date())}`);
      lines.push(`DTSTART:${this.formatDate(start)}`);
      lines.push(`DTEND:${this.formatDate(end)}`);
      lines.push(`SUMMARY:${race.seriesName} - Race ${race.index}`);
      lines.push(`DESCRIPTION:Race ${race.raceOfDay} of the day. Status: ${race.status}`);
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  private formatDate(date: Date): string {
    return format(date, "yyyyMMdd'T'HHmmss'Z'");
  }
}
