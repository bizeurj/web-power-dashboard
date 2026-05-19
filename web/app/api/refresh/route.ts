import { NextResponse, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runAllFetchers } from '@/lib/runFetchers';
import { writeSnapshot } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel hobby allows up to 60s; pro allows up to 300s. The orchestrator
// usually finishes in 20-40s. Bump if/when we move to a paid plan.
export const maxDuration = 60;

/**
 * POST /api/refresh
 * Runs all fetchers in-process and writes the snapshot to Vercel Blob.
 *
 * Two callers are allowed:
 *   1. The daily Vercel Cron (sends `Authorization: Bearer <CRON_SECRET>`).
 *      This is how the dashboard stays fresh automatically — see vercel.json.
 *   2. A signed-in user clicking the "Refresh data" button in the dashboard.
 *      Useful for ad-hoc pulls when something interesting just shipped.
 *
 * Anyone without one of those credentials gets 401. The cron secret check
 * means the endpoint can be public-routable (Vercel Cron does not carry a
 * NextAuth session) without becoming abusable.
 */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Cron auth: Vercel's scheduler sends Authorization: Bearer <CRON_SECRET>
  // when the env var of that name is set on the project.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization') || '';
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  // Vercel Cron also sets this header on every scheduled invocation as a
  // belt-and-suspenders check.
  if (req.headers.get('x-vercel-cron') === '1' && cronSecret) {
    // x-vercel-cron header alone isn't sufficient — anyone can set a header.
    // We only honor it when CRON_SECRET is also present in the Authorization
    // header above, so this branch is effectively unreachable. Kept here as
    // a documentation note.
  }

  // User auth: signed-in session via NextAuth.
  const session = await getServerSession(authOptions);
  if (session) return true;

  return false;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const snapshot = await runAllFetchers();
    await writeSnapshot(snapshot);

    const sources = snapshot.sources as Record<string, { error?: string } | unknown>;
    const sourceStatus: Record<
      string,
      { status: 'ok' } | { status: 'error'; message: string }
    > = {};
    for (const [name, value] of Object.entries(sources)) {
      if (value && typeof value === 'object' && 'error' in value) {
        const msg = String((value as { error: unknown }).error).slice(0, 800);
        sourceStatus[name] = { status: 'error', message: msg };
        // Mirror to function logs so Vercel Logs view also surfaces the cause.
        console.error(`[refresh] ${name} failed:`, msg);
      } else {
        sourceStatus[name] = { status: 'ok' };
      }
    }

    // Note: we intentionally do NOT return the Blob URLs here. Even though
    // the blobs are private (token-required), keeping URLs out of API
    // responses avoids them leaking into Vercel function logs, browser
    // DevTools, or anywhere else a non-token-holder might glimpse them.
    return NextResponse.json({
      ok: true,
      ranAt: snapshot.generatedAt,
      durationMs: Date.now() - startedAt,
      sources: sourceStatus,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Refresh failed', detail: message }, { status: 500 });
  }
}

/**
 * GET handler for Vercel Cron (it issues GET by default unless configured
 * otherwise). Same logic, same auth.
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
