import { getHandicapValue, Handicap } from 'app/scoring/model/handicap';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import type { BoatClass, ClassKind } from './boat-class';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';
import { type CatalogClass, isRyaClass, normaliseClassName } from './catalog-class';
import { listRating, ratingListFor, type RatingList } from './rating-list';

export const ryaClassId = (catalogueId: number) => `rya-${catalogueId}`;

export function localClassId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `local-${slug || 'class'}`;
}

/** The class's kind, deriving it for classes saved before kinds existed. */
export function classKind(c: Pick<BoatClass, 'kind' | 'catalogueId'>): ClassKind {
  return c.kind ?? ((c.catalogueId ?? 0) > 0 ? 'rya' : 'local');
}

export const classPy = (c: Pick<BoatClass, 'handicaps'>) => getHandicapValue(c.handicaps, 'PY');

/** The club sets `scheme`'s rating for the class rather than using the published list. */
export function isSchemeOverridden(
  c: Pick<BoatClass, 'overriddenSchemes' | 'pyOverridden'>,
  scheme: HandicapScheme,
): boolean {
  if (c.overriddenSchemes) return c.overriddenSchemes.includes(scheme);
  return scheme === 'PY' && c.pyOverridden === true;
}

/**
 * The class's `scheme` rating for a series using the lists in force on `date`: the
 * published rating for an RYA class that doesn't override the scheme, otherwise (or when
 * the list has no rating for the class) the club's value.
 */
export function classRating(
  boatClass: BoatClass,
  scheme: HandicapScheme,
  lists: readonly RatingList[],
  date: Date,
): number | undefined {
  if (classKind(boatClass) === 'rya' && !isSchemeOverridden(boatClass, scheme)) {
    const published = listRating(ratingListFor(lists, scheme, date), boatClass.catalogueId);
    if (published !== undefined) return published;
  }
  return getHandicapValue(boatClass.handicaps, scheme);
}

/** RYA crew and spinnaker, e.g. "Single-handed" or "2 crew, asymmetric spinnaker". */
export function ryaConfigurationLabel(entry: Pick<CatalogClass, 'crew' | 'spinnaker'>): string {
  const crew = entry.crew === 1 ? 'Single-handed' : `${entry.crew} crew`;
  const spinnaker = { A: 'asymmetric spinnaker', C: 'spinnaker' }[entry.spinnaker ?? ''];
  return spinnaker ? `${crew}, ${spinnaker}` : crew;
}

/**
 * A club class for an RYA catalogue entry. `handicaps` are the club's class handicaps;
 * PY is `pn` (the current RYA PN) unless `pyOverride` is given. A PY given when there is
 * no PN isn't an override, so a later list with a PN applies to it.
 */
export function ryaClubClass(
  entry: CatalogClass,
  handicaps: readonly Handicap[],
  pn: number | undefined,
  pyOverride?: number,
): BoatClass {
  if (!isRyaClass(entry)) throw new Error(`Catalogue class ${entry.catalogueId} is not an RYA class`);
  const py = pyOverride ?? pn;
  const others = handicaps.filter(h => h.scheme !== 'PY');
  const overridden = pyOverride !== undefined && pn !== undefined && pyOverride !== pn;
  return {
    id: ryaClassId(entry.catalogueId),
    name: entry.name,
    kind: 'rya',
    catalogueId: entry.catalogueId,
    isSinglehander: entry.crew === 1,
    handicaps: py !== undefined ? [{ scheme: 'PY', value: py }, ...others] : others,
    overriddenSchemes: overridden ? ['PY'] : [],
  };
}

/** The current RYA PN for a catalogue entry, from the PY lists. */
export function currentPn(lists: readonly RatingList[], catalogueId: number, today = new Date()): number | undefined {
  return listRating(ratingListFor(lists, 'PY', today), catalogueId);
}

export interface NewClubClass {
  kind: ClassKind;
  /** RYA Class ID, for an RYA class. */
  catalogueId?: number;
  /** Name, for a local class. */
  name?: string;
  /** For a local class; an RYA class takes it from the RYA list. */
  isSinglehander?: boolean;
  /** Club handicaps. For an RYA class a PY differing from the RYA PN is an override. */
  handicaps: Handicap[];
}

const MAX_CLASS_NAME_LENGTH = 60;
const classNameKey = (name: string) => normaliseWhitespace(name).toLowerCase();

/**
 * The class to add to a club with `existing` classes, or a message saying why it can't be
 * added. RYA classes are built from `catalogue` and the current PY list, and `catalogue`
 * also stops RYA classes being added as local ones.
 */
export function newClubClass(
  request: NewClubClass,
  existing: readonly BoatClass[],
  catalogue: readonly CatalogClass[],
  ratingLists: readonly RatingList[],
): BoatClass | string {
  const names = new Set(existing.map(c => classNameKey(c.name)));

  if (request.kind === 'rya') {
    const entry = catalogue.find(c => c.catalogueId === request.catalogueId && isRyaClass(c));
    if (!entry) return `RYA Class ID ${request.catalogueId} is not in the RYA list.`;
    if (existing.some(c => c.id === ryaClassId(entry.catalogueId) || c.catalogueId === entry.catalogueId)) {
      return `${entry.name} is already one of the club's classes.`;
    }
    if (names.has(classNameKey(entry.name))) return `The club already has a class called ${entry.name}.`;
    const py = getHandicapValue(request.handicaps, 'PY');
    return ryaClubClass(entry, request.handicaps, currentPn(ratingLists, entry.catalogueId), py);
  }

  const name = normaliseWhitespace(request.name);
  if (!name) return 'Enter a class name.';
  if (name.length > MAX_CLASS_NAME_LENGTH) return `Class names can be at most ${MAX_CLASS_NAME_LENGTH} characters.`;
  if (names.has(classNameKey(name))) return `The club already has a class called ${name}.`;
  const rya = catalogue.find(c => isRyaClass(c) && normaliseClassName(c.name) === normaliseClassName(name));
  if (rya) return `${rya.name} is in the RYA list; add it as an RYA class.`;

  const ids = new Set(existing.map(c => c.id));
  const base = localClassId(name);
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  return { id, name, kind: 'local', isSinglehander: request.isSinglehander === true, handicaps: request.handicaps };
}
