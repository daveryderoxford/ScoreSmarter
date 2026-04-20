import { Handicap } from 'app/scoring/model/handicap';
import { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getHandicapValue } from 'app/scoring/model/handicap';
import { RaceCompetitor } from './race-competitor';
import { SeriesEntry } from './series-entry';

/**
 * UI/scoring view of a RaceCompetitor combined with its SeriesEntry.
 *
 * RaceCompetitor stores only scoring data and ids. All identity, boat,
 * and handicap metadata are read from the linked SeriesEntry.
 *
 * Components that previously read flat fields off RaceCompetitor (helm,
 * boatClass, sailNumber, handicaps, personalHandicapBand, club)
 * should consume `ResolvedRaceCompetitor[]` instead.
 *
 * Identity rules:
 * - `helm`, `boatClass`, `sailNumber`, `handicaps`, `personalHandicapBand`,
 *   `club` come from the entry (per-hull, consistent across the
 *   series). Fleet context for a race comes from `Race.fleetId`, not the entry.
 * - `crew` uses the per-race `crewOverride` when defined, otherwise the
 *   entry crew.
 */
export class ResolvedRaceCompetitor extends RaceCompetitor {
  readonly entry: SeriesEntry;

  constructor(competitor: RaceCompetitor, entry: SeriesEntry) {
    super(competitor);
    this.entry = entry;
  }

  get helm(): string {
    return this.entry.helm;
  }

  get crew(): string | undefined {
    return this.crewOverride ?? this.entry.crew;
  }

  get boatClass(): string {
    return this.entry.boatClass;
  }

  get sailNumber(): number {
    return this.entry.sailNumber;
  }

  get handicaps(): Handicap[] {
    return this.entry.handicaps;
  }

  get personalHandicapBand(): PersonalHandicapBand | undefined {
    return this.entry.personalHandicapBand;
  }

  get club(): string | undefined {
    return this.entry.club;
  }

  get helmCrew(): string {
    const crew = this.crew;
    return crew && crew.trim().length > 0 ? `${this.helm} / ${crew}` : this.helm;
  }

  handicapForScheme(scheme: HandicapScheme): number | undefined {
    return getHandicapValue(this.handicaps, scheme);
  }
}

/**
 * Joins competitors with their entries, dropping any competitor whose
 * SeriesEntry is missing (data corruption).
 */
export function resolveRaceCompetitors(
  competitors: RaceCompetitor[],
  entries: SeriesEntry[],
): ResolvedRaceCompetitor[] {
  const entryById = new Map(entries.map(e => [e.id, e]));
  const resolved: ResolvedRaceCompetitor[] = [];
  for (const comp of competitors) {
    const entry = entryById.get(comp.seriesEntryId);
    if (!entry) {
      console.warn(`resolveRaceCompetitors: missing SeriesEntry ${comp.seriesEntryId} for competitor ${comp.id}`);
      continue;
    }
    resolved.push(new ResolvedRaceCompetitor(comp, entry));
  }
  return resolved;
}

/**
 * Sorts resolved competitors by boatClass then sailNumber.
 */
export function sortResolvedCompetitors(
  a: ResolvedRaceCompetitor,
  b: ResolvedRaceCompetitor,
): number {
  const classCompare = a.boatClass.localeCompare(b.boatClass);
  if (classCompare !== 0) {
    return classCompare;
  }
  return a.sailNumber - b.sailNumber;
}
