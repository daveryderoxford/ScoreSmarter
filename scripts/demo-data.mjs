/**
 * Demo club data: builds the anonymised baseline the nightly demo reset restores, uploads
 * the training scoring sheet, and can run the reset immediately.
 *
 * The baseline is a copy of a real club's racing data with people's names replaced by
 * consistent fake names (the same person always gets the same fake name). User ids are
 * removed and scoring sheet photos are not copied. Demo users, kiosks and the duty
 * roster are never touched. See firebase/functions/src/demo/ for the reset itself.
 *
 * Needs `npm run build` in firebase/functions, and credentials, e.g.
 *   GOOGLE_APPLICATION_CREDENTIALS=~/private/scoresmarter/admin-key.json node scripts/demo-data.mjs ...
 *
 *   node scripts/demo-data.mjs                         # dry run: summarise the baseline from ibrsc
 *   node scripts/demo-data.mjs --export                # write the baseline to Storage
 *   node scripts/demo-data.mjs --training-sheet scripts/demo-training-sheet.json
 *   node scripts/demo-data.mjs --reset                 # reset the demo club now
 *   node scripts/demo-data.mjs --from ibrsc --export --reset
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const FUNCTIONS = new URL('../firebase/functions/', import.meta.url);
const LIB = new URL('lib/demo/', FUNCTIONS);
if (!existsSync(new URL('reset-demo.js', LIB))) {
  throw new Error('Build the functions first: (cd firebase/functions && npm run build)');
}

const require = createRequire(new URL('package.json', FUNCTIONS));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

initializeApp({ projectId: 'sailbrowser-efef0', storageBucket: 'sailbrowser-efef0.appspot.com' });

const {
  BASELINE_CLUB_FIELDS, BASELINE_FILE, DEMO_CLUB_ID, RESTORED_COLLECTIONS,
  TRAINING_SHEET_FILE, encodeValue,
} = await import(new URL('demo-baseline.js', LIB));
const { resetDemoClub } = await import(new URL('reset-demo.js', LIB));

const NAME_KEYS = new Set(['helm', 'crew', 'crewOverride', 'raceOfficer']);
const DROP_KEYS = new Set(['enteredByUid', 'createdBy', 'updatedBy']);

const FIRST = [
  'Alex', 'Sam', 'Jo', 'Chris', 'Pat', 'Robin', 'Charlie', 'Morgan', 'Jamie', 'Taylor',
  'Ellis', 'Frankie', 'Harper', 'Jordan', 'Kit', 'Lee', 'Max', 'Nicky', 'Quinn', 'Rory',
  'Sasha', 'Toby', 'Viv', 'Will', 'Amy', 'Ben', 'Clara', 'Dan', 'Eve', 'Finn',
  'Grace', 'Hugo', 'Isla', 'Jack', 'Kate', 'Leo', 'Mia', 'Ned', 'Olive', 'Pete',
  'Rosa', 'Seb', 'Tess', 'Ursula', 'Vic', 'Wren', 'Zara', 'Ollie', 'Lily', 'Tom',
];
const LAST = [
  'Ashby', 'Barker', 'Carver', 'Dalton', 'Easton', 'Fairley', 'Garner', 'Holloway', 'Ingram', 'Jarvis',
  'Kendal', 'Lomax', 'Marsden', 'Norris', 'Oakley', 'Pemberton', 'Quarry', 'Radley', 'Sutton', 'Thorne',
  'Upton', 'Vance', 'Whitby', 'Yardley', 'Abbott', 'Blake', 'Crane', 'Dunmore', 'Elwood', 'Fenwick',
  'Gale', 'Hartley', 'Irving', 'Jessop', 'Keel', 'Larkin', 'Moss', 'Newby', 'Orton', 'Pike',
  'Rowe', 'Salter', 'Tide', 'Underwood', 'Vale', 'Wake', 'Bramble', 'Cove', 'Drake', 'Ferry',
];

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const FROM = option('--from', 'ibrsc');
if (FROM === DEMO_CLUB_ID) throw new Error('The source club must not be the demo club');

const db = getFirestore();
const bucket = getStorage().bucket();

const normName = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
const PART_SEPARATOR = /(\s*(?:&|\+|,|\/|\band\b)\s*)/i;

/** Deterministic shuffle so fake names don't follow the alphabetical order of real names. */
function shuffled(items, seed) {
  const out = [...items];
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const nameParts = value => value.split(PART_SEPARATOR).filter((p, i) => i % 2 === 0 && p.trim());

/** Every person name (split on &, +, ',', '/', 'and') found under NAME_KEYS. */
function collectNames(value, names, key = '') {
  if (typeof value === 'string') {
    if (NAME_KEYS.has(key)) nameParts(value).forEach(p => names.add(normName(p)));
  } else if (Array.isArray(value)) {
    value.forEach(v => collectNames(v, names, key));
  } else if (value && typeof value === 'object' && !(value instanceof Timestamp)) {
    for (const [k, v] of Object.entries(value)) collectNames(v, names, k);
  }
}

function buildNameMap(names) {
  const fullNames = shuffled(FIRST.flatMap(f => LAST.map(l => `${f} ${l}`)), 20261023);
  const firstNames = shuffled(FIRST, 7);
  const map = new Map();
  let full = 0;
  let single = 0;
  for (const name of [...names].sort()) {
    if (name.includes(' ')) {
      if (full >= fullNames.length) throw new Error('Too many distinct names for the fake name list');
      map.set(name, fullNames[full++]);
    } else {
      map.set(name, firstNames[single++ % firstNames.length]);
    }
  }
  return map;
}

const fakeName = (value, nameMap) => value
  .split(PART_SEPARATOR)
  .map((part, i) => (i % 2 === 1 || !part.trim() ? part : nameMap.get(normName(part)) ?? part))
  .join('');

/** Copy with names replaced, user ids dropped and scoring sheet photos unlinked. */
function anonymise(value, nameMap, key = '') {
  if (value === null || value === undefined || value instanceof Timestamp) return value;
  if (typeof value === 'string') {
    if (NAME_KEYS.has(key)) return fakeName(value, nameMap);
    // The 'helm' merge strategy keys competitors by `h#` + lower-cased helm.
    if (key === 'competitorKey' && value.startsWith('h#')) return `h#${fakeName(value.slice(2), nameMap).toLowerCase()}`;
    if (key === 'ownerUid') return DEMO_CLUB_ID;
    if (key === 'resultsSheetImage') return '';
    if ((key === 'clubId' || key === 'tenantId') && value === FROM) return DEMO_CLUB_ID;
    return value;
  }
  if (Array.isArray(value)) return value.map(v => anonymise(v, nameMap, key));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (!DROP_KEYS.has(k)) out[k] = anonymise(v, nameMap, k);
    }
    return out;
  }
  return value;
}

/** Anonymised baseline of the source club, keyed by path relative to the club. */
async function buildBaseline() {
  const source = db.doc(`clubs/${FROM}`);
  const clubSnap = await source.get();
  if (!clubSnap.exists) throw new Error(`clubs/${FROM} not found`);

  const raw = new Map();
  for (const name of RESTORED_COLLECTIONS) {
    const snap = await source.collection(name).get();
    for (const doc of snap.docs) {
      raw.set(`${name}/${doc.id}`, doc.data());
      if (name === 'published_series') {
        const races = await doc.ref.collection('races').get();
        races.docs.forEach(r => raw.set(`${name}/${doc.id}/races/${r.id}`, r.data()));
      }
    }
  }
  const club = Object.fromEntries(
    BASELINE_CLUB_FIELDS.filter(f => clubSnap.get(f) !== undefined).map(f => [f, clubSnap.get(f)]),
  );

  const names = new Set();
  raw.forEach(data => collectNames(data, names));
  const nameMap = buildNameMap(names);

  const docs = {};
  for (const [path, data] of raw) docs[path] = encodeValue(anonymise(data, nameMap));
  return {
    baseline: {
      createdAt: new Date().toISOString(),
      sourceClubId: FROM,
      club: encodeValue(anonymise(club, nameMap)),
      docs,
    },
    nameMap,
  };
}

function summarise({ baseline, nameMap }) {
  const counts = {};
  for (const path of Object.keys(baseline.docs)) {
    const top = path.includes('/races/') ? 'published_series/*/races' : path.split('/')[0];
    counts[top] = (counts[top] ?? 0) + 1;
  }
  console.log(`Baseline from clubs/${FROM}:`);
  console.table(counts);
  console.log(`Club fields: ${Object.keys(baseline.club).join(', ')}`);
  const series = Object.entries(baseline.docs)
    .filter(([path]) => path.startsWith('series/'))
    .map(([path, data]) => `${path.slice('series/'.length)}  ${data.name} (season ${data.seasonId})`);
  console.log(`Series (use an id as the training sheet's templateSeriesId):\n  ${series.join('\n  ')}`);
  console.log(`People renamed: ${nameMap.size}; sample: ${[...nameMap.values()].slice(0, 8).join(', ')}`);
  console.log(`Size: ${(JSON.stringify(baseline).length / 1024 / 1024).toFixed(1)} MB`);
}

async function upload(path, contents, contentType) {
  await bucket.file(path).save(contents, { contentType, resumable: false });
  console.log(`Uploaded gs://${bucket.name}/${path}`);
}

async function main() {
  const exporting = flag('--export');
  const sheetPath = option('--training-sheet');
  const resetting = flag('--reset');
  const dryRun = !exporting && !sheetPath && !resetting;

  if (exporting || dryRun) {
    const built = await buildBaseline();
    summarise(built);
    if (exporting) await upload(BASELINE_FILE, JSON.stringify(built.baseline), 'application/json');
    else console.log('\nDry run only. Use --export to save this baseline for the demo reset.');
  }
  if (sheetPath) {
    const sheet = JSON.parse(readFileSync(sheetPath, 'utf8'));
    if (!sheet.templateSeriesId || !Array.isArray(sheet.rows)) {
      throw new Error('Training sheet needs templateSeriesId and rows');
    }
    await upload(TRAINING_SHEET_FILE, JSON.stringify(sheet, null, 2), 'application/json');
  }
  if (resetting) {
    const summary = await resetDemoClub();
    console.log('Demo club reset:', summary);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
