export interface CsvParseOutput {
  header: string[];
  rows: Record<string, string>[];
  errors: string[];
}

export function parseCsv(text: string): CsvParseOutput {
  const parsedRows = parseRawRows(text);
  if (parsedRows.length === 0) {
    return { header: [], rows: [], errors: ['CSV file is empty.'] };
  }

  const header = parsedRows[0].values.map(v => v.trim());
  const seen = new Set<string>();
  const dupHeaders = header.filter(h => {
    const key = h.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
  if (dupHeaders.length > 0) {
    return {
      header: [],
      rows: [],
      errors: [`Duplicate header columns: ${[...new Set(dupHeaders)].join(', ')}`],
    };
  }

  const rows: Record<string, string>[] = [];
  const errors: string[] = [];
  for (let i = 1; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    if (row.values.length > header.length) {
      errors.push(`Line ${row.lineNumber}: too many columns.`);
      continue;
    }
    const out: Record<string, string> = {};
    for (let col = 0; col < header.length; col++) {
      out[header[col]] = row.values[col] ?? '';
    }
    rows.push(out);
  }
  return { header, rows, errors };
}

export function toCsv(columns: string[], rows: Array<Record<string, string>>): string {
  const headerLine = columns.map(csvEscape).join(',');
  const dataLines = rows.map(row => columns.map(c => csvEscape(row[c] ?? '')).join(','));
  return [headerLine, ...dataLines].join('\n');
}

interface ParsedCsvRow {
  values: string[];
  lineNumber: number;
}

function parseRawRows(content: string): ParsedCsvRow[] {
  const rows: ParsedCsvRow[] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;
  let lineNumber = 1;
  let rowStartLine = 1;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(current);
      current = '';
      if (row.some(v => v.length > 0)) {
        rows.push({ values: row, lineNumber: rowStartLine });
      }
      row = [];
      lineNumber++;
      rowStartLine = lineNumber;
      continue;
    }

    current += ch;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some(v => v.length > 0)) {
      rows.push({ values: row, lineNumber: rowStartLine });
    }
  }
  return rows;
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

