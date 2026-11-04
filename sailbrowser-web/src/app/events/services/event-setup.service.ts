import { inject, Injectable } from '@angular/core';
import type { Fleet } from 'app/club-tenant/model/fleet';
import { ClubStore } from 'app/club-tenant/services/club-store';
import type { Race } from 'app/race-calendar/model/race';
import type { Series } from 'app/race-calendar/model/series';
import { RaceCalendarStore } from 'app/race-calendar/services/full-race-calendar';
import { eventRaceStarts, eventSeriesFor, raceTypeForFleet } from '../model/event-setup';
import { OpenEvent, seriesForEvent } from '../model/open-event';
import { EventStore } from './event-store';

export interface NewEventInput {
  event: Omit<OpenEvent, 'id'>;
  fleets: Fleet[];
  racesPerDay: number;
  firstStartSeconds: number;
}

/** Creates and links the series behind an open meeting. Scoring stays on each series. */
@Injectable({ providedIn: 'root' })
export class EventSetupService {
  private readonly events = inject(EventStore);
  private readonly calendar = inject(RaceCalendarStore);
  private readonly clubStore = inject(ClubStore);

  /** Saves the event, then one short series per fleet with a race schedule over the event days. */
  async createEvent(input: NewEventInput): Promise<string> {
    const eventId = await this.events.addEvent(input.event);
    const club = this.clubStore.club();
    const starts = eventRaceStarts(input.event.startDate, input.event.endDate, input.firstStartSeconds, input.racesPerDay);

    for (const fleet of input.fleets) {
      const series = eventSeriesFor({ ...input.event, id: eventId }, fleet, club);
      const seriesId = await this.calendar.addSeries(series);
      const races: Partial<Race>[] = starts.map(scheduledStart => ({
        type: raceTypeForFleet(fleet),
        fleetId: fleet.id,
        isDiscardable: true,
        isAverageLap: false,
        scheduledStart,
      }));
      if (races.length > 0) {
        await this.calendar.addRaces({ id: seriesId, name: series.name!, fleetId: fleet.id }, races);
      }
    }
    return eventId;
  }

  /** Links exactly `seriesIds` to the event; series removed from it keep their races and entries. */
  async setEventSeries(eventId: string, seriesIds: readonly string[]): Promise<void> {
    const wanted = new Set(seriesIds);
    const all = this.calendar.allSeries();
    const current = seriesForEvent(eventId, all);
    for (const s of current) {
      if (!wanted.has(s.id)) await this.calendar.updateSeries(s.id, { eventId: null as unknown as undefined });
    }
    for (const id of wanted) {
      if (!current.some(s => s.id === id)) await this.calendar.updateSeries(id, { eventId });
    }
  }

  /** Deletes the event only; its series stay on the race calendar. */
  async deleteEvent(eventId: string): Promise<void> {
    await this.setEventSeries(eventId, []);
    await this.events.deleteEvent(eventId);
  }

  seriesOf(eventId: string): Series[] {
    return seriesForEvent(eventId, this.calendar.allSeries());
  }
}
