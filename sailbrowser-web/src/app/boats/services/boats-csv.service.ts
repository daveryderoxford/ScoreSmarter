import { Injectable } from '@angular/core';
import { Boat } from '../model/boat';
import { Handicap } from 'app/scoring/model/handicap';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getHandicapValue } from 'app/scoring/model/handicap';
import { normaliseString } from 'app/shared/utils/string-utils';
import { parseCsv, toCsv } from 'app/shared/utils/csv';
import { getHandicapSchemeMetadata } from 'app/scoring/model/handicap-scheme-metadata';
import type { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';

const BASE_COLUMNS = ['id', 'boatClass', 'sailNumber', 'helm', 'crew', 'name', 'isClub', 'personalHandicapBand'] as const;
const ALLOWED_PERSONAL_BANDS = new Set<PersonalHandicapBand>([
  'Band0',
  'Band1',
  'Band2',
  'Band3',
  'Band4',
  'Band5',
]);

export interface BoatsCsvParseResult {
  boats: Partial<Boat>[];
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class BoatsCsvService {
  buildCsv(boats: Boat[], schemes: HandicapScheme[]): string {
    const handicapColumns = schemes.map(s => this.handicapColumn(s));
    const columns = [...BASE_COLUMNS, ...handicapColumns];
    const rows = boats.map(boat => {
      const row: Record<string, string> = {
        id: boat.id,
        boatClass: boat.boatClass ?? '',
        sailNumber: String(boat.sailNumber ?? ''),
        helm: boat.helm ?? '',
        crew: boat.crew ?? '',
        name: boat.name ?? '',
        isClub: boat.isClub ? 'true' : 'false',
        personalHandicapBand: boat.personalHandicapBand ?? '',
      };
      for (const scheme of schemes) {
        const value = getHandicapValue(boat.handicaps, scheme);
        row[this.handicapColumn(scheme)] = value == null ? '' : String(value);
      }
      return row;
    });
    return toCsv(columns, rows);
  }

  parseCsv(content: string, schemes: HandicapScheme[]): BoatsCsvParseResult {
    const parsed = parseCsv(content);
    const errors: string[] = [...parsed.errors];
    const headerColumns = parsed.header;
    if (headerColumns.length === 0) {
      return { boats: [], errors: parsed.errors };
    }
    const requiredColumns = [...BASE_COLUMNS];
    const handicapColumns = schemes.map(s => this.handicapColumn(s));
    const expectedColumns = [...requiredColumns, ...handicapColumns];
    const missing = expectedColumns.filter(c => !headerColumns.includes(c));
    if (missing.length > 0) {
      return { boats: [], errors: [`Missing required columns: ${missing.join(', ')}`] };
    }

    const boats: Partial<Boat>[] = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const record = parsed.rows[i];
      const rowResult = this.parseBoatRecord(record, schemes, i + 2);
      if (rowResult.error) {
        errors.push(rowResult.error);
      } else if (rowResult.boat) {
        boats.push(rowResult.boat);
      }
    }
    return { boats, errors };
  }

  tripletKey(boat: Pick<Boat, 'boatClass' | 'sailNumber' | 'helm'>): string {
    return `${normaliseString(boat.boatClass)}|${boat.sailNumber}|${normaliseString(boat.helm)}`;
  }

  private parseBoatRecord(
    record: Record<string, string>,
    schemes: HandicapScheme[],
    lineNumber: number
  ): { boat?: Partial<Boat>; error?: string } {
    const rowErrors: string[] = [];
    const boatClass = (record['boatClass'] ?? '').trim();
    const sailRaw = (record['sailNumber'] ?? '').trim();
    const helm = (record['helm'] ?? '').trim();
    const crew = (record['crew'] ?? '').trim();
    const name = (record['name'] ?? '').trim();
    const id = (record['id'] ?? '').trim();
    const isClubRaw = (record['isClub'] ?? '').trim();
    const isClub = this.parseBool(isClubRaw);
    const personalHandicapBandRaw = (record['personalHandicapBand'] ?? '').trim();
    const sailNumber = Number(sailRaw);

    if (!boatClass) rowErrors.push('boatClass is required');
    if (!Number.isFinite(sailNumber) || sailNumber <= 0 || !Number.isInteger(sailNumber)) {
      rowErrors.push('sailNumber must be a positive integer');
    }
    if (isClubRaw && isClub == null) {
      rowErrors.push('isClub must be true/false (also accepts 1/0/yes/no/y/n)');
    }
    if (
      personalHandicapBandRaw &&
      personalHandicapBandRaw.toLowerCase() !== 'unknown' &&
      !ALLOWED_PERSONAL_BANDS.has(personalHandicapBandRaw as PersonalHandicapBand)
    ) {
      rowErrors.push('personalHandicapBand must be one of Band0..Band5 or unknown');
    }

    const isClubBool = isClub ?? false;
    if (!isClubBool && !helm) {
      rowErrors.push('helm is required for non-club boats');
    }

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

    const band: PersonalHandicapBand | undefined =
      !personalHandicapBandRaw || personalHandicapBandRaw.toLowerCase() === 'unknown'
        ? undefined
        : (personalHandicapBandRaw as PersonalHandicapBand);

    const boat: Partial<Boat> = {
      boatClass,
      sailNumber,
      helm,
      crew,
      name,
      isClub: isClubBool,
      personalHandicapBand: band,
      handicaps,
    };
    if (id) {
      boat.id = id;
    }
    return { boat };
  }

  private parseBool(raw: string): boolean | undefined {
    const norm = raw.trim().toLowerCase();
    if (!norm) return undefined;
    if (norm === 'true' || norm === '1' || norm === 'yes' || norm === 'y') return true;
    if (norm === 'false' || norm === '0' || norm === 'no' || norm === 'n') return false;
    return undefined;
  }

  private handicapColumn(scheme: HandicapScheme): string {
    return `handicap${scheme.replace(/[^a-zA-Z0-9]/g, '')}`;
  }
}

