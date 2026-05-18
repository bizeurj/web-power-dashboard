// ---------------------------------------------------------------
// Orchestrator
// Runs all fetchers in parallel, merges into a single snapshot.json,
// and rotates a snapshots/ history folder for trend analysis.
// ---------------------------------------------------------------

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchGa4All } from './fetchers/ga4.js';
import { fetchProfoundAll } from './fetchers/profound.js';
import { fetchGscAll } from './fetchers/gsc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');

async function ensureDirs() {
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
}

async function rotateSnapshots(retentionDays) {
  const cutoff = Date.now() - retentionDays * 86400 * 1000;
  const files = await fs.readdir(SNAPSHOTS_DIR);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const fp = path.join(SNAPSHOTS_DIR, f);
    const stat = await fs.stat(fp);
    if (stat.mtimeMs < cutoff) {
      await fs.unlink(fp);
    }
  }
}

async function settleAll(promises) {
  const results = await Promise.allSettled(promises);
  return results.map(r =>
    r.status === 'fulfilled'
      ? { ok: true, value: r.value }
      : { ok: false, error: String(r.reason?.message ?? r.reason) }
  );
}

async function main() {
  await ensureDirs();

  const startedAt = new Date();
  console.log(`[orchestrator] starting run at ${startedAt.toISOString()}`);

  const [ga4Result, profoundResult, gscResult] = await settleAll([
    fetchGa4All(),
    fetchProfoundAll(),
    fetchGscAll(),
  ]);

  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runDurationMs: Date.now() - startedAt.getTime(),
    sources: {
      ga4: ga4Result.ok ? ga4Result.value : { error: ga4Result.error },
      profound: profoundResult.ok ? profoundResult.value : { error: profoundResult.error },
      gsc: gscResult.ok ? gscResult.value : { error: gscResult.error },
    },
  };

  // Write the canonical "current" snapshot the artifact reads.
  const currentPath = path.join(DATA_DIR, 'snapshot.json');
  await fs.writeFile(currentPath, JSON.stringify(snapshot, null, 2));

  // Also archive a date-stamped copy for trend history.
  const stamp = startedAt.toISOString().slice(0, 10);
  const archivePath = path.join(SNAPSHOTS_DIR, `${stamp}.json`);
  await fs.writeFile(archivePath, JSON.stringify(snapshot, null, 2));

  // Prune old archives.
  const retention = Number(process.env.SNAPSHOT_RETENTION_DAYS ?? 90);
  await rotateSnapshots(retention);

  console.log(`[orchestrator] wrote ${currentPath}`);
  console.log(`[orchestrator] archived ${archivePath}`);
  console.log(
    `[orchestrator] ga4=${ga4Result.ok ? 'ok' : 'FAIL'} profound=${profoundResult.ok ? 'ok' : 'FAIL'} gsc=${gscResult.ok ? 'ok' : 'FAIL'}`
  );

  // Surface partial failure but don't hard-exit, so the artifact still
  // gets a snapshot with whatever did succeed.
  if (!ga4Result.ok) console.error('[orchestrator] ga4 error:', ga4Result.error);
  if (!profoundResult.ok) console.error('[orchestrator] profound error:', profoundResult.error);
  if (!gscResult.ok) console.error('[orchestrator] gsc error:', gscResult.error);
}

main().catch(err => {
  console.error('[orchestrator] fatal:', err);
  process.exit(1);
});
