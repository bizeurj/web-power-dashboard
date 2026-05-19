'use client';

import { Snapshot, getGa4 } from '@/lib/snapshot-types';
import { fmt, fmtPct, fmtSec } from '@/lib/format';
import { Card, ExecIntro } from '@/components/shared/Card';
import { KpiCard, KpiRow } from '@/components/shared/KpiCard';
import { DataTable, Column } from '@/components/shared/DataTable';

type SourceRow = { sourceMedium: string; sessions: number };
type PageRow = { path: string; views: number; avgSessionDurationSec?: number; bounceRate?: number };

export function WHLPTab({ snapshot }: { snapshot: Snapshot }) {
  const ga4 = getGa4(snapshot);
  // WHLP is the second property in the array (whlp.workhuman.com), if present.
  // Some setups treat it as the same propertyId with a hostname filter — find by name.
  const whlp = ga4?.properties?.find((p) => p.site.includes('whlp')) || ga4?.properties?.[1];

  if (!whlp) {
    return (
      <Card title="Workhuman Live (WHLP)">
        WHLP property not configured in this snapshot. Add a hostname filter or property ID to surface it here.
      </Card>
    );
  }

  const sourceCols: Column<SourceRow>[] = [
    { key: 'sourceMedium', label: 'Source / Medium' },
    { key: 'sessions', label: 'Sessions', align: 'right', render: (r) => fmt(r.sessions) },
  ];

  const pageCols: Column<PageRow>[] = [
    { key: 'path', label: 'Page', render: (r) => <span style={{ fontSize: 12, fontFamily: 'ui-monospace,Menlo,monospace' }}>{r.path}</span> },
    { key: 'views', label: 'Views', align: 'right', render: (r) => fmt(r.views) },
    { key: 'avgSessionDurationSec', label: 'Avg time', align: 'right', render: (r) => fmtSec(r.avgSessionDurationSec), sortValue: (r) => r.avgSessionDurationSec ?? 0 },
    { key: 'bounceRate', label: 'Bounce', align: 'right', render: (r) => fmtPct(r.bounceRate), sortValue: (r) => r.bounceRate ?? 0 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ExecIntro>
        <strong>workhuman.live performance.</strong> Treats WHLP as its own site within the GA4 property. Useful for landing-page campaign tracking and event-driven traffic spikes.
      </ExecIntro>

      <Card title="Headline" accent="rose">
        <KpiRow cols={4}>
          <KpiCard label="Sessions" value={fmt(whlp.headline.current.sessions)} delta={whlp.headline.delta.sessions} hero="rose" />
          <KpiCard label="Users" value={fmt(whlp.headline.current.users)} delta={whlp.headline.delta.users} />
          <KpiCard label="Avg session" value={fmtSec(whlp.headline.current.avgSessionDurationSec)} delta={whlp.headline.delta.avgSessionDurationSec} />
          <KpiCard label="Bounce" value={fmtPct(whlp.headline.current.bounceRate)} delta={whlp.headline.delta.bounceRate} deltaLowerIsBetter />
        </KpiRow>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Source / Medium">
          <DataTable columns={sourceCols} rows={whlp.sources || []} defaultSortKey="sessions" />
        </Card>
        <Card title="Top pages">
          <DataTable columns={pageCols} rows={whlp.pages || []} defaultSortKey="views" pageSize={10} />
        </Card>
      </div>
    </div>
  );
}
