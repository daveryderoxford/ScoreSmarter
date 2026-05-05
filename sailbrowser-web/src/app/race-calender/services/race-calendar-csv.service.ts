import { Injectable } from '@angular/core';
import { Race } from '../model/race';
import { toCsv } from 'app/shared/utils/csv';
import { format } from 'date-fns';

const COLUMNS = ['id', 'seriesName', 'seriesId', 'index', 'scheduledStart', 'raceOfDay', 'type', 'status', 'isDiscardable'] as const;

@Injectable({ providedIn: 'root' })
export class RaceCalendarCsvService {
  buildCsv(races: Race[]): string {
    const rows = races.map(race => ({
      id: race.id,
      seriesName: race.seriesName,
      seriesId: race.seriesId,
      index: String(race.index),
      scheduledStart: format(race.scheduledStart, 'yyyy-MM-dd HH:mm'),
      raceOfDay: String(race.raceOfDay),
      type: race.type,
      status: race.status,
      isDiscardable: race.isDiscardable ? 'true' : 'false',
    }));
    return toCsv([...COLUMNS], rows);
  }
}
