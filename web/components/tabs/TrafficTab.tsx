'use client';

import { Snapshot, getGa4, getMainProperty } from '@/lib/snapshot-types';
import { fmt, fmtPct, fmtSec } from '@/lib/format';
import { Card, ExecIntro, SectionTitle } from '@/components/shared/Card';
import { KpiCard, KpiRow } from '@/components/shared/KpiCard';
import { LineSeries, BarSeries, DoughnutSeries, PALETTE } from '@/components/shared/Charts';
import { DataTable, Column } from '@/components/shared/DataTable';

type SourceRow = { sourceMedium: string; sessions: number; engagementRate?: number };
type PageRow = { path: string; title?: string; views: number; avgSessionDurationSec?: number; bounceRate?: number };

export function TrafficTab({ snapshot }: { snapshot: Snapshot }) {
  const ga4 = getGa4(snapshot);
  const wh = getMainProperty(ga4);

  if (!wh) {
    return <Card title="Web Traffic">GA4 data not available.</Card>;
  }

  const sourceCols: Column<SourceRow>[] = [
    { key: 'sourceMedium', label: 'Source / Medium' },
    { key: 'sessions', label: 'Sessions', align: 'right', render: (r) => fmt(r.sessions) },
    {
      key: 'engagementRate',
      label: 'Engagement',
      align: 'right',
      render: (r) => fmtPct(r.engagementRate),
      sortValue: (r) => r.engagementRate ?? 0,
    },
  ];

  const pageCols: Column<PageRow>[] = [
    {
      key: 'path',
      label: 'Page',
      render: (r) => (
        <div>
          <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11.5 }}>{r.path}</div>
          {r.title && <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{r.title}</div>}
        </div>
      ),
    },
    { key: 'views', label: 'Views', align: 'right', render: (r) => fmt(r.views) },
    {
      key: 'avgSessionDurationSec',
      label: 'Avg time',
      align: 'right',
      render: (r) => fmtSec(r.avgSessionDurationSec),
      sortValue: (r) => r.avgSessionDurationSec ?? 0,
    },
    {
      key: 'bounceRate',
      label: 'Bounce',
      align: 'right',
      render: (r) => fmtPct(r.bounceRate),
      sortValue: (r) => r.bounceRate ?? 0,
    },
  ];

  const topSources = (wh.sources || []).slice(0, 12);
  const sourceTotal = topSources.reduce((s, r) => s + r.sessions, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ExecIntro>
        <strong>Web traffic detail.</strong> Sessions, source mix, and the top pages driving the bulk of attention.{' '}
        Use this to see which content is doing the heavy lifting and where the audience is coming from.
      </ExecIntro>

      <Card title="Headline KPIs">
        <KpiRow cols={4}>
          <KpiCard label="Sessions" value={fmt(wh.headline.current.sessions)} delta={wh.headline.delta.sessions} hero="purple" />
          <KpiCard label="Users" value={fmt(wh.headline.current.users)} delta={wh.headline.delta.users} />
          <KpiCard label="Pages/session" value={(wh.headline.current.pagesPerSession ?? 0).toFixed(2)} />
          <KpiCard label="Engagement" value={fmtPct(wh.headline.current.engagementRate)} delta={wh.headline.delta.engagementRate} />
        </KpiRow>
      </Card>

      <Card title="30-day session trend">
        <LineSeries
          labels={wh.daily.map((_, i) => `D${i + 1}`)}
          series={[
            { name: 'Last 30d', data: wh.daily, color: PALETTE.primary, fill: true },
            { name: 'Prior 30d', data: wh.dailyPrior, color: PALETTE.neutral },
          ]}
          height={260}
          yFormatter={(n) => fmt(n)}
        />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Source / Medium mix">
          <DoughnutSeries
            labels={topSources.slice(0, 8).map((s) => s.sourceMedium)}
            values={topSources.slice(0, 8).map((s) => s.sessions)}
            height={240}
          />
          <SectionTitle>Full table</SectionTitle>
          <DataTable
            columns={sourceCols}
            rows={topSources}
            defaultSortKey="sessions"
          />
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
            {topSources.length} sources accounting for {fmt(sourceTotal)} sessions.
          </div>
        </Card>

        <Card title="Top pages">
          <DataTable
            columns={pageCols}
            rows={wh.pages.slice(0, 15)}
            defaultSortKey="views"
            pageSize={10}
          />
        </Card>
      </div>

      {wh.monthly && wh.monthly.length > 0 && (
        <Card title="Monthly history">
          <BarSeries
            labels={wh.monthly.map((m) => m.yearMonth)}
            series={[{ name: 'Sessions', data: wh.monthly.map((m) => m.sessions), color: PALETTE.primary }]}
            height={220}
            yFormatter={(n) => fmt(n)}
          />
        </Card>
      )}
    </div>
  );
}
