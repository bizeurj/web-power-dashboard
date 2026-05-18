/**
 * Snapshot storage abstraction.
 *
 * In production (on Vercel) snapshots live in Vercel Blob — the serverless
 * filesystem is read-only and ephemeral so we cannot use disk for anything
 * that needs to persist across invocations.
 *
 * In local dev (when BLOB_READ_WRITE_TOKEN is not set) we fall back to the
 * legacy on-disk snapshot at ../data/snapshot.json so the existing
 * orchestrator + artifact workflow keeps working.
 *
 * Layout in Blob:
 *   snapshots/latest.json            — pointer to the newest snapshot
 *   snapshots/YYYY-MM-DD.json        — archived daily snapshot
 *
 * `latest.json` is always overwritten on each refresh. Archive blobs are
 * additive so we accumulate trend history.
 */

import { put, list, head } from '@vercel/blob';
import fs from 'node:fs/promises';
import path from 'node:path';

const LATEST_KEY = 'snapshots/latest.json';
const ARCHIVE_PREFIX = 'snapshots/';

function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Write a fresh snapshot. Saves both the canonical "latest" pointer and a
 * date-stamped archive copy so trend history accumulates.
 */
export async function writeSnapshot(snapshot: unknown): Promise<{ latestUrl: string; archiveUrl: string }> {
  const body = JSON.stringify(snapshot, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  const archiveKey = `${ARCHIVE_PREFIX}${stamp}.json`;

  if (!isBlobConfigured()) {
    // Local dev fallback: write to disk like the old orchestrator did.
    const root = path.resolve(process.cwd(), '..');
    const dataDir = path.join(root, 'data');
    const snapshotsDir = path.join(dataDir, 'snapshots');
    await fs.mkdir(snapshotsDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'snapshot.json'), body);
    await fs.writeFile(path.join(snapshotsDir, `${stamp}.json`), body);
    return {
      latestUrl: `file://${path.join(dataDir, 'snapshot.json')}`,
      archiveUrl: `file://${path.join(snapshotsDir, `${stamp}.json`)}`,
    };
  }

  // Production: write both blobs. addRandomSuffix:false keeps stable keys
  // (latest.json + YYYY-MM-DD.json). In @vercel/blob 0.27.x, putting to an
  // existing pathname overwrites in place by default — no extra flag needed.
  // (If we ever bump to 1.x, add `allowOverwrite: true` to both options.)
  const [latest, archive] = await Promise.all([
    put(LATEST_KEY, body, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    }),
    put(archiveKey, body, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    }),
  ]);

  return { latestUrl: latest.url, archiveUrl: archive.url };
}

/**
 * Read the latest snapshot. Returns null if no snapshot has been written yet.
 */
export async function readLatestSnapshot(): Promise<unknown | null> {
  if (!isBlobConfigured()) {
    const root = path.resolve(process.cwd(), '..');
    const file = path.join(root, 'data', 'snapshot.json');
    try {
      const raw = await fs.readFile(file, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  try {
    const meta = await head(LATEST_KEY);
    const res = await fetch(meta.url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * List archived snapshot dates (newest first). Useful for trend views.
 */
export async function listSnapshotDates(): Promise<string[]> {
  if (!isBlobConfigured()) {
    const dir = path.resolve(process.cwd(), '..', 'data', 'snapshots');
    try {
      const files = await fs.readdir(dir);
      return files
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map((f) => f.replace('.json', ''))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  const result = await list({ prefix: ARCHIVE_PREFIX });
  return result.blobs
    .map((b) => b.pathname.replace(ARCHIVE_PREFIX, '').replace('.json', ''))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse();
}

/**
 * Read a specific dated snapshot. Useful for trend comparisons.
 */
export async function readSnapshotByDate(date: string): Promise<unknown | null> {
  if (!isBlobConfigured()) {
    const file = path.resolve(process.cwd(), '..', 'data', 'snapshots', `${date}.json`);
    try {
      const raw = await fs.readFile(file, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  try {
    const meta = await head(`${ARCHIVE_PREFIX}${date}.json`);
    const res = await fetch(meta.url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
