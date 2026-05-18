/**
 * Bootstraps Google service-account credentials for serverless execution.
 *
 * Locally we use GOOGLE_APPLICATION_CREDENTIALS pointing to a JSON file on
 * disk. On Vercel that file does not exist, so we instead read the full
 * service-account JSON from GOOGLE_APPLICATION_CREDENTIALS_JSON, decode it,
 * write it to /tmp at cold start, and point the GOOGLE_APPLICATION_CREDENTIALS
 * env var at the temp file. The Google client libraries then pick it up
 * via Application Default Credentials with zero changes to the fetchers.
 *
 * The JSON env var can be raw JSON or base64-encoded JSON (we auto-detect).
 * Base64 is recommended because the raw JSON contains newlines in the
 * private_key field that some env-var UIs mangle.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let initialized = false;

export function ensureGoogleCredentials(): void {
  if (initialized) return;
  initialized = true;

  // If GOOGLE_APPLICATION_CREDENTIALS already points to a real file, do nothing.
  const existing = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (existing && fs.existsSync(existing)) return;

  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) {
    // No inline creds, no file. The fetcher will throw a clearer error when
    // it tries to authenticate. We don't throw here so unrelated routes
    // (e.g. /api/auth/*) still work.
    return;
  }

  let json: string;
  if (raw.trim().startsWith('{')) {
    json = raw;
  } else {
    json = Buffer.from(raw, 'base64').toString('utf8');
  }

  // Sanity check
  try {
    JSON.parse(json);
  } catch (err) {
    throw new Error(
      `GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON (after optional base64 decode): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const tmpFile = path.join(os.tmpdir(), 'workhuman-dashboard-sa.json');
  fs.writeFileSync(tmpFile, json, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpFile;
}
