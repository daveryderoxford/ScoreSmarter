#!/usr/bin/env node
/**
 * Fetches production ngsw.json and verifies each listed asset hash (sha1).
 * Usage: node scripts/verify-ngsw-hashes.mjs https://ibrsc.ro.scoresmarter.app
 */
import { createHash } from 'node:crypto';

const origin = (process.argv[2] ?? 'https://ibrsc.ro.scoresmarter.app').replace(/\/$/, '');
const ngsw = await (await fetch(`${origin}/ngsw.json`)).json();
const { hashTable } = ngsw;
const urls = Object.keys(hashTable).sort();

let failed = 0;
for (const path of urls) {
  const expected = hashTable[path];
  const res = await fetch(`${origin}${path}`);
  const body = Buffer.from(await res.arrayBuffer());
  const actual = createHash('sha1').update(body).digest('hex');
  const contentType = res.headers.get('content-type') ?? '';
  const ok = actual === expected;
  if (!ok) {
    failed++;
    console.error(`FAIL ${path}`);
    console.error(`  expected: ${expected}`);
    console.error(`  actual:   ${actual}`);
    console.error(`  status:   ${res.status}  type: ${contentType}`);
    if (contentType.includes('text/html') && path.endsWith('.js')) {
      console.error('  ^ likely SPA rewrite returned index.html for a missing chunk');
    }
  }
}

if (failed === 0) {
  console.log(`OK — ${urls.length} assets match ngsw.json at ${origin}`);
} else {
  console.error(`\n${failed} / ${urls.length} assets FAILED`);
  process.exit(1);
}
