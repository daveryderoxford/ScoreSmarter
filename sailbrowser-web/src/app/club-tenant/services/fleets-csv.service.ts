import { Injectable } from '@angular/core';
import { Fleet } from '../model/fleet';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { parseCsv, toCsv } from 'app/shared/utils/csv';

const COLUMNS = ['id', 'type', 'name', 'boatClassId', 'scheme', 'min', 'max', 'value'] as const;

export interface FleetsCsvParseResult {
  fleets: Partial<Fleet>[];
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class FleetsCsvService {
  buildCsv(fleets: Fleet[]): string {
    const rows = fleets.map(f => {
      const row: Record<string, string> = {
        id: f.id,
        type: f.type,
        name: (f as any).name ?? '',
        boatClassId: (f as any).boatClassId ?? '',
        scheme: (f as any).scheme ?? '',
        min: (f as any).min != null ? String((f as any).min) : '',
        max: (f as any).max != null ? String((f as any).max) : '',
        value: (f as any).value ?? '',
      };
      return row;
    });
    return toCsv([...COLUMNS], rows);
  }

  parseCsv(content: string): FleetsCsvParseResult {
    const parsed = parseCsv(content);
    const errors: string[] = [...parsed.errors];
    const headerColumns = parsed.header;
    if (headerColumns.length === 0) {
      return { fleets: [], errors: parsed.errors };
    }
    const missing = COLUMNS.filter(c => !headerColumns.includes(c));
    if (missing.length > 0) {
      return { fleets: [], errors: [`Missing required columns: ${missing.join(', ')}`] };
    }

    const fleets: Partial<Fleet>[] = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const record = parsed.rows[i];
      const rowResult = this.parseFleetRecord(record, i + 2);
      if (rowResult.error) {
        errors.push(rowResult.error);
      } else if (rowResult.fleet) {
        fleets.push(rowResult.fleet);
      }
    }
    return { fleets, errors };
  }

  private parseFleetRecord(
    record: Record<string, string>,
    lineNumber: number
  ): { fleet?: Partial<Fleet>; error?: string } {
    const rowErrors: string[] = [];
    const type = (record['type'] ?? '').trim() as Fleet['type'];
    const id = (record['id'] ?? '').trim();
    const name = (record['name'] ?? '').trim();
    const boatClassId = (record['boatClassId'] ?? '').trim();
    const scheme = (record['scheme'] ?? '').trim() as HandicapScheme;
    const minRaw = (record['min'] ?? '').trim();
    const maxRaw = (record['max'] ?? '').trim();
    const value = (record['value'] ?? '').trim();

    if (!type) {
      rowErrors.push('type is required');
    } else {
      switch (type) {
        case 'GeneralHandicap':
          // No extra fields needed
          break;
        case 'BoatClass':
          if (!boatClassId) rowErrors.push('boatClassId is required for BoatClass type');
          break;
        case 'HandicapRange':
          if (!name) rowErrors.push('name is required for HandicapRange type');
          if (!scheme) rowErrors.push('scheme is required for HandicapRange type');
          if (!minRaw) rowErrors.push('min is required for HandicapRange type');
          if (!maxRaw) rowErrors.push('max is required for HandicapRange type');
          break;
        case 'Tag':
          if (!name) rowErrors.push('name is required for Tag type');
          if (!value) rowErrors.push('value is required for Tag type');
          break;
        default:
          rowErrors.push(`Unknown fleet type: ${type}`);
      }
    }

    if (rowErrors.length > 0) {
      return {
        error: `Line ${lineNumber}: ${rowErrors.join('; ')}`,
      };
    }

    let fleet: any = { type, id };
    switch (type) {
      case 'GeneralHandicap':
        fleet.name = 'General Handicap';
        break;
      case 'BoatClass':
        fleet.boatClassId = boatClassId;
        break;
      case 'HandicapRange':
        fleet.name = name;
        fleet.scheme = scheme;
        fleet.min = Number(minRaw);
        fleet.max = Number(maxRaw);
        break;
      case 'Tag':
        fleet.name = name;
        fleet.value = value;
        break;
    }

    if (!id) delete fleet.id;
    return { fleet };
  }
}
