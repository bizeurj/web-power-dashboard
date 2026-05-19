/**
 * In-process orchestrator. Runs all data fetchers in parallel and returns
 * a snapshot object in the same shape as the legacy src/orchestrator.js
 * produced, so the existing DashboardClient renderer keeps working unchanged.
 *
 * This replaces the child_process exec of orchestrator.js — that pattern
 * does not work on Vercel because the function runtime is single-process
 * serverless. Calling the fetcher modules directly is the right model.
 */

import { ensureGoogleCredentials } from './credentials';

// The fetcher modules live in the sibling /src directory of the monorepo.
// next.config.js has experimental.externalDir = true so this import works.
// They are .js (ESM) modules — Next's TS compiler accepts them at runtime.
// We use dynamic imports so the heavy googleapis SDK only loads when refresh
// is actually called (not on every request to the snapshot endpoint).

type FetcherResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

async function settle<T>(p: Promise<T>): Promise<FetcherResult> {
  try {
    const value = await p;
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runAllFetchers(): Promise<{
  schemaVersion: number;
  generatedAt: string;
  runDurationMs: number;
  sources: {
    ga4: unknown;
    profound: unknown;
    gsc: unknown;
  };
}> {
  ensureGoogleCredentials();

  const startedAt = Date.now();

  // Local ESM JS fetchers. These are copies of /src/fetchers/* placed inside
  // web/ so webpack can resolve their npm imports (dotenv, googleapis, etc.)
  // against web/node_modules during the Vercel build. The /src/fetchers/*
  // copies still exist for the local `npm run fetch` CLI workflow.
  // If you change one, mirror the change in the other.
  const ga4Mod = await import('./fetchers/ga4.js');
  const profoundMod = await import('./fetchers/profound.js');
  const gscMod = await import('./fetchers/gsc.js');

  const [ga4Result, profoundResult, gscResult] = await Promise.all([
    settle(ga4Mod.fetchGa4All()),
    settle(profoundMod.fetchProfoundAll()),
    settle(gscMod.fetchGscAll()),
  ]);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runDurationMs: Date.now() - startedAt,
    sources: {
      ga4: ga4Result.ok ? ga4Result.value : { error: ga4Result.error },
      profound: profoundResult.ok ? profoundResult.value : { error: profoundResult.error },
      gsc: gscResult.ok ? gscResult.value : { error: gscResult.error },
    },
  };
}
