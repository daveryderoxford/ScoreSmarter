import { Injectable } from '@angular/core';
import { isValidSailNumber, normalizeSailNumber } from 'app/boats/model/sail-number';
import type { BoatClass } from 'app/club-tenant/model/boat-class';
import type { ClubTagDefinition } from 'app/club-tenant/model/club-tag';
import type { Race } from 'app/race-calender/model/race';
import type { Series } from 'app/race-calender/model/series';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import {
  describeIdentity,
  entriesMatchIdentity,
  type PerHullIdentity,
} from 'app/results-input/services/series-entry-identity';
import type { Handicap } from 'app/scoring/model/handicap';
import { parseCsv } from 'app/shared/utils/csv';
import { normaliseString } from 'app/shared/utils/string-utils';
import { resolveHandicapsForSeries } from './entry-helpers';

const REQUIRED_FIELDS = ['series', 'class', 'helm', 'sailNumber'] as const;

const HEADER_ALIASES: Record<string, string> = {
  series: 'series',
  seriesname: 'series',
  class: 'class',
  boatclass: 'class',
  helm: 'helm',
  crew: 'crew',
  sailnumber: 'sailNumber',
  sailno: 'sailNumber',
  boatname: 'boatName',
  club: 'club',
  tags: 'tags',
};

export interface EntriesCsvSeriesMapping {
  seriesId: string;
  /** Series name as it appears in the CSV. Empty means use the club series name. */
  csvSeriesName: string;
}

export interface EntriesCsvContext {
  series: readonly Series[];
  races: readonly Race[];
  classes: readonly BoatClass[];
  tagDefinitions: readonly ClubTagDefinition[];
  existingEntriesBySeriesId: ReadonlyMap<string, readonly SeriesEntry[]>;
}

export interface EntriesCsvPlannedEntry {
  lineNumber: number;
  helm: string;
  crew?: string;
  club?: string;
  boatName?: string;
  boatClass: string;
  sailNumber: string;
  tags: string[];
  handicaps: Handicap[];
}

export interface EntriesCsvSeriesPlan {
  seriesId: string;
  seriesName: string;
  races: Race[];
  entries: EntriesCsvPlannedEntry[];
}

export interface EntriesCsvImportPlan {
  errors: string[];
  series: EntriesCsvSeriesPlan[];
  ignoredSeriesNames: string[];
  ignoredRowCount: number;
}

@Injectable({ providedIn: 'root' })
export class EntriesCsvService {
  buildPlan(
    content: string,
    mappings: readonly EntriesCsvSeriesMapping[],
    context: EntriesCsvContext,
  ): EntriesCsvImportPlan {
    const errors: string[] = [];
    const resolved = this.resolveMappings(mappings, context, errors);

    const parsed = parseCsv(content);
    errors.push(...parsed.errors);
    if (parsed.header.length === 0) {
      return emptyPlan(errors);
    }

    const columns = this.mapHeaders(parsed.header, errors);
    if (!columns) {
      return emptyPlan(errors);
    }

    const ignoredNames = new Set<string>();
    let ignoredRowCount = 0;
    const bySeries = new Map<string, EntriesCsvPlannedEntry[]>();
    const seenIdentity = new Map<string, number>();

    for (let i = 0; i < parsed.rows.length; i++) {
      const lineNumber = i + 2;
      const record = parsed.rows[i];
      const fields = this.readFields(record, columns);
      if (this.isBlankRow(fields)) continue;

      const rowErrors: string[] = [];
      const csvSeriesName = fields.series.trim();
      if (!csvSeriesName) rowErrors.push('series name is required');

      const mapping = csvSeriesName
        ? resolved.get(normaliseString(csvSeriesName))
        : undefined;
      if (csvSeriesName && !mapping) {
        ignoredNames.add(csvSeriesName);
        ignoredRowCount++;
        continue;
      }

      const helm = fields.helm.trim();
      if (!helm) rowErrors.push('helm is required');

      const classRaw = fields.class.trim();
      if (!classRaw) rowErrors.push('class is required');
      const boatClass = classRaw ? this.matchClass(classRaw, context.classes) : undefined;
      if (classRaw && !boatClass) {
        rowErrors.push(`unknown class "${classRaw}"`);
      }

      const sailRaw = fields.sailNumber.trim();
      if (!isValidSailNumber(sailRaw)) {
        rowErrors.push('sail number is required');
      }
      const sailNumber = isValidSailNumber(sailRaw) ? normalizeSailNumber(sailRaw) : '';

      const tagResult = this.parseTags(fields.tags, context.tagDefinitions);
      if (tagResult.error) rowErrors.push(tagResult.error);

      if (!mapping || rowErrors.length > 0) {
        errors.push(...rowErrors.map(e => `Line ${lineNumber}: ${e}`));
        continue;
      }

      const identity: PerHullIdentity = {
        boatClass: boatClass!.name,
        sailNumber,
        helm,
      };
      const identityKey = `${mapping.series.id}|${normaliseString(identity.boatClass)}|${sailNumber}|${normaliseString(identity.helm)}`;
      const previousLine = seenIdentity.get(identityKey);
      if (previousLine !== undefined) {
        errors.push(
          `Line ${lineNumber}: duplicate of line ${previousLine} (${describeIdentity(identity)}) in ${mapping.series.name}`,
        );
        continue;
      }
      seenIdentity.set(identityKey, lineNumber);

      const existing = context.existingEntriesBySeriesId.get(mapping.series.id) ?? [];
      if (existing.some(e => entriesMatchIdentity(e, identity))) {
        errors.push(
          `Line ${lineNumber}: ${describeIdentity(identity)} already entered in ${mapping.series.name}`,
        );
        continue;
      }

      const crew = fields.crew.trim() || undefined;
      const club = fields.club.trim() || undefined;
      const boatName = fields.boatName.trim() || undefined;
      const handicaps = resolveHandicapsForSeries(
        mapping.series,
        {
          boatClassName: boatClass!.name,
          personalHandicapUnknown: true,
        },
        [...context.classes],
      );

      const planned: EntriesCsvPlannedEntry = {
        lineNumber,
        helm,
        crew,
        club,
        boatName,
        boatClass: boatClass!.name,
        sailNumber,
        tags: tagResult.ids,
        handicaps,
      };
      const list = bySeries.get(mapping.series.id) ?? [];
      list.push(planned);
      bySeries.set(mapping.series.id, list);
    }

    const series: EntriesCsvSeriesPlan[] = [];
    for (const mapping of resolved.values()) {
      const entries = bySeries.get(mapping.series.id) ?? [];
      if (entries.length === 0) continue;
      series.push({
        seriesId: mapping.series.id,
        seriesName: mapping.series.name,
        races: mapping.races,
        entries,
      });
    }

    return {
      errors,
      series,
      ignoredSeriesNames: [...ignoredNames],
      ignoredRowCount,
    };
  }

  private resolveMappings(
    mappings: readonly EntriesCsvSeriesMapping[],
    context: EntriesCsvContext,
    errors: string[],
  ): Map<string, { series: Series; races: Race[] }> {
    const resolved = new Map<string, { series: Series; races: Race[] }>();
    const seenSeriesIds = new Set<string>();

    for (const mapping of mappings) {
      const seriesId = mapping.seriesId.trim();
      if (!seriesId) {
        errors.push('Each mapping must select a series.');
        continue;
      }
      if (seenSeriesIds.has(seriesId)) {
        errors.push('The same series is mapped more than once.');
        continue;
      }
      seenSeriesIds.add(seriesId);

      const series = context.series.find(s => s.id === seriesId);
      if (!series) {
        errors.push(`Series not found (${seriesId}).`);
        continue;
      }
      if (series.archived) {
        errors.push(`Series "${series.name}" is archived.`);
        continue;
      }

      const races = context.races
        .filter(r => r.seriesId === series.id)
        .slice()
        .sort((a, b) => a.index - b.index);
      if (races.length === 0) {
        errors.push(`Series "${series.name}" has no races.`);
        continue;
      }

      const csvName = mapping.csvSeriesName.trim() || series.name;
      const key = normaliseString(csvName);
      if (!key) {
        errors.push(`CSV series name is empty for "${series.name}".`);
        continue;
      }
      if (resolved.has(key)) {
        errors.push(`CSV series name "${csvName}" is mapped more than once.`);
        continue;
      }
      resolved.set(key, { series, races });
    }

    return resolved;
  }

  private mapHeaders(
    header: string[],
    errors: string[],
  ): Record<string, string> | null {
    const columns: Record<string, string> = {};
    for (const raw of header) {
      const alias = HEADER_ALIASES[normalizeHeader(raw)];
      if (!alias) continue;
      if (columns[alias]) {
        errors.push(`Duplicate column for ${alias}.`);
        return null;
      }
      columns[alias] = raw;
    }

    const missing = REQUIRED_FIELDS.filter(f => !columns[f]);
    if (missing.length > 0) {
      errors.push(`Missing required columns: ${missing.join(', ')}.`);
      return null;
    }
    return columns;
  }

  private readFields(
    record: Record<string, string>,
    columns: Record<string, string>,
  ): Record<(typeof REQUIRED_FIELDS)[number] | 'crew' | 'club' | 'tags' | 'boatName', string> {
    const get = (key: string) => (columns[key] ? record[columns[key]] ?? '' : '');
    return {
      series: get('series'),
      class: get('class'),
      helm: get('helm'),
      sailNumber: get('sailNumber'),
      crew: get('crew'),
      club: get('club'),
      tags: get('tags'),
      boatName: get('boatName'),
    };
  }

  private isBlankRow(
    fields: Record<string, string>,
  ): boolean {
    return Object.values(fields).every(v => !v.trim());
  }

  private matchClass(raw: string, classes: readonly BoatClass[]): BoatClass | undefined {
    const key = normaliseString(raw);
    return classes.find(c => normaliseString(c.name) === key);
  }

  private parseTags(
    raw: string,
    definitions: readonly ClubTagDefinition[],
  ): { ids: string[]; error?: string } {
    const parts = raw
      .split(/[;,]/)
      .map(p => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return { ids: [] };

    const ids: string[] = [];
    const unknown: string[] = [];
    for (const part of parts) {
      const match = definitions.find(t => t.id.toLowerCase() === part.toLowerCase());
      if (!match) {
        unknown.push(part);
        continue;
      }
      if (!ids.includes(match.id)) ids.push(match.id);
    }
    if (unknown.length > 0) {
      return { ids: [], error: `unknown tag id${unknown.length === 1 ? '' : 's'} ${unknown.map(t => `"${t}"`).join(', ')}` };
    }
    return { ids };
  }
}

function normalizeHeader(name: string): string {
  return name.toLowerCase().replace(/[\s_]+/g, '');
}

function emptyPlan(errors: string[]): EntriesCsvImportPlan {
  return { errors, series: [], ignoredSeriesNames: [], ignoredRowCount: 0 };
}
