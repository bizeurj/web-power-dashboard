// ---------------------------------------------------------------
// Verifier
// Loads data/snapshot.json and prints a compact human-readable summary
// so you can sanity-check the numbers against the GA4 and Profound UIs
// before trusting the dashboard.
// ---------------------------------------------------------------

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAPSHOT_PATH = path.resolve(__dirname, '..', 'data', 'snapshot.json');

function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(1)}%`;
}
function fmtSec(n) {
  if (!n) return '0s';
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

const raw = await fs.readFile(SNAPSHOT_PATH, 'utf8');
const snap = JSON.parse(raw);

console.log(`Snapshot generated: ${snap.generatedAt}`);
console.log(`Run duration: ${snap.runDurationMs}ms`);
console.log('');

const ga4 = snap.sources.ga4;
if (ga4?.error) {
  console.log(`GA4: FAILED — ${ga4.error}`);
} else if (ga4?.properties) {
  console.log(`GA4: ${ga4.properties.length} properties, ${ga4.lookbackDays}-day window`);
  for (const p of ga4.properties) {
    const h = p.headline.current;
    const d = p.headline.delta;
    console.log(`  ${p.site}`);
    console.log(`    Sessions: ${h.sessions.toLocaleString()} (${fmtPct(d.sessions)})`);
    console.log(`    Users:    ${h.users.toLocaleString()} (${fmtPct(d.users)})`);
    console.log(`    Bounce:   ${(h.bounceRate * 100).toFixed(1)}% (${fmtPct(d.bounceRate)})`);
    console.log(`    Avg time: ${fmtSec(h.avgSessionDurationSec)} (${fmtPct(d.avgSessionDurationSec)})`);
    console.log(`    Top source: ${p.sources[0]?.sourceMedium ?? 'n/a'}`);
    console.log(`    Top page:   ${p.pages[0]?.path ?? 'n/a'}`);
  }
}
console.log('');

const pf = snap.sources.profound;
if (pf?.error) {
  console.log(`Profound: FAILED — ${pf.error}`);
} else if (pf?.skipped) {
  console.log(`Profound: skipped (${pf.reason})`);
} else if (pf?.domains) {
  console.log(`Profound: ${pf.domains.length} domains tracked`);
  for (const d of pf.domains) {
    const status = d.errors?.length ? 'partial' : 'ok';
    console.log(`  ${d.domain}: ${status}`);
  }
}
