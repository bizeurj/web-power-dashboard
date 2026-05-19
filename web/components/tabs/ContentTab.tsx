'use client';

import { useMemo, useState } from 'react';
import { Snapshot, getGa4, getMainProperty, asArray } from '@/lib/snapshot-types';
import { buildContentRows, buildContentDetail, ContentRow, DateRange, RANGE_LABELS } from '@/lib/content-resonance';
import { fmt, fmtPct, fmtSec, fixed } from '@/lib/format';
import { Card, ExecIntro, Insight, SectionTitle } from '@/components/shared/Card';
import { KpiCard, KpiRow } from '@/components/shared/KpiCard';
import { BarSeries, LineSeries, DoughnutSeries, PALETTE } from '@/components/shared/Charts';
import { DataTable, Column } from '@/components/shared/DataTable';
import { DateRangePicker } from '@/components/shared/DateRangePicker';

export function ContentTab({
  snapshot,
  drill,
  setDrill,
}: {
  snapshot: Snapshot;
  drill?: string | null;
  setDrill?: (path: string | null) => void;
}) {
  // Fall back to local state if parent doesn't manage drill (back-compat).
  const [localDrill, setLocalDrill] = useState<string | null>(null);
  const selectedPath = drill !== undefined ? drill : localDrill;
  const select = (p: string | null) => (setDrill ? setDrill(p) : setLocalDrill(p));

  const rows = useMemo(() => buildContentRows(snapshot), [snapshot]);

  if (selectedPath) {
    return (
      <ContentDrillDown
        snapshot={snapshot}
        path={selectedPath}
        onBack={() => select(null)}
      />
    );
  }

  const totals = rows.reduce(
    (s, r) => ({
      pages: s.pages + 1,
      views: s.views + r.views,
      clicks: s.clicks + r.gscClicks,
      llm: s.llm + r.llmSessions,
      cit: s.cit + r.citations,
    }),
    { pages: 0, views: 0, clicks: 0, llm: 0, cit: 0 }
  );

  const owned = rows.filter((r) => r.citations > 0).length;
  const trafficMonopolists = rows.slice(0, 5);
  const trafficShare = totals.views > 0 ? trafficMonopolists.reduce((s, r) => s + r.views, 0) / totals.views : 0;

  const cols: Column<ContentRow>[] = [
    {
      key: 'path',
      label: 'Page',
      render: (r) => (
        <div>
          <div style={{ fontSize: 12, fontFamily: 'ui-monospace,Menlo,monospace' }}>{r.path}</div>
          {r.title && <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{r.title}</div>}
        </div>
      ),
    },
    { key: 'views', label: 'Views', align: 'right', render: (r) => <span style={{ fontWeight: 600 }}>{fmt(r.views)}</span> },
    { key: 'bounceRate', label: 'Bounce', align: 'right', render: (r) => fmtPct(r.bounceRate), sortValue: (r) => r.bounceRate },
    { key: 'avgTimeSec', label: 'Avg time', align: 'right', render: (r) => fmtSec(r.avgTimeSec), sortValue: (r) => r.avgTimeSec },
    { key: 'gscClicks', label: 'GSC clicks', align: 'right', render: (r) => fmt(r.gscClicks) },
    { key: 'llmSessions', label: 'LLM sess', align: 'right', render: (r) => fmt(r.llmSessions) },
    {
      key: 'citations',
      label: 'AEO cit.',
      align: 'right',
      render: (r) => (
        <div>
          <div style={{ fontWeight: r.citations > 0 ? 600 : 400, color: r.citations > 0 ? 'var(--purple-deep)' : 'var(--muted)' }}>
            {fmt(r.citations)}
          </div>
          {r.citationCategory && (
            <div
              style={{
                fontSize: 10,
                color: r.citationCategory === 'owned' ? 'var(--emerald)' : 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {r.citationCategory}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'resonance',
      label: 'Score',
      align: 'right',
      width: 70,
      render: (r) => (
        <span
          title="Composite of views (35%), GSC clicks (35%), LLM sessions (15%), AEO citations (15%)"
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 999,
            background: r.resonance > 60 ? 'var(--emerald-soft)' : r.resonance > 30 ? 'var(--gold-soft)' : 'var(--surface-2)',
            color: r.resonance > 60 ? 'var(--emerald)' : r.resonance > 30 ? 'var(--gold-deep)' : 'var(--muted)',
            fontWeight: 600,
          }}
        >
          {r.resonance}
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ExecIntro>
        <strong>Content resonance.</strong> Every page ranked on a composite of GA4 views, GSC search clicks, LLM-attributed sessions, and AEO citation count.{' '}
        Click any row to drill into traffic context, AI citation breakdown, and time-on-page over a date range you control.
      </ExecIntro>

      <Card title="What is resonating externally" accent="emerald">
        <KpiRow cols={4}>
          <KpiCard label="Pages tracked" value={fmt(totals.pages)} hero="emerald" />
          <KpiCard label="Total GA4 views" value={fmt(totals.views)} hint={`top 5 = ${fmtPct(trafficShare)} of views`} />
          <KpiCard label="GSC clicks" value={fmt(totals.clicks)} />
          <KpiCard label="Pages cited by AI" value={fmt(owned)} hint={`of ${fmt(totals.pages)}`} />
        </KpiRow>

        <Insight tone="emerald" icon="◆">
          Resonance combines four signals: GA4 traffic (35%), GSC clicks (35%), LLM-driven sessions (15%), and AEO citations (15%).{' '}
          Traffic and search clicks weight highest because they are realized attention. LLM sessions and citations weight lower because they are leading indicators — important, but they compound rather than convert directly.
        </Insight>

        <SectionTitle>Ranked content</SectionTitle>
        <DataTable
          columns={cols}
          rows={rows}
          defaultSortKey="views"
          pageSize={20}
          onRowClick={(r) => select(r.path)}
        />
      </Card>
    </div>
  );
}

function ContentDrillDown({
  snapshot,
  path,
  onBack,
}: {
  snapshot: Snapshot;
  path: string;
  onBack: () => void;
}) {
  const [range, setRange] = useState<DateRange>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const detail = useMemo(() => buildContentDetail(snapshot, path), [snapshot, path]);
  const ga4 = getGa4(snapshot);
  const wh = getMainProperty(ga4);

  if (!detail) {
    return (
      <Card title="Page not found">
        <button onClick={onBack} style={backBtn}>← Back to content list</button>
        <div style={{ marginTop: 14, color: 'var(--muted)' }}>{path} is not in the current snapshot.</div>
      </Card>
    );
  }

  const { row, siteSessions, siteGscClicks, topicAppearances, siteDaily } = detail;

  // Date-range filtering — for v1 we filter the visible daily series window
  // since per-page daily data isn't in the snapshot yet. 7d shows the last 7
  // points, 30d shows all 30, 90d shows the last 90 (capped at available),
  // ytd would need historical snapshot retrieval (TODO).
  const filteredDaily = useMemo(() => {
    if (range === '7d') return siteDaily.slice(-7);
    if (range === '30d') return siteDaily;
    if (range === '90d') return siteDaily.slice(-90);
    return siteDaily; // ytd/custom: same fallback for v1
  }, [range, siteDaily]);

  const trafficShareOfSite = siteSessions > 0 ? row.views / siteSessions : 0;
  const clickShareOfSite = siteGscClicks > 0 ? row.gscClicks / siteGscClicks : 0;

  // Build medium breakdown for this page using site-level sources weighted
  // by this page's share of total views (approximation — real per-page
  // medium would need a new fetcher call).
  const whSources = asArray<{ sourceMedium: string; sessions: number }>(wh?.sources);
  const mediumBreakdown = whSources.slice(0, 8).map((s) => ({
    medium: s.sourceMedium,
    estimatedSessions: Math.round(s.sessions * trafficShareOfSite),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={backBtn}>← Back to content list</button>
        <DateRangePicker
          value={range}
          onChange={setRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={(s, e) => {
            setCustomStart(s);
            setCustomEnd(e);
          }}
        />
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
          {range === 'ytd' || range === 'custom'
            ? 'YTD / custom requires historical snapshots (Blob archive); v1 falls back to 30-day window.'
            : RANGE_LABELS[range]}
        </div>
      </div>

      <Card title={row.title || row.path} domain={row.path} accent="emerald">
        <KpiRow cols={4}>
          <KpiCard
            label="GA4 views"
            value={fmt(row.views)}
            hint={`${fmtPct(trafficShareOfSite)} of site sessions`}
            hero="emerald"
          />
          <KpiCard
            label="GSC clicks"
            value={fmt(row.gscClicks)}
            hint={`${fmtPct(clickShareOfSite)} of site clicks`}
          />
          <KpiCard
            label="LLM sessions"
            value={fmt(row.llmSessions)}
            hint="from AI-tool referrers"
          />
          <KpiCard
            label="AEO citations"
            value={fmt(row.citations)}
            hint={row.citationCategory || 'no AI citations'}
            hero="purple"
          />
        </KpiRow>

        <KpiRow cols={3}>
          <KpiCard label="Avg time" value={fmtSec(row.avgTimeSec)} />
          <KpiCard label="Bounce rate" value={fmtPct(row.bounceRate)} />
          <KpiCard label="Resonance" value={`${row.resonance} / 100`} />
        </KpiRow>
      </Card>

      <Card title="Traffic context" accent="default">
        <SectionTitle>Estimated medium breakdown</SectionTitle>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: -6, marginBottom: 8 }}>
          Distributes the page&apos;s {fmt(row.views)} views across site-level source/medium proportions. Per-page exact attribution requires a fetcher upgrade and will land in v1.1.
        </div>
        <BarSeries
          labels={mediumBreakdown.map((m) => m.medium)}
          series={[{ name: 'Est. sessions', data: mediumBreakdown.map((m) => m.estimatedSessions), color: PALETTE.primary }]}
          height={260}
          yFormatter={(n) => fmt(n)}
          horizontal
        />

        <SectionTitle>Daily trend ({RANGE_LABELS[range]})</SectionTitle>
        <LineSeries
          labels={filteredDaily.map((_, i) => `D${i + 1}`)}
          series={[
            { name: 'Site daily sessions', data: filteredDaily, color: PALETTE.primary, fill: true },
          ]}
          height={220}
          yFormatter={(n) => fmt(n)}
        />
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
          v1 shows site-wide daily sessions in the chosen window. Per-page daily granularity needs a dedicated GA4 page-by-day pull which will be added in the next iteration.
        </div>
      </Card>

      <Card title="AI citation share by topic" accent="purple">
        {topicAppearances.length > 0 ? (
          <>
            <DoughnutSeries
              labels={topicAppearances.map((t) => t.topic)}
              values={topicAppearances.map((t) => t.citations)}
              height={260}
            />
            <SectionTitle>Detail</SectionTitle>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f6f8fb' }}>
                  <th style={th}>Topic</th>
                  <th style={{ ...th, textAlign: 'right' }}>Citations</th>
                  <th style={th}>Category</th>
                </tr>
              </thead>
              <tbody>
                {topicAppearances.map((t, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>{t.topic}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(t.citations)}</td>
                    <td style={td}>
                      <span style={{ fontSize: 11, color: t.category === 'owned' ? 'var(--emerald)' : 'var(--muted)' }}>
                        {t.category || 'other'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            This URL doesn&apos;t currently appear as a Profound citation across HR Tech prompts. That&apos;s either an AEO gap to address with content optimization, or this page isn&apos;t the type AI engines surface for buyer-stage prompts.
          </div>
        )}
      </Card>

      <Card title="Search context (GSC)" accent="emerald">
        <KpiRow cols={4}>
          <KpiCard label="Clicks" value={fmt(row.gscClicks)} hero="emerald" />
          <KpiCard label="Impressions" value={fmt(row.gscImpressions)} />
          <KpiCard label="CTR" value={fmtPct(row.gscCtr, 2)} />
          <KpiCard label="Avg position" value={fixed(row.gscPosition, 1, '-')} />
        </KpiRow>
        <Insight tone="info" icon="i">
          Per-page query breakdown will land in v1.1 (requires a per-page GSC query pull). For now, the AI Search tab shows the top queries driving the entire site.
        </Insight>
      </Card>
    </div>
  );
}

const backBtn: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text-2)',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 500,
};

const th: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: 11.5,
  fontWeight: 600,
  color: 'var(--text-2)',
  borderBottom: '1px solid var(--border)',
};

const td: React.CSSProperties = {
  padding: '8px 10px',
};
