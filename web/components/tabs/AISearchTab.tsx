'use client';

import { Snapshot, getGa4, getProfound, getMainProperty, asArray } from '@/lib/snapshot-types';
import { fmt, fmtPct, fmtSec } from '@/lib/format';
import { Card, ExecIntro, Insight, SectionTitle } from '@/components/shared/Card';
import { KpiCard, KpiRow } from '@/components/shared/KpiCard';
import { BarSeries, DoughnutSeries, LineSeries, PALETTE } from '@/components/shared/Charts';
import { DataTable, Column } from '@/components/shared/DataTable';

type Referrer = { brand: string; sessions: number; users?: number; bounceRate?: number; avgSessionDurationSec?: number; pagesPerSession?: number };
type Domain = [string, number, string?];
type Prompt = [string, number];

export function AISearchTab({ snapshot }: { snapshot: Snapshot }) {
  const ga4 = getGa4(snapshot);
  const profound = getProfound(snapshot);
  const wh = getMainProperty(ga4);

  const referrers = asArray<Referrer>(wh?.llm?.referrers);
  const llmSessions = wh?.llm?.totalSessions || 0;
  const llmShare = wh?.llm?.shareOfTraffic || 0;

  const byModel = asArray<[string, number]>(profound?.content?.byModel);
  const topPrompts = asArray<Prompt>(profound?.content?.topPrompts);
  const topDomains = asArray<Domain>(profound?.content?.topDomains);
  const byCategory = asArray<[string, number]>(profound?.content?.byCitationCategory);

  const whDomain = topDomains.find(
    (d) => Array.isArray(d) && typeof d[0] === 'string' && d[0].toLowerCase().includes('workhuman')
  );
  const whRank = whDomain ? topDomains.findIndex((d) => d === whDomain) + 1 : null;

  const referrerCols: Column<Referrer>[] = [
    { key: 'brand', label: 'Engine' },
    { key: 'sessions', label: 'Sessions', align: 'right', render: (r) => fmt(r.sessions) },
    { key: 'users', label: 'Users', align: 'right', render: (r) => fmt(r.users), sortValue: (r) => r.users ?? 0 },
    { key: 'bounceRate', label: 'Bounce', align: 'right', render: (r) => fmtPct(r.bounceRate), sortValue: (r) => r.bounceRate ?? 0 },
    { key: 'avgSessionDurationSec', label: 'Avg time', align: 'right', render: (r) => fmtSec(r.avgSessionDurationSec), sortValue: (r) => r.avgSessionDurationSec ?? 0 },
    { key: 'pagesPerSession', label: 'Pages/s', align: 'right', render: (r) => (r.pagesPerSession ?? 0).toFixed(2), sortValue: (r) => r.pagesPerSession ?? 0 },
  ];

  const domainCols: Column<Domain>[] = [
    { key: '0', label: 'Domain', render: (r) => (
      <span style={{ color: r[2] === 'owned' ? 'var(--emerald)' : r[2] === 'competitor' ? 'var(--bad)' : 'var(--text-2)', fontWeight: r[2] === 'owned' ? 600 : 400 }}>
        {r[0]}
      </span>
    ) },
    { key: '1', label: 'Citations', align: 'right', render: (r) => fmt(r[1]) },
    { key: '2', label: 'Category', render: (r) => r[2] || 'other' },
  ];

  const promptCols: Column<Prompt>[] = [
    { key: '0', label: 'Prompt', render: (r) => <span style={{ fontSize: 12 }}>{r[0]}</span> },
    { key: '1', label: 'Volume', align: 'right', render: (r) => fmt(r[1]) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ExecIntro>
        <strong>AI search visibility.</strong> Two halves: who actually clicks through from LLM tools to your site (GA4 referrers), and where you show up inside AI answers across HR Technology prompts (Profound).{' '}
        Click-through volume is small for now; share-of-voice in AI citations is the leading indicator that compounds.
      </ExecIntro>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <KpiCard label="LLM sessions" value={fmt(llmSessions)} hint="from ChatGPT/Perplexity/Gemini/Claude" hero="teal" />
        <KpiCard label="LLM share of total" value={fmtPct(llmShare, 3)} hint="versus all sessions" />
        <KpiCard label="Workhuman SoV rank" value={whRank ? `#${whRank}` : '—'} hint={whDomain ? `${fmt(whDomain[1])} citations` : 'no data'} hero="purple" />
      </div>

      <Card title="GA4 — sessions from AI engines" accent="teal">
        <DataTable columns={referrerCols} rows={referrers} defaultSortKey="sessions" />
        <Insight tone="info" icon="i">
          These are people who clicked an LLM citation through to workhuman.com. Small absolute numbers are normal — AI search is influence, not direct conversion. Watch the trend.
        </Insight>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Profound — by AI model">
          {byModel.length > 0 ? (
            <DoughnutSeries
              labels={byModel.slice(0, 8).map((m) => m[0])}
              values={byModel.slice(0, 8).map((m) => m[1])}
              height={260}
            />
          ) : (
            <div style={{ color: 'var(--muted)' }}>No model breakdown.</div>
          )}
        </Card>

        <Card title="Profound — citation category mix">
          {byCategory.length > 0 ? (
            <DoughnutSeries
              labels={byCategory.map((c) => c[0])}
              values={byCategory.map((c) => c[1])}
              height={260}
            />
          ) : (
            <div style={{ color: 'var(--muted)' }}>No category data.</div>
          )}
        </Card>
      </div>

      <Card title="Top cited domains in HR Tech prompts" accent="purple">
        <DataTable columns={domainCols} rows={topDomains} defaultSortKey="1" pageSize={15} />
      </Card>

      <Card title="Highest-volume prompts">
        <DataTable columns={promptCols} rows={topPrompts} defaultSortKey="1" pageSize={15} />
      </Card>

      {profound?.ytd && profound.ytd.length > 0 && (
        <Card title="YTD visibility trend">
          <LineSeries
            labels={profound.ytd.map((m) => m[0])}
            series={[
              { name: 'Visibility', data: profound.ytd.map((m) => m[1] * 100), color: PALETTE.purple, fill: true },
            ]}
            height={220}
            yFormatter={(n) => n.toFixed(1) + '%'}
          />
        </Card>
      )}
    </div>
  );
}
