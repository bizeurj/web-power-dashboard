import { NextResponse, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listSnapshotDates, readSnapshotByDate } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/history?days=30
 * Returns lightweight headline metrics for each available archived snapshot
 * in the last N days. Used by the 30/60/90 comparison view.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get('days') || '90')));
  const allDates = await listSnapshotDates();
  const dates = allDates.slice(0, days);

  type Trace = {
    date: string;
    ga4Sessions?: number;
    ga4Users?: number;
    ga4Bounce?: number;
    gscClicks?: number;
    gscImpressions?: number;
    profoundCitations?: number;
    paidCost?: number;
  };

  const traces: Trace[] = [];
  for (const date of dates) {
    const snap = (await readSnapshotByDate(date)) as
      | {
          sources?: {
            ga4?: { properties?: Array<{ headline?: { current?: { sessions?: number; users?: number; bounceRate?: number } }; googleAds?: { headline?: { cost?: number } } }> };
            gsc?: { headline?: { clicks?: number; impressions?: number } };
            profound?: { content?: { topDomains?: Array<[string, number, string?]> } };
          };
        }
      | null;

    const ga4Prop = snap?.sources?.ga4?.properties?.[0];
    const profDomains = snap?.sources?.profound?.content?.topDomains;
    const whDomain = Array.isArray(profDomains)
      ? profDomains.find((d) => Array.isArray(d) && typeof d[0] === 'string' && d[0].toLowerCase().includes('workhuman'))
      : undefined;

    traces.push({
      date,
      ga4Sessions: ga4Prop?.headline?.current?.sessions,
      ga4Users: ga4Prop?.headline?.current?.users,
      ga4Bounce: ga4Prop?.headline?.current?.bounceRate,
      gscClicks: snap?.sources?.gsc?.headline?.clicks,
      gscImpressions: snap?.sources?.gsc?.headline?.impressions,
      profoundCitations: whDomain?.[1],
      paidCost: ga4Prop?.googleAds?.headline?.cost,
    });
  }

  // Sort ascending by date for charting.
  traces.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    days,
    snapshots: traces.length,
    traces,
  });
}
