import type { Boat } from 'app/boats/model/boat';
import { normalizeSailNumber } from 'app/boats/model/sail-number';
import type { BoatClass } from 'app/club-tenant/model/boat-class';
import { newClubClass, type NewClubClass } from 'app/club-tenant/model/club-class';
import type { Fleet } from 'app/club-tenant/model/fleet';
import { suggestCatalogClass, type CatalogClass } from 'app/system-data/model/catalog-class';
import type { RatingList } from 'app/system-data/model/rating-list';
import type { SailwaveCompetitor, SailwaveSeries } from './sailwave-series';

export interface DraftClass {
  included: boolean;
  sourceName: string;
  py: number | null;
  boatClass: BoatClass | null;
  note: string;
}

export interface DraftFleet {
  included: boolean;
  fleet: Fleet;
  reason: string;
}

export interface DraftBoat {
  included: boolean;
  sailNumber: string;
  boatClass: string;
  helm: string;
  crew: string;
  name: string;
  racesSailed: number;
  /** Helms who sailed this sail number once. Shown in the review, not stored on the boat. */
  borrowedBy: string[];
  note: string;
}

export interface ClubDraft {
  classes: DraftClass[];
  fleets: DraftFleet[];
  boats: DraftBoat[];
  notes: string[];
}

interface HelmUse {
  helm: string;
  crew: string;
  boatName: string;
  boatClass: string;
  sailNumber: string;
  racesSailed: number;
  seriesIndex: number;
  raceIndex: number;
}

/**
 * Classes, fleets, and boats from the selected series.
 * `isClub` is never set: it means a club-owned boat, and results do not say that.
 */
export function draftClub(
  seriesList: readonly SailwaveSeries[],
  catalogue: readonly CatalogClass[],
  ratingLists: readonly RatingList[],
  existingClasses: readonly BoatClass[],
  existingFleets: readonly { type: string; boatClassId?: string; name?: string }[],
  existingBoats: readonly Pick<Boat, 'sailNumber' | 'boatClass' | 'helm'>[],
): ClubDraft {
  const classes = draftClasses(seriesList, catalogue, ratingLists, existingClasses);
  const className = officialClassName(classes);
  return {
    classes,
    fleets: draftFleets(seriesList, className, existingFleets),
    boats: draftBoats(seriesList, className, existingBoats),
    notes: scoringNotes(seriesList),
  };
}

function draftClasses(
  seriesList: readonly SailwaveSeries[],
  catalogue: readonly CatalogClass[],
  ratingLists: readonly RatingList[],
  existingClasses: readonly BoatClass[],
): DraftClass[] {
  const ratings = new Map<string, number[]>();
  const displayName = new Map<string, string>();
  for (const competitor of seriesList.flatMap(series => series.competitors)) {
    const name = competitor.boatClass.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    displayName.set(key, displayName.get(key) ?? name);
    if (competitor.rating != null && competitor.rating > 0) {
      const list = ratings.get(key) ?? [];
      list.push(competitor.rating);
      ratings.set(key, list);
    }
  }

  const built: BoatClass[] = [...existingClasses];
  const drafts: DraftClass[] = [];
  for (const [key, sourceName] of displayName) {
    const py = mode(ratings.get(key) ?? []);
    const handicaps = py == null ? [] : [{ scheme: 'PY' as const, value: py }];
    const catalogueEntry = suggestCatalogClass(sourceName, catalogue);
    const request: NewClubClass = catalogueEntry
      ? { kind: 'rya', catalogueId: catalogueEntry.catalogueId, handicaps }
      : { kind: 'local', name: sourceName, handicaps };
    const result = newClubClass(request, built, catalogue, ratingLists);
    if (typeof result === 'string') {
      drafts.push({ included: false, sourceName, py, boatClass: null, note: result });
      continue;
    }
    built.push(result);
    const override = result.overriddenSchemes?.includes('PY') ? ` PY ${py} overrides the RYA number.` : '';
    drafts.push({
      included: true,
      sourceName,
      py,
      boatClass: result,
      note: `${result.kind === 'rya' ? 'RYA class' : 'Local class'}.${override}`,
    });
  }
  return drafts.sort((a, b) => a.sourceName.localeCompare(b.sourceName));
}

function draftFleets(
  seriesList: readonly SailwaveSeries[],
  className: (sourceName: string) => string,
  existingFleets: readonly { type: string; boatClassId?: string; name?: string }[],
): DraftFleet[] {
  const fleets: DraftFleet[] = [];
  const seen = new Set(existingFleets.map(fleet => fleetKey(fleet)));
  for (const series of seriesList) {
    const classes = distinct(series.competitors.map(competitor => competitor.boatClass.trim()).filter(Boolean));
    const fleetNames = distinct(series.competitors.map(competitor => competitor.fleet.trim()).filter(Boolean));
    if (fleetNames.length >= 2 && fleetNames.length <= 8 && series.hasRatingColumn) {
      for (const name of fleetNames) {
        const ratings = series.competitors
          .filter(competitor => competitor.fleet.trim() === name && competitor.rating != null)
          .map(competitor => competitor.rating as number);
        if (ratings.length === 0) continue;
        const fleet: Fleet = {
          type: 'HandicapRange',
          id: slug('fleet', name),
          name,
          scheme: 'PY',
          min: Math.min(...ratings),
          max: Math.max(...ratings),
        };
        addFleet(fleets, seen, fleet, `${series.title} splits ${name} by PY.`);
      }
      continue;
    }
    if (classes.length === 1 && !series.hasRatingColumn) {
      const name = className(classes[0]);
      const fleet: Fleet = { type: 'BoatClass', id: slug('fleet', name), boatClassId: name };
      addFleet(fleets, seen, fleet, `${series.title} is sailed as ${name}.`);
    }
  }
  return fleets;
}

function draftBoats(
  seriesList: readonly SailwaveSeries[],
  className: (sourceName: string) => string,
  existingBoats: readonly Pick<Boat, 'sailNumber' | 'boatClass' | 'helm'>[],
): DraftBoat[] {
  const groups = new Map<string, Map<string, Map<string, HelmUse>>>();
  const recency = recencyRanks(seriesList);
  seriesList.forEach((series, seriesIndex) => {
    // Summaries on one page (Overall and each fleet) repeat the same races. Race tables on a page do not.
    const sourceKey = series.kind === 'race' ? series.id : `page:${series.sourceName || series.id}`;
    for (const competitor of series.competitors) {
      const use = helmUse(competitor, recency[seriesIndex], className);
      if (!use) continue;
      const groupKey = `${use.boatClass.toLowerCase()}|${use.sailNumber}`;
      const helms = groups.get(groupKey) ?? new Map<string, Map<string, HelmUse>>();
      const helmKey = use.helm.toLowerCase();
      const bySource = helms.get(helmKey) ?? new Map<string, HelmUse>();
      const previous = bySource.get(sourceKey);
      bySource.set(sourceKey, previous && previous.racesSailed >= use.racesSailed ? previous : use);
      helms.set(helmKey, bySource);
      groups.set(groupKey, helms);
    }
  });

  const boats: DraftBoat[] = [];
  for (const helms of groups.values()) {
    const uses = [...helms.values()].map(bySource => [...bySource.values()].reduce(mergeHelm));
    const regulars = uses.filter(use => use.racesSailed >= 2);
    const singles = uses.filter(use => use.racesSailed < 2);
    if (regulars.length === 0) {
      const latest = mostRecent(uses);
      boats.push(toDraftBoat(latest, uses.filter(use => use !== latest).map(use => use.helm), existingBoats));
      continue;
    }
    const primary = [...regulars].sort((a, b) => b.racesSailed - a.racesSailed || compareRecent(b, a))[0];
    for (const regular of regulars) {
      const borrowedBy = regular === primary ? singles.map(use => use.helm) : [];
      boats.push(toDraftBoat(regular, borrowedBy, existingBoats));
    }
  }
  return boats.sort((a, b) => a.boatClass.localeCompare(b.boatClass) || a.sailNumber.localeCompare(b.sailNumber) || a.helm.localeCompare(b.helm));
}

function helmUse(competitor: SailwaveCompetitor, seriesIndex: number, className: (sourceName: string) => string): HelmUse | null {
  const sailNumber = normalizeSailNumber(competitor.sailNumber);
  const helm = competitor.helm.trim().replace(/\s+/g, ' ');
  const sourceClass = competitor.boatClass.trim();
  if (!sailNumber || !helm || !sourceClass) return null;
  let sailed = 0;
  let raceIndex = -1;
  competitor.races.forEach((cell, index) => {
    if (!cell.blank && cell.code !== 'DNC') {
      sailed++;
      raceIndex = index;
    }
  });
  if (sailed === 0) return null;
  return {
    helm,
    crew: competitor.crew.trim(),
    boatName: competitor.boatName.trim(),
    boatClass: className(sourceClass),
    sailNumber,
    racesSailed: sailed,
    seriesIndex,
    raceIndex,
  };
}

function mergeHelm(previous: HelmUse, next: HelmUse): HelmUse {
  const latest = compareRecent(next, previous) > 0 ? next : previous;
  return {
    ...latest,
    racesSailed: previous.racesSailed + next.racesSailed,
    crew: latest.crew || previous.crew,
    boatName: latest.boatName || previous.boatName,
  };
}

function toDraftBoat(
  use: HelmUse,
  borrowedBy: string[],
  existingBoats: readonly Pick<Boat, 'sailNumber' | 'boatClass' | 'helm'>[],
): DraftBoat {
  const already = existingBoats.some(boat =>
    normalizeSailNumber(boat.sailNumber) === use.sailNumber
    && boat.boatClass.trim().toLowerCase() === use.boatClass.toLowerCase()
    && boat.helm.trim().toLowerCase() === use.helm.toLowerCase());
  const borrowNote = borrowedBy.length > 0 ? ` Sailed once by ${borrowedBy.join(', ')}.` : '';
  return {
    included: !already,
    sailNumber: use.sailNumber,
    boatClass: use.boatClass,
    helm: use.helm,
    crew: use.crew,
    name: use.boatName,
    racesSailed: use.racesSailed,
    borrowedBy,
    note: already ? `Already in the boat list.${borrowNote}` : borrowNote.trim(),
  };
}

function scoringNotes(seriesList: readonly SailwaveSeries[]): string[] {
  const notes: string[] = [];
  for (const series of seriesList) {
    const classes = distinct(series.competitors.map(competitor => competitor.boatClass.trim()).filter(Boolean));
    const fleetNames = distinct(series.competitors.map(competitor => competitor.fleet.trim()).filter(Boolean));
    if (classes.length > 1 && series.hasRatingColumn && fleetNames.length < 2) {
      notes.push(`${series.title} uses General Handicap.`);
    }
  }
  return notes;
}

function officialClassName(classes: readonly DraftClass[]): (sourceName: string) => string {
  const names = new Map(classes.flatMap(draft => {
    const official = draft.boatClass?.name;
    return official ? [[draft.sourceName.toLowerCase(), official] as const] : [];
  }));
  return sourceName => names.get(sourceName.toLowerCase()) ?? sourceName.trim();
}

function addFleet(fleets: DraftFleet[], seen: Set<string>, fleet: Fleet, reason: string): void {
  const key = fleetKey(fleet);
  if (seen.has(key)) return;
  seen.add(key);
  fleets.push({ included: true, fleet, reason });
}

function fleetKey(fleet: { type: string; boatClassId?: string; name?: string }): string {
  if (fleet.type === 'BoatClass') return `class:${(fleet.boatClassId ?? '').toLowerCase()}`;
  if (fleet.type === 'HandicapRange') return `range:${(fleet.name ?? '').toLowerCase()}`;
  return fleet.type;
}

/** Rank of each series by date, oldest first. Undated series keep their list order before dated ones. */
function recencyRanks(seriesList: readonly SailwaveSeries[]): number[] {
  const order = seriesList
    .map((series, index) => ({ index, date: series.date ?? '' }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
  const ranks: number[] = [];
  order.forEach((item, rank) => {
    ranks[item.index] = rank;
  });
  return ranks;
}

function mostRecent(uses: HelmUse[]): HelmUse {
  return [...uses].sort(compareRecent)[uses.length - 1];
}

function compareRecent(a: HelmUse, b: HelmUse): number {
  return a.seriesIndex - b.seriesIndex || a.raceIndex - b.raceIndex;
}

function distinct(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function mode(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function slug(prefix: string, name: string): string {
  const text = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${prefix}-${text || 'item'}`;
}
