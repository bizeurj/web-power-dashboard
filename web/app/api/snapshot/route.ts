import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { readLatestSnapshot } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/snapshot
 * Returns the latest snapshot. In production this reads from Vercel Blob.
 * In local dev (no BLOB_READ_WRITE_TOKEN set) the storage layer falls back
 * to the legacy on-disk snapshot so the existing local workflow keeps
 * working without changes.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const snapshot = await readLatestSnapshot();
  if (!snapshot) {
    return NextResponse.json(
      {
        error: 'No snapshot found',
        hint: 'Trigger /api/refresh with the cron secret, or wait for the daily 6am ET cron run.',
      },
      { status: 404 }
    );
  }

  return NextResponse.json(snapshot);
}
