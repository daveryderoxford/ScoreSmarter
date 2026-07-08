import { Injectable } from '@angular/core';
import { BoatClass } from '../model/boat-class';
import { Handicap, getHandicapValue } from 'app/scoring/model/handicap';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getHandicapSchemeMetadata } from 'app/scoring/model/handicap-scheme-metadata';
import { parseCsv, toCsv } from 'app/shared/utils/csv';

const REQUIRED_COLUMNS = ['id', 'name'] as const;
const EXPORT_COLUMNS = ['id', 'name', 'isSinglehander'] as const;

export interface ClassesCsvParseResult {
  classes: Partial<BoatClass>[];
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class ClassesCsvService {
  buildCsv(classes: BoatClass[], schemes: HandicapScheme[]): string {
    const handicapColumns = schemes.map(s => this.handicapColumn(s));
    const columns = [...EXPORT_COLUMNS, ...handicapColumns];
    const rows = classes.map(cls => {
      const row: Record<string, string> = {
        id: cls.id,
        name: cls.name,
        isSinglehander: cls.isSinglehander === true ? 'true' : 'false',
      };
      for (const scheme of schemes) {
        const value = getHandicapValue(cls.handicaps, scheme);
        row[this.handicapColumn(scheme)] = value == null ? '' : String(value);
      }
      return row;
    });
    return toCsv(columns, rows);
  }

  parseCsv(content: string, schemes: HandicapScheme[]): ClassesCsvParseResult {
    const parsed = parseCsv(content);
    const errors: string[] = [...parsed.errors];
    const headerColumns = parsed.header;
    if (headerColumns.length === 0) {
      return { classes: [], errors: parsed.errors };
    }
    const requiredColumns = [...REQUIRED_COLUMNS];
    const handicapColumns = schemes.map(s => this.handicapColumn(s));
    const expectedColumns = [...requiredColumns, ...handicapColumns];
    const missing = expectedColumns.filter(c => !headerColumns.includes(c));
    if (missing.length > 0) {
      return { classes: [], errors: [`Missing required columns: ${missing.join(', ')}`] };
    }

    const classes: Partial<BoatClass>[] = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const record = parsed.rows[i];
      const rowResult = this.parseClassRecord(record, schemes, i + 2);
      if (rowResult.error) {
        errors.push(rowResult.error);
      } else if (rowResult.cls) {
        classes.push(rowResult.cls);
      }
    }
    return { classes, errors };
  }

  private parseClassRecord(
    record: Record<string, string>,
    schemes: HandicapScheme[],
    lineNumber: number
  ): { cls?: Partial<BoatClass>; error?: string } {
    const rowErrors: string[] = [];
    const name = (record['name'] ?? '').trim();
    const id = (record['id'] ?? '').trim();

    if (!name) rowErrors.push('name is required');

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
        rowErrors.push(
          `${this.handicapColumn(scheme)} must be between ${meta.min} and ${meta.max}`
        );
        continue;
      }
      handicaps.push({ scheme, value });
    }

    if (rowErrors.length > 0) {
      return {
        error: `Line ${lineNumber}: ${rowErrors.join('; ')}`,
      };
    }

    const cls: Partial<BoatClass> = {
      name,
      handicaps,
      isSinglehander: this.parseBoolean(record['isSinglehander']),
    };
    if (id) {
      cls.id = id;
    }
    return { cls };
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
