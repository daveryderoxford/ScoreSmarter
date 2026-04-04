/**
 * Sets Personal handicaps on firebase/data/json/boats.json from IBRSC
 * Wednesday Evening 2025 Master — Personal Fleet summary (Sailwave HTML).
 *
 * Formula (matches Sailwave): Personal PY = round(PY * (1 + 0.05 * band)).
 * - Class suffix " - Band N" → band N
 * - Row in Personal Fleet summary with no band suffix → band 0
 * - No matching row (normalized helm + sail + boat class) → band 3
 */

import fs from 'fs';
import https from 'https';

const ROOT = new URL('..', import.meta.url).pathname;
const BOATS = `${ROOT}/firebase/data/json/boats.json`;
const CLUBS = `${ROOT}/firebase/data/json/clubs.json`;
const SAILWAVE_URL =
  'https://www.islandbarn.org.uk/files/results/2025-2026/wednesday%202025.htm';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      })
      .on('error', reject);
  });
}

function normHelm(s) {
  return s
    .toLowerCase()
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normSail(n) {
  return String(n).trim().toUpperCase();
}

function sailwaveClassToBoatClass(sw) {
  const base = sw.trim();
  const m = {
    'ILCA 7 / Laser': 'ILCA 7',
    'ILCA 6 / Laser Radial': 'ILCA 6',
    'ILCA 4 / Laser 4.7': 'ILCA 4',
    'RS Aero 5': 'Aero 5',
    'RS Aero 6': 'Aero 6',
    'RS Aero 7': 'Aero 7',
    'RS Aero 9': 'Aero 9',
    'ROOSTER 8.1': 'Rooster 8.1',
    Enterprise: 'Enterprise',
    RS200: 'RS200',
    RS400: 'RS400',
    RS600: 'RS600',
    RS300: 'RS300',
    'RS Feva': 'RS Feva',
    Solo: 'Solo',
    Streaker: 'Streaker',
    Topper: 'Topper',
    Blaze: 'Blaze',
    Phantom: 'Phantom',
    'RS Vareo': 'RS Vareo',
    'Hartley 12': 'Hartley 12',
    '29er': '29er',
  };
  return m[base] ?? base;
}

function boatClassToClubId(boatClass) {
  const map = {
    'Rooster 8.1': 'Rooster 8.1',
    'RS Vareo': 'RS Vaero',
  };
  return map[boatClass] ?? boatClass;
}

const HELM_LOOKUP_ALIASES = {
  'patrick pengilly': ['pat pengilly'],
};

function helmLookupKeys(helm) {
  const n = normHelm(helm);
  const keys = [n];
  if (HELM_LOOKUP_ALIASES[n]) keys.push(...HELM_LOOKUP_ALIASES[n]);
  return keys;
}

const EXTRA_PY = {
  'RS100 10.2': 981,
};

function stripTd(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRowTds(tr) {
  const cells = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(tr)) !== null) cells.push(stripTd(m[1]));
  return cells;
}

function extractPersonalSummaryTable(html) {
  const id = 'id="summarypersonal"';
  const i = html.indexOf(id);
  if (i < 0) throw new Error('summarypersonal not found');
  const after = html.slice(i);
  const tableStart = after.indexOf('<table class="summarytable"');
  if (tableStart < 0) throw new Error('personal summary table not found');
  const fromTable = after.slice(tableStart);
  const tableEnd = fromTable.indexOf('</table>');
  return fromTable.slice(0, tableEnd + '</table>'.length);
}

function parsePersonalRowsFromHtml(html) {
  const table = extractPersonalSummaryTable(html);
  const rows = [];
  const trRe = /<tr class="(?:odd|even) summaryrow">([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(table)) !== null) {
    const cells = parseRowTds(m[1]);
    if (cells.length < 7) continue;
    const cls = cells[2];
    const sail = cells[3];
    const helm = cells[4];
    if (!cls || cls === 'Class') continue;
    const bandM = cls.match(/- Band (\d+)\s*$/);
    const explicitBand = bandM ? parseInt(bandM[1], 10) : null;
    const baseClass = cls.replace(/\s*-\s*Band\s+\d+\s*$/, '').trim();
    rows.push({
      sail: normSail(sail),
      helm,
      baseClass,
      boatClass: sailwaveClassToBoatClass(baseClass),
      explicitBand,
    });
  }
  return rows;
}

function buildBandLookup(rows) {
  const map = new Map();
  for (const r of rows) {
    const band =
      r.explicitBand !== null && r.explicitBand !== undefined
        ? r.explicitBand
        : 0;
    for (const hk of helmLookupKeys(r.helm)) {
      const key = `${hk}|${r.sail}|${r.boatClass}`;
      map.set(key, { band });
    }
  }
  return map;
}

function loadIbrscPyByClass() {
  const clubs = JSON.parse(fs.readFileSync(CLUBS, 'utf8'));
  const ibrsc = clubs.find((c) => c.id === 'ibrsc');
  if (!ibrsc) throw new Error('ibrsc club not found');
  const pyById = {};
  for (const cl of ibrsc.classes || []) {
    const py = cl.handicaps?.find((h) => h.scheme === 'PY');
    if (py) pyById[cl.id] = py.value;
  }
  return pyById;
}

function personalValue(py, band) {
  return Math.round(py * (1 + 0.05 * band));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const fileArg = process.argv.find((a) => a.endsWith('.htm') || a.endsWith('.html'));
  const html = fileArg && fs.existsSync(fileArg) ? fs.readFileSync(fileArg, 'utf8') : null;
    const sourceHtml = html ?? (await fetchText(SAILWAVE_URL));
    const personalRows = parsePersonalRowsFromHtml(sourceHtml);
    const bandLookup = buildBandLookup(personalRows);
    const pyById = loadIbrscPyByClass();

    const boats = JSON.parse(fs.readFileSync(BOATS, 'utf8'));
    let missingPy = [];
    let defaultedBand3 = 0;

    for (const boat of boats) {
      const clubId = boatClassToClubId(boat.boatClass);
      let py = pyById[clubId] ?? EXTRA_PY[boat.boatClass];
      if (py == null) missingPy.push(boat.boatClass);

      const sail = normSail(boat.sailNumber);
      let band = 3;
      let matched = false;
      for (const hk of helmLookupKeys(boat.helm)) {
        const key = `${hk}|${sail}|${boat.boatClass}`;
        if (bandLookup.has(key)) {
          band = bandLookup.get(key).band;
          matched = true;
          break;
        }
      }
      if (!matched) defaultedBand3++;

      if (py == null) continue;

      const value = personalValue(py, band);
      const handicaps = boat.handicaps ? [...boat.handicaps] : [];
      const idx = handicaps.findIndex((h) => h.scheme === 'Personal');
      const entry = { scheme: 'Personal', value };
      if (idx >= 0) handicaps[idx] = entry;
      else handicaps.push(entry);
      boat.handicaps = handicaps;
    }

    const uniqueMissing = [...new Set(missingPy)];
    if (uniqueMissing.length) {
      console.warn('Missing PY in clubs.json (skipped Personal for these classes):', uniqueMissing);
    }
    console.warn(
      `Band lookup: ${bandLookup.size} keys; boats defaulted to band 3: ${defaultedBand3} / ${boats.length}`,
    );

    const out = `${JSON.stringify(boats, null, 1)}\n`;
    if (dryRun) process.stdout.write(out);
    else fs.writeFileSync(BOATS, out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
