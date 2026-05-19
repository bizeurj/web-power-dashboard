/**
 * Snapshot storage abstraction.
 *
 * In production (on Vercel) snapshots live in a PRIVATE Vercel Blob store.
 * Private blobs require the BLOB_READ_WRITE_TOKEN to read, so URLs cannot
 * be useful to anyone who isn't holding the token. We never return URLs
 * from this module; only parsed JSON.
 *
 * In local dev (when BLOB_READ_WRITE_TOKEN is not set) we fall back to the
 * legacy on-disk snapshot at ../data/snapshot.json so the existing
 * orchestrator + artifact workflow keeps working.
 *
 * Layout in Blob:
 *   snapshots/latest.json            — pointer to the newest snapshot
 *   snapshots/YYYY-MM-DD.json        — archived daily snapshot
 *
 * `latest.json` is overwritten on each refresh. Archive blobs are additive
 * so trend history accumulates.
 */

import { put, get, list } from '@vercel/blob';
import fs from 'node:fs/promises';
import path from 'node:path';

const LATEST_KEY = 'snapshots/latest.json';
const ARCHIVE_PREFIX = 'snapshots/';

function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Write a fresh snapshot. Returns nothing — URLs intentionally stay
 * server-side so they can't leak via logs or API responses.
 */
export async function writeSnapshot(snapshot: unknown): Promise<void> {
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
    return;
  }

  // Production: write both blobs to the private store.
  // - access: 'private' matches the store's configured access mode.
  // - addRandomSuffix: false keeps stable keys (latest.json, YYYY-MM-DD.json).
  // - allowOverwrite: true is required for re-writing the same key (latest
  //   gets overwritten every run; archive could be re-written if cron runs
  //   twice in one day).
  await Promise.all([
    put(LATEST_KEY, body, {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    }),
    put(archiveKey, body, {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    }),
  ]);
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

  return readPrivateJson(LATEST_KEY);
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

  return readPrivateJson(`${ARCHIVE_PREFIX}${date}.json`);
}

/**
 * Read a private blob and parse it as JSON. Uses the v2 SDK's get() with
 * access: 'private', which handles token authentication automatically.
 * Returns null if the blob doesn't exist or can't be parsed.
 */
async function readPrivateJson(pathname: string): Promise<unknown | null> {
  try {
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}
