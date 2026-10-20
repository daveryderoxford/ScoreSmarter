import { normaliseWhitespace } from 'app/shared/utils/string-utils';
import type { Season } from 'app/race-calender/model/season';
import type { BoatClass } from './boat-class';
import type { Club } from './club';
import type { Fleet } from './fleet';

/**
 * Whitespace normalisation applied when club data is saved, so stored names compare
 * exactly. Ids are only normalised for new items: existing ids are referenced elsewhere.
 */

export function normaliseBoatClass(boatClass: BoatClass, { isNew = false } = {}): BoatClass {
  return {
    ...boatClass,
    ...(isNew ? { id: normaliseWhitespace(boatClass.id) } : {}),
    name: normaliseWhitespace(boatClass.name),
  };
}

export function normaliseFleet(fleet: Fleet): Fleet {
  return fleet.type === 'HandicapRange' ? { ...fleet, name: normaliseWhitespace(fleet.name) } : fleet;
}

export function normaliseSeason(season: Season, { isNew = false } = {}): Season {
  return {
    ...season,
    ...(isNew ? { id: normaliseWhitespace(season.id) } : {}),
    name: normaliseWhitespace(season.name),
  };
}

/** For whole-club or bulk writes (club settings, CSV imports of classes and fleets). */
export function normaliseClubUpdate(update: Partial<Club>): Partial<Club> {
  const out: Partial<Club> = { ...update };
  for (const field of ['name', 'shortName', 'contactName'] as const) {
    const value = out[field];
    if (typeof value === 'string') out[field] = normaliseWhitespace(value);
  }
  if (out.classes) out.classes = out.classes.map(c => normaliseBoatClass(c));
  if (out.fleets) out.fleets = out.fleets.map(normaliseFleet);
  if (out.seasons) out.seasons = out.seasons.map(s => normaliseSeason(s));
  return out;
}
