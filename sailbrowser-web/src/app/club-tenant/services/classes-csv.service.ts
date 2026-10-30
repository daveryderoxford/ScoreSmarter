import { Injectable } from '@angular/core';
import { BoatClass, ClassKind } from '../model/boat-class';
import type { CatalogClass } from '../model/catalog-class';
import { classKind, classRating, currentPn, isSchemeOverridden, localClassId, ryaClubClass } from '../model/club-class';
import type { RatingList } from '../model/rating-list';
import { Handicap, getHandicapValue } from 'app/scoring/model/handicap';
import { HANDICAP_SCHEMES, HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getHandicapSchemeMetadata } from 'app/scoring/model/handicap-scheme-metadata';
import { parseCsv, toCsv } from 'app/shared/utils/csv';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';

const REQUIRED_COLUMNS = ['name'] as const;
const EXPORT_COLUMNS = ['id', 'name', 'kind', 'catalogueId', 'isSinglehander', 'overriddenSchemes'] as const;

/** A class read from a CSV row. RYA rows are complete classes built from the RYA list. */
export interface ClassCsvRow {
  line: number;
  boatClass: BoatClass;
  /** False when the row gave no id; it is then matched to club classes by name. */
  idGiven: boolean;
}

export interface ClassesCsvParseResult {
  rows: ClassCsvRow[];
  errors: string[];
}

export interface ClassesMergeResult {
  classes: BoatClass[];
  added: number;
  updated: number;
  errors: string[];
}

const nameKey = (name: string) => normaliseWhitespace(name).toLowerCase();

@Injectable({ providedIn: 'root' })
export class ClassesCsvService {
  /** Ratings are those in force today, from `ratingLists` unless overridden. */
  buildCsv(classes: BoatClass[], schemes: HandicapScheme[], ratingLists: readonly RatingList[]): string {
    const today = new Date();
    const handicapColumns = schemes.map(s => this.handicapColumn(s));
    const columns = [...EXPORT_COLUMNS, ...handicapColumns];
    const rows = classes.map(cls => {
      const kind = classKind(cls);
      const row: Record<string, string> = {
        id: cls.id,
        name: cls.name,
        kind,
        catalogueId: kind === 'rya' && cls.catalogueId ? String(cls.catalogueId) : '',
        isSinglehander: cls.isSinglehander === true ? 'true' : 'false',
        overriddenSchemes: kind === 'rya' ? HANDICAP_SCHEMES.filter(s => isSchemeOverridden(cls, s)).join(';') : '',
      };
      for (const scheme of schemes) {
        const value = classRating(cls, scheme, ratingLists, today);
        row[this.handicapColumn(scheme)] = value == null ? '' : String(value);
      }
      return row;
    });
    return toCsv(columns, rows);
  }

  /**
   * Reads classes from CSV. RYA rows (kind `rya` or an RYA Class ID) are checked against
   * `catalogue`; their PY is the current RYA PN unless overridden.
   */
  parseCsv(
    content: string,
    schemes: HandicapScheme[],
    catalogue: ReadonlyMap<number, CatalogClass>,
    ratingLists: readonly RatingList[],
  ): ClassesCsvParseResult {
    const parsed = parseCsv(content);
    const errors: string[] = [...parsed.errors];
    const headerColumns = parsed.header;
    if (headerColumns.length === 0) {
      return { rows: [], errors: parsed.errors };
    }
    const handicapColumns = schemes.map(s => this.handicapColumn(s));
    const expectedColumns = [...REQUIRED_COLUMNS, ...handicapColumns];
    const missing = expectedColumns.filter(c => !headerColumns.includes(c));
    if (missing.length > 0) {
      return { rows: [], errors: [`Missing required columns: ${missing.join(', ')}`] };
    }

    const rows: ClassCsvRow[] = [];
    const ids = new Set<string>();
    const names = new Set<string>();
    for (let i = 0; i < parsed.rows.length; i++) {
      const line = i + 2;
      const result = this.parseClassRecord(parsed.rows[i], schemes, catalogue, ratingLists, line);
      if (typeof result === 'string') {
        errors.push(result);
        continue;
      }
      const { boatClass } = result;
      if ((result.idGiven && ids.has(boatClass.id)) || names.has(nameKey(boatClass.name))) {
        errors.push(`Line ${line}: ${boatClass.name} appears more than once`);
        continue;
      }
      if (result.idGiven) ids.add(boatClass.id);
      names.add(nameKey(boatClass.name));
      rows.push(result);
    }
    return { rows, errors };
  }

  /**
   * Merges imported rows into the club's classes: a row updates the class with its id, or
   * failing that its name, and other rows are added. Classes missing from the file are kept.
   * Names aren't changed by importing; rename classes on the Classes page.
   */
  merge(existing: readonly BoatClass[], rows: readonly ClassCsvRow[]): ClassesMergeResult {
    const classes = [...existing];
    const errors: string[] = [];
    let added = 0;
    let updated = 0;
    for (const row of rows) {
      const imported = row.boatClass;
      const byId = row.idGiven ? classes.findIndex(c => c.id === imported.id) : -1;
      const index = byId >= 0 ? byId : classes.findIndex(c => nameKey(c.name) === nameKey(imported.name));
      if (index < 0) {
        const id = classKind(imported) === 'local' ? this.uniqueId(imported.id, classes) : imported.id;
        if (classes.some(c => c.id === id)) {
          errors.push(`Line ${row.line}: ${imported.name} is already one of the club's classes`);
          continue;
        }
        classes.push({ ...imported, id });
        added++;
        continue;
      }

      const target = classes[index];
      if (nameKey(target.name) !== nameKey(imported.name)) {
        errors.push(`Line ${row.line}: id ${imported.id} is ${target.name}; rename classes on the Classes page`);
        continue;
      }
      const becomesRya = classKind(imported) === 'rya' && classKind(target) !== 'rya';
      if (becomesRya && classes.some((c, i) => i !== index && c.id === imported.id)) {
        errors.push(`Line ${row.line}: ${imported.name} is already one of the club's classes`);
        continue;
      }
      classes[index] = becomesRya
        ? { ...imported, ...(target.formerNames ? { formerNames: target.formerNames } : {}) }
        : this.updateClass(target, imported);
      updated++;
    }
    return { classes, added, updated, errors };
  }

  /** `target` with the imported handicaps and settings; an RYA class keeps its RYA details. */
  private updateClass(target: BoatClass, imported: BoatClass): BoatClass {
    const next: BoatClass = { ...target, handicaps: imported.handicaps };
    if (classKind(target) === 'rya') {
      if (classKind(imported) === 'rya') {
        next.overriddenSchemes = imported.overriddenSchemes ?? [];
        delete next.pyOverridden;
      }
    } else {
      next.isSinglehander = imported.isSinglehander === true;
    }
    return next;
  }

  private uniqueId(id: string, classes: readonly BoatClass[]): string {
    let candidate = id;
    for (let n = 2; classes.some(c => c.id === candidate); n++) candidate = `${id}-${n}`;
    return candidate;
  }

  private parseClassRecord(
    record: Record<string, string>,
    schemes: HandicapScheme[],
    catalogue: ReadonlyMap<number, CatalogClass>,
    ratingLists: readonly RatingList[],
    line: number,
  ): ClassCsvRow | string {
    const rowErrors: string[] = [];
    const name = normaliseWhitespace(record['name'] ?? '');
    const id = (record['id'] ?? '').trim();
    const kindRaw = (record['kind'] ?? '').trim().toLowerCase();
    const catalogueRaw = (record['catalogueId'] ?? '').trim();
    const catalogueId = catalogueRaw ? Number(catalogueRaw) : undefined;

    if (!name) rowErrors.push('name is required');
    if (kindRaw && kindRaw !== 'rya' && kindRaw !== 'local') rowErrors.push('kind must be rya or local');
    if (catalogueRaw && !Number.isInteger(catalogueId)) rowErrors.push('catalogueId must be a whole number');

    const handicaps: Handicap[] = [];
    for (const scheme of schemes) {
      const raw = (record[this.handicapColumn(scheme)] ?? '').trim();
      if (!raw) continue;
      const value = Number(raw);
      const meta = getHandicapSchemeMetadata(scheme);
      if (!Number.isFinite(value) || value <= 0) {
        rowErrors.push(`${this.handicapColumn(scheme)} must be a positive number if provided`);
        continue;
      }
      if (value < meta.min || value > meta.max) {
        rowErrors.push(`${this.handicapColumn(scheme)} must be between ${meta.min} and ${meta.max}`);
        continue;
      }
      handicaps.push({ scheme, value });
    }

    const kind: ClassKind = kindRaw === 'rya' || (!kindRaw && (catalogueId ?? 0) > 0) ? 'rya' : 'local';
    const overridden = this.parseOverriddenSchemes(record);
    if (typeof overridden === 'string') rowErrors.push(overridden);

    if (kind === 'rya' && rowErrors.length === 0) {
      const entry = catalogueId !== undefined && catalogueId > 0 ? catalogue.get(catalogueId) : undefined;
      if (!entry) {
        rowErrors.push(catalogueId ? `RYA Class ID ${catalogueId} is not in the RYA list` : 'an RYA class needs its catalogueId');
      } else if (entry.name !== name) {
        rowErrors.push(`the RYA class ${catalogueId} is called ${entry.name}`);
      } else {
        const py = getHandicapValue(handicaps, 'PY');
        const pn = currentPn(ratingLists, entry.catalogueId);
        const schemes = overridden as HandicapScheme[] | undefined;
        const pyOverridden = schemes ? schemes.includes('PY') : py !== undefined && py !== pn;
        const others = handicaps.filter(h => h.scheme !== 'PY');
        const boatClass = ryaClubClass(entry, others, pn, pyOverridden || pn === undefined ? py : undefined);
        boatClass.overriddenSchemes = schemes ?? boatClass.overriddenSchemes ?? [];
        return { line, idGiven: !!id, boatClass };
      }
    }

    if (rowErrors.length > 0) {
      return `Line ${line}: ${rowErrors.join('; ')}`;
    }

    return {
      line,
      idGiven: !!id,
      boatClass: {
        id: id || localClassId(name),
        name,
        kind: 'local',
        handicaps,
        isSinglehander: this.parseBoolean(record['isSinglehander']),
      },
    };
  }

  /** Overridden schemes from `overriddenSchemes` (e.g. `PY;IRC`) or the older `pyOverridden` column; undefined when neither is given. */
  private parseOverriddenSchemes(record: Record<string, string>): HandicapScheme[] | string | undefined {
    if ('overriddenSchemes' in record) {
      const names = (record['overriddenSchemes'] ?? '').split(';').map(s => s.trim()).filter(Boolean);
      const unknown = names.filter(n => !(HANDICAP_SCHEMES as readonly string[]).includes(n));
      if (unknown.length > 0) return `overriddenSchemes has unknown schemes: ${unknown.join(', ')}`;
      return names as HandicapScheme[];
    }
    const legacy = (record['pyOverridden'] ?? '').trim();
    return legacy ? (this.parseBoolean(legacy) ? ['PY'] : []) : undefined;
  }

  private handicapColumn(scheme: HandicapScheme): string {
    return `handicap${scheme.replace(/[^a-zA-Z0-9]/g, '')}`;
  }

  private parseBoolean(raw: string | undefined): boolean {
    const value = (raw ?? '').trim().toLowerCase();
    if (!value) return false;
    return value === 'true' || value === '1' || value === 'yes';
  }
}
