/**
 * Gives every club class a kind: an RYA class (`kind: 'rya'`, id `rya-<RYA Class ID>`,
 * `pyOverridden` when its PY differs from the catalogue PN) or a local class
 * (`kind: 'local'`, id `local-<slug>`). Class names are never changed: boats, entries,
 * fleets and results refer to classes by name.
 *
 * Reports, and leaves untouched for you to resolve, classes sharing an RYA Class ID or a
 * name. Also reports RYA classes whose name differs from the catalogue name.
 *
 * With --rename-to-catalogue, those RYA classes take the catalogue name (the old name is
 * kept in `formerNames`), and the rename is applied to boats, series entries, the club's
 * BoatClass fleets, the fleets stored in each series' scoring configurations and members'
 * recent boats. Published results keep the names they were published with.
 *
 *   node scripts/migrate-classes.mjs                    # dry run, all clubs
 *   node scripts/migrate-classes.mjs --club-id ibrsc    # dry run, one club
 *   node scripts/migrate-classes.mjs --club-id ibrsc --rename-to-catalogue
 *   node scripts/migrate-classes.mjs --club-id ibrsc --rename-to-catalogue --apply
 *
 * --remove-class-id <id> (repeatable, needs --club-id) removes a class first, e.g. one of
 * two duplicates. Only the class is removed; boats and entries refer to classes by name.
 *
 * --rename-boat-class <old>=<new> (repeatable, needs --club-id) also renames a class name
 * that isn't a club class (e.g. a typo) wherever boats, entries and fleets use it.
 *
 * Needs credentials, e.g. GOOGLE_APPLICATION_CREDENTIALS=~/private/scoresmarter/admin-key.json
 */
import { createRequire } from 'node:module';

const require = createRequire(new URL('../firebase/functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const renameToCatalogue = args.includes('--rename-to-catalogue');
const clubIdx = args.indexOf('--club-id');
const onlyClub = clubIdx >= 0 ? args[clubIdx + 1] : undefined;
const removeIds = args.flatMap((a, i) => (a === '--remove-class-id' ? [args[i + 1]] : []));
const boatClassFixes = new Map(
  args.flatMap((a, i) => (a === '--rename-boat-class' ? [args[i + 1].split('=').map(s => s.trim())] : [])),
);
if ((removeIds.length > 0 || boatClassFixes.size > 0) && !onlyClub) {
  console.error('--remove-class-id and --rename-boat-class need --club-id');
  process.exit(1);
}

initializeApp({ projectId: 'sailbrowser-efef0' });
const db = getFirestore();

const ryaClassId = catalogueId => `rya-${catalogueId}`;
const localClassId = name => {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `local-${slug || 'class'}`;
};
const pyOf = c => (c.handicaps ?? []).find(h => h.scheme === 'PY')?.value;

/** Groups of classes that share `key`, for groups of two or more. */
function duplicates(classes, key) {
  const groups = new Map();
  for (const c of classes) {
    const k = key(c);
    if (k === undefined) continue;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return [...groups.values()].filter(g => g.length > 1);
}

/** Classes after the migration, and the renames (old name -> new name) it makes. */
function migrateClasses(classes, catalogue, report) {
  const renames = new Map();
  const held = new Set();
  for (const group of duplicates(classes, c => (c.catalogueId > 0 ? c.catalogueId : undefined))) {
    report.push(`  DUPLICATE RYA id ${group[0].catalogueId}: ${group.map(c => `"${c.name}" (id "${c.id}", PY ${pyOf(c)})`).join(', ')}`);
    group.forEach(c => held.add(c));
  }
  for (const group of duplicates(classes, c => c.name)) {
    report.push(`  DUPLICATE name "${group[0].name}": ids ${group.map(c => `"${c.id}"`).join(', ')}`);
    group.forEach(c => held.add(c));
  }

  const usedIds = new Set();
  const names = new Set(classes.map(c => c.name));
  const migrated = classes.map(c => {
    if (held.has(c)) return c;
    if (c.catalogueId > 0) {
      const entry = catalogue.get(c.catalogueId);
      let name = c.name;
      if (!entry) {
        report.push(`  "${c.name}": RYA id ${c.catalogueId} is not in the catalogue`);
      } else if (entry.name !== c.name) {
        if (!renameToCatalogue) {
          report.push(`  "${c.name}": catalogue name is "${entry.name}" (name left unchanged)`);
        } else if (names.has(entry.name)) {
          report.push(`  "${c.name}": not renamed, another class is already called "${entry.name}"`);
        } else {
          renames.set(c.name, entry.name);
          names.add(entry.name);
          name = entry.name;
        }
      }
      const pn = typeof entry?.rya?.pn === 'number' ? entry.rya.pn : undefined;
      const id = ryaClassId(c.catalogueId);
      usedIds.add(id);
      const formerNames = name !== c.name ? [...new Set([...(c.formerNames ?? []), c.name])] : c.formerNames;
      return {
        ...c,
        id,
        name,
        kind: 'rya',
        pyOverridden: pn !== undefined && pyOf(c) !== pn,
        ...(formerNames ? { formerNames } : {}),
      };
    }
    let id = localClassId(c.name);
    for (let n = 2; usedIds.has(id); n++) id = `${localClassId(c.name)}-${n}`;
    usedIds.add(id);
    const { catalogueId: _negative, ...rest } = c;
    return { ...rest, id, kind: 'local' };
  });
  return { migrated, renames };
}

/** A fleet with a renamed class, or the fleet unchanged. */
function renameFleet(fleet, renames) {
  if (fleet?.type !== 'BoatClass' || !renames.has(fleet.boatClassId)) return fleet;
  return { ...fleet, boatClassId: renames.get(fleet.boatClassId) };
}

/** Field updates renaming classes in a series' scoring configurations, or undefined. */
function renameSeriesFleets(series, renames) {
  const update = {};
  const primary = series.primaryScoringConfiguration;
  if (primary?.fleet && renameFleet(primary.fleet, renames) !== primary.fleet) {
    update['primaryScoringConfiguration.fleet'] = renameFleet(primary.fleet, renames);
  }
  const secondary = series.secondaryScoringConfigurations ?? [];
  const renamedSecondary = secondary.map(c => (c?.fleet ? { ...c, fleet: renameFleet(c.fleet, renames) } : c));
  if (!same(secondary, renamedSecondary)) update.secondaryScoringConfigurations = renamedSecondary;
  return Object.keys(update).length > 0 ? update : undefined;
}

/** Applies `renames` to the club's boats, series entries, series and members' recent boats. */
async function cascadeRenames(clubRef, renames) {
  const oldNames = [...renames.keys()];
  const counts = { boats: 0, 'series-entries': 0, series: 0, users: 0 };
  let batch = db.batch();
  let pending = 0;
  const queue = async (ref, data) => {
    if (apply) {
      batch.update(ref, data);
      if (++pending >= 400) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
  };

  for (const collection of ['boats', 'series-entries']) {
    for (let i = 0; i < oldNames.length; i += 30) {
      const snap = await clubRef.collection(collection).where('boatClass', 'in', oldNames.slice(i, i + 30)).get();
      for (const doc of snap.docs) {
        await queue(doc.ref, { boatClass: renames.get(doc.get('boatClass')) });
        counts[collection]++;
      }
    }
  }
  for (const doc of (await clubRef.collection('series').get()).docs) {
    const update = renameSeriesFleets(doc.data(), renames);
    if (update) {
      await queue(doc.ref, update);
      counts.series++;
    }
  }
  for (const doc of (await clubRef.collection('users').get()).docs) {
    const boats = doc.get('boats') ?? [];
    const renamed = boats.map(b => (renames.has(b?.boatClass) ? { ...b, boatClass: renames.get(b.boatClass) } : b));
    if (!same(boats, renamed)) {
      await queue(doc.ref, { boats: renamed });
      counts.users++;
    }
  }
  if (apply && pending > 0) await batch.commit();
  return counts;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const catalogueDoc = await db.doc('system/public/reference/classCatalogue').get();
  const catalogue = new Map((catalogueDoc.get('classes') ?? []).map(e => [e.catalogueId, e]));
  console.log(`Catalogue: ${catalogue.size} classes (${catalogueDoc.get('ryaListVersion') ?? 'no version'})`);
  console.log(apply ? 'APPLYING changes' : 'DRY RUN (pass --apply to write)');

  const clubs = onlyClub ? [await db.doc(`clubs/${onlyClub}`).get()] : (await db.collection('clubs').get()).docs;
  for (const club of clubs) {
    if (!club.exists) {
      console.log(`\nclubs/${club.id}: not found`);
      continue;
    }
    const stored = club.get('classes') ?? [];
    const classes = stored.filter(c => !removeIds.includes(c.id));
    const report = [];
    for (const c of stored.filter(c => removeIds.includes(c.id))) {
      report.push(`  REMOVED "${c.name}" (id "${c.id}", PY ${pyOf(c)})`);
    }
    const { migrated, renames } = migrateClasses(classes, catalogue, report);
    for (const [from, to] of boatClassFixes) {
      if (!from || !to || classes.some(c => c.name === from)) {
        report.push(`  --rename-boat-class ${from}=${to} ignored: "${from}" is a club class or the option is malformed`);
        continue;
      }
      const target = renames.get(to) ?? to;
      if (!migrated.some(c => c.name === target)) report.push(`  NOTE "${target}" is not a club class`);
      renames.set(from, target);
      report.push(`  boats etc. using "${from}" will use "${target}"`);
    }
    const changed = migrated.filter((c, i) => !same(c, classes[i]));
    console.log(`\nclubs/${club.id}: ${classes.length} classes, ${changed.length} to update`);
    for (const c of changed) {
      const renamed = c.formerNames?.length ? `  (was "${c.formerNames.at(-1)}")` : '';
      console.log(`  ${c.kind.padEnd(5)} ${c.id.padEnd(12)} ${c.name}${renamed}${c.pyOverridden ? `  (PY ${pyOf(c)} overridden)` : ''}`);
    }
    report.forEach(line => console.log(line));

    const fleets = club.get('fleets') ?? [];
    const renamedFleets = fleets.map(f => renameFleet(f, renames));
    if (renames.size > 0) {
      const fleetCount = renamedFleets.filter((f, i) => f !== fleets[i]).length;
      const counts = await cascadeRenames(club.ref, renames);
      console.log(`  renames: ${renames.size} classes; club fleets ${fleetCount}, boats ${counts.boats}, ` +
        `series entries ${counts['series-entries']}, series ${counts.series}, members' recent boats ${counts.users}`);
    }
    if (apply && (changed.length > 0 || renames.size > 0 || classes.length !== stored.length)) {
      await club.ref.update({ classes: migrated, ...(renames.size > 0 ? { fleets: renamedFleets } : {}) });
      console.log('  written');
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
