/**
 * Replaces scoring configurations on retired tag fleets (e.g. "Youth") with divisions.
 * Tag fleets were replaced by divisions; the app no longer offers them.
 *
 * For each series, every additional scoring configuration on a tag fleet becomes a
 * division of the same name scored as a separate series, and entries whose `tags` include
 * the fleet's tag join that division. A configuration that lost its fleet is identified
 * from the published season (published series `<seriesId>_<configId>` on a tag fleet).
 * Changed series are marked dirty so the next publish writes the division standings and
 * removes the old configuration standings. Tag fleets no series uses any more are removed
 * from the club's fleets.
 *
 *   node scripts/migrate-tag-fleets.mjs --club-id ibrsc            # dry run
 *   node scripts/migrate-tag-fleets.mjs --club-id ibrsc --apply
 *
 * --add-division <seriesId>:<tag>:<name> (repeatable) also adds a division to a series
 * whose tag-fleet configuration is already gone, e.g. `s-wednesday-x:youth:Youth`, and
 * puts the entries tagged `<tag>` in it.
 *
 * Needs credentials, e.g. GOOGLE_APPLICATION_CREDENTIALS=~/private/scoresmarter/admin-key.json
 */
import { createRequire } from 'node:module';

const require = createRequire(new URL('../firebase/functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const clubIdx = args.indexOf('--club-id');
const clubId = clubIdx >= 0 ? args[clubIdx + 1] : undefined;
const extraDivisions = args.flatMap((a, i) => {
  if (a !== '--add-division') return [];
  const [seriesId, tag, name] = (args[i + 1] ?? '').split(':');
  if (!seriesId || !tag || !name) {
    console.error(`--add-division needs <seriesId>:<tag>:<name>, got "${args[i + 1]}"`);
    process.exit(1);
  }
  return [{ seriesId, tag, name }];
});
if (!clubId) {
  console.error('Usage: node scripts/migrate-tag-fleets.mjs --club-id <club> [--apply]');
  process.exit(1);
}

initializeApp({ projectId: 'sailbrowser-efef0' });
const db = getFirestore();

/** Default display of a division added in the series form. */
const DIVISION_DISPLAY = { style: 'marker', markerColor: '#1976D2' };

const slug = text => String(text).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'division';
const key = text => String(text ?? '').trim().toLowerCase();

async function main() {
  console.log(apply ? 'APPLYING changes' : 'DRY RUN (pass --apply to write)');
  const clubRef = db.doc(`clubs/${clubId}`);
  const club = (await clubRef.get()).data();
  const fleets = club.fleets ?? [];
  const tagFleets = new Map(fleets.filter(f => f.type === 'Tag').map(f => [f.id, f]));
  console.log(`clubs/${clubId}: tag fleets ${[...tagFleets.values()].map(f => `${f.name} (${f.id})`).join(', ') || 'none'}`);

  const publishedFleetBySeriesId = new Map();
  for (const season of (await clubRef.collection('published_seasons').get()).docs) {
    for (const info of season.get('series') ?? []) publishedFleetBySeriesId.set(info.id, info.fleetId);
  }

  const stillUsed = new Set();
  let changedSeries = 0;
  for (const doc of (await clubRef.collection('series').get()).docs) {
    const series = doc.data();
    const configs = series.secondaryScoringConfigurations ?? [];
    const tagged = [];
    const kept = [];
    for (const config of configs) {
      const fleetId = config.fleet?.id ?? publishedFleetBySeriesId.get(`${doc.id}_${config.id}`);
      const tag = config.fleet && config.fleet.type !== 'Tag' ? undefined : tagFleets.get(fleetId);
      if (tag) tagged.push({ config, tag, recovered: !config.fleet });
      else kept.push(config);
    }
    for (const extra of extraDivisions.filter(e => e.seriesId === doc.id)) {
      tagged.push({ config: { name: `(requested) ${extra.name}`, handicapScheme: series.primaryScoringConfiguration?.handicapScheme }, tag: { name: extra.name, value: extra.tag }, recovered: false });
    }
    if (config0Tag(series.primaryScoringConfiguration, tagFleets)) {
      console.log(`\n  ${series.name} (${doc.id}): PRIMARY scoring is on a tag fleet; left for you to fix`);
      stillUsed.add(series.primaryScoringConfiguration.fleet.id);
    }
    if (tagged.length === 0) continue;
    changedSeries++;

    const divisions = [...(series.divisions ?? [])];
    const divisionForTag = new Map();
    console.log(`\n  ${series.name} (${doc.id})${series.archived ? ' [archived]' : ''}`);
    for (const { config, tag, recovered } of tagged) {
      let division = divisions.find(d => key(d.name) === key(tag.name));
      if (division) {
        console.log(`    "${config.name}" on ${tag.name}${recovered ? ' (fleet recovered from published results)' : ''}: uses existing division ${division.id}`);
      } else {
        division = { id: `D-${slug(tag.value ?? tag.name)}`, name: tag.name, scoreAs: 'separateSeries', display: DIVISION_DISPLAY };
        divisions.push(division);
        console.log(`    "${config.name}" on ${tag.name}${recovered ? ' (fleet recovered from published results)' : ''}: new division ${division.id}`);
      }
      if (config.handicapScheme !== series.primaryScoringConfiguration?.handicapScheme) {
        console.log(`    NOTE: it was scored on ${config.handicapScheme}; divisions score on the primary scheme ${series.primaryScoringConfiguration?.handicapScheme}`);
      }
      divisionForTag.set(key(tag.value ?? tag.name), division.id);
      divisionForTag.set(key(tag.name), division.id);
      divisionForTag.set(key(tag.id), division.id);
    }

    const entries = (await clubRef.collection('series-entries').where('seriesId', '==', doc.id).get()).docs;
    const counts = new Map();
    let withTags = 0;
    let batch = db.batch();
    let pending = 0;
    for (const entry of entries) {
      const tags = entry.get('tags') ?? [];
      if (tags.length > 0) withTags++;
      const current = entry.get('divisions') ?? [];
      const add = [...new Set(tags.map(t => divisionForTag.get(key(t))).filter(Boolean))].filter(id => !current.includes(id));
      if (add.length === 0) continue;
      for (const id of add) counts.set(id, (counts.get(id) ?? 0) + 1);
      if (apply) {
        batch.update(entry.ref, { divisions: [...current, ...add] });
        if (++pending >= 400) {
          await batch.commit();
          batch = db.batch();
          pending = 0;
        }
      }
    }
    const tagCounts = new Map();
    for (const entry of entries) for (const t of entry.get('tags') ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const joined = [...counts].map(([id, n]) => `${id} ${n}`).join(', ') || 'none';
    const tagSummary = [...tagCounts].map(([t, n]) => `${t} ${n}`).join(', ');
    console.log(`    entries: ${entries.length}, with tags ${withTags} (${tagSummary}); joining divisions: ${joined}`);

    if (apply) {
      batch.update(doc.ref, { secondaryScoringConfigurations: kept, divisions, dirty: true });
      await batch.commit();
      console.log('    written');
    }
  }

  const removable = fleets.filter(f => f.type === 'Tag' && !stillUsed.has(f.id));
  console.log(`\n${changedSeries} series to migrate; club tag fleets to remove: ${removable.map(f => f.name).join(', ') || 'none'}`);
  if (apply && removable.length > 0) {
    await clubRef.update({ fleets: fleets.filter(f => !removable.includes(f)) });
    console.log('club fleets written');
  }
}

function config0Tag(config, tagFleets) {
  return config?.fleet?.type === 'Tag' || tagFleets.has(config?.fleet?.id);
}

await main();
